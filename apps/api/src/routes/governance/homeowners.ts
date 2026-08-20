import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, ilike, isNull, lte, gte, or } from "drizzle-orm";
import {
  addHomeownerInput,
  type HomeownerImportSkippedRow,
} from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import { homeowners, units, unitOwnerships } from "../../db/schema/dues.js";
import { communityMembers } from "../../db/schema/tenancy.js";
import { communityActivation } from "../../db/schema/activation.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { parseRosterCsv } from "../../domain/governance/rosterImport.js";
import { captureEvent } from "../../lib/observability.js";
import {
  assertFeatureTier,
  assertHomeLimit,
  requireCapability,
} from "../../domain/policy/access.js";
import { acquireXactLock, homeLockKey } from "../../domain/policy/locks.js";

type Variables = { userId: string };
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

async function requireMembership(
  db: ReturnType<typeof createDb>,
  communityId: string,
  userId: string,
) {
  const [m] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    );
  if (!m) throw new Error("forbidden");
  return m;
}

async function requireWriteMembership(
  db: ReturnType<typeof createDb>,
  communityId: string,
  userId: string,
) {
  return requireCapability(db, communityId, userId, "homeowner:write");
}

router.get("/governance/homeowners", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId required" }, 400);
  const db = createDb(c.env);
  try {
    await requireMembership(db, communityId, c.get("userId"));
  } catch {
    return c.json({ error: "Forbidden" }, 403);
  }

  const search = c.req.query("search");
  const conditions: ReturnType<typeof eq>[] = [
    eq(homeowners.communityId, communityId),
    eq(homeowners.active, true),
  ];
  if (search) conditions.push(ilike(homeowners.lastName, `%${search}%`));

  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: homeowners.id,
      communityId: homeowners.communityId,
      firstName: homeowners.firstName,
      lastName: homeowners.lastName,
      email: homeowners.email,
      phone: homeowners.phone,
      moveInDate: homeowners.moveInDate,
      active: homeowners.active,
      createdAt: homeowners.createdAt,
      updatedAt: homeowners.updatedAt,
      unitId: unitOwnerships.unitId,
      unitNumber: units.unitNumber,
    })
    .from(homeowners)
    .leftJoin(
      unitOwnerships,
      and(
        eq(unitOwnerships.homeownerId, homeowners.id),
        eq(unitOwnerships.primary, true),
        lte(unitOwnerships.startDate, today),
        or(isNull(unitOwnerships.endDate), gte(unitOwnerships.endDate, today)),
      ),
    )
    .leftJoin(
      units,
      and(eq(units.id, unitOwnerships.unitId), eq(units.active, true)),
    )
    .where(and(...conditions));
  const dedupedRows = Array.from(
    rows
      .reduce((byHomeowner, row) => {
        if (!byHomeowner.has(row.id)) {
          byHomeowner.set(row.id, row);
        }
        return byHomeowner;
      }, new Map<string, (typeof rows)[number]>())
      .values(),
  );
  return c.json({ homeowners: dedupedRows });
});

router.post("/governance/homeowners/import", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId required" }, 400);
  const db = createDb(c.env);
  let membership: Awaited<ReturnType<typeof requireWriteMembership>>;
  try {
    membership = await requireWriteMembership(db, communityId, c.get("userId"));
  } catch {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Tier enforcement runs before any CSV parsing so an under-privileged caller
  // cannot probe parse-error behaviour on a community above their tier.
  await assertFeatureTier(db, communityId, "owner-operations");

  const csvText = await c.req.text();
  const { rows, rowNumbers, errors: parseErrors } = parseRosterCsv(csvText);

  if (rows.length === 0 && parseErrors.length > 0) {
    const skipped: HomeownerImportSkippedRow[] = parseErrors.map((e) => ({
      row: e.row,
      email: "",
      reason: "invalid" as const,
    }));
    return c.json({ created: 0, skipped }, 422);
  }

  const skipped: HomeownerImportSkippedRow[] = [];

  // Collect invalid parse errors as skipped rows
  for (const e of parseErrors) {
    skipped.push({ row: e.row, email: "", reason: "invalid" });
  }

  const seenEmails = new Set<string>();
  const uniqueRows: Array<{
    rowNumber: number;
    data: (typeof rows)[number];
    normalizedEmail: string;
  }> = [];
  for (const [index, row] of rows.entries()) {
    const normalizedEmail = row.email.trim().toLowerCase();
    if (seenEmails.has(normalizedEmail)) {
      skipped.push({
        row: rowNumbers[index] ?? index + 2,
        email: row.email,
        reason: "duplicate-in-upload",
      });
      continue;
    }
    seenEmails.add(normalizedEmail);
    uniqueRows.push({
      rowNumber: rowNumbers[index] ?? index + 2,
      data: row,
      normalizedEmail,
    });
  }

  const existingEmails = new Set<string>();
  if (uniqueRows.length > 0) {
    const existingRows = await db
      .select({ email: homeowners.email })
      .from(homeowners)
      .where(eq(homeowners.communityId, communityId));
    for (const row of existingRows) {
      if (typeof row.email === "string") {
        existingEmails.add(row.email.trim().toLowerCase());
      }
    }
  }

  const rowsToInsert = uniqueRows.filter((row) => {
    if (!existingEmails.has(row.normalizedEmail)) return true;
    skipped.push({
      row: row.rowNumber,
      email: row.data.email,
      reason: "already-exists",
    });
    return false;
  });
  // Pre-transaction limit check: fast rejection when clearly over limit before
  // we even open a transaction.
  await assertHomeLimit(db, communityId, rowsToInsert.length);

  const createdIds: string[] = [];
  await db.transaction(async (tx) => {
    // Serialize all home-cap mutations for this community: the advisory lock is
    // held until commit, so two concurrent imports cannot interleave their
    // count-then-insert and jointly overshoot the tier cap. The re-check below
    // then runs against state no sibling transaction can mutate until we commit.
    await acquireXactLock(tx, homeLockKey(communityId));
    await assertHomeLimit(tx, communityId, rowsToInsert.length);

    for (const { rowNumber, data: row } of rowsToInsert) {
      const homeownerId = nanoid();

      const insertedHomeowners = await tx
        .insert(homeowners)
        .values({
          id: homeownerId,
          communityId,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone ?? null,
          moveInDate: row.moveInDate ?? null,
          active: true,
        })
        .onConflictDoNothing()
        .returning({ id: homeowners.id });
      const insertedHomeowner = insertedHomeowners[0];
      if (!insertedHomeowner) {
        skipped.push({
          row: rowNumber,
          email: row.email,
          reason: "already-exists",
        });
        continue;
      }

      const unitId = nanoid();

      await tx
        .insert(units)
        .values({
          id: unitId,
          communityId,
          address: row.address,
          unitNumber: row.unitNumber ?? null,
          active: true,
        })
        .onConflictDoNothing();

      await tx
        .insert(unitOwnerships)
        .values({
          id: nanoid(),
          unitId,
          homeownerId: insertedHomeowner.id,
          startDate: row.moveInDate ?? new Date().toISOString().slice(0, 10),
          primary: true,
        })
        .onConflictDoNothing();

      createdIds.push(insertedHomeowner.id);
    }

    if (createdIds.length > 0) {
      await tx
        .insert(communityActivation)
        .values({
          id: nanoid(),
          communityId,
          rosterImported: true,
          rosterImportedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: communityActivation.communityId,
          set: { rosterImported: true, rosterImportedAt: new Date() },
        });
    }
  });

  const created = createdIds.length;
  if (created > 0) {
    await captureEvent(
      "homeowner_imported",
      {
        community_id: communityId,
        created_count: created,
        role: membership.role,
        skipped_count: skipped.length,
      },
      c.get("userId"),
      c.env,
    );
  }
  const status = skipped.length === 0 ? 201 : created > 0 ? 207 : 409;
  return c.json({ created, skipped }, status);
});

router.post(
  "/communities/:id/homeowners",
  zValidator("json", addHomeownerInput),
  async (c) => {
    const communityId = c.req.param("id");
    const db = createDb(c.env);

    try {
      await requireWriteMembership(db, communityId, c.get("userId"));
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    const data = c.req.valid("json");
    await assertFeatureTier(db, communityId, "owner-operations");
    // Fast-fail outside the transaction when already clearly over the cap; the
    // authoritative, race-free check runs under the home lock inside the tx.
    if (data.unitNumber) {
      await assertHomeLimit(db, communityId, 1);
    }

    const homeownerId = nanoid();
    const now = new Date();

    try {
      const result = await db.transaction(async (tx) => {
        const [insertedHomeowner] = await tx
          .insert(homeowners)
          .values({
            id: homeownerId,
            communityId,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone ?? null,
            moveInDate: data.moveInDate ?? null,
            active: true,
          })
          .returning({
            id: homeowners.id,
            firstName: homeowners.firstName,
            lastName: homeowners.lastName,
            email: homeowners.email,
            phone: homeowners.phone,
            moveInDate: homeowners.moveInDate,
          });

        let unitNumber: string | null = null;

        if (data.unitNumber) {
          // Serialize home-cap mutations for this community and re-check under
          // the lock so concurrent unit creates cannot jointly overshoot.
          await acquireXactLock(tx, homeLockKey(communityId));
          await assertHomeLimit(tx, communityId, 1);
          const unitId = nanoid();
          const [insertedUnit] = await tx
            .insert(units)
            .values({
              id: unitId,
              communityId,
              address: data.address ?? "",
              unitNumber: data.unitNumber,
              active: true,
            })
            .returning({ unitNumber: units.unitNumber });

          await tx.insert(unitOwnerships).values({
            id: nanoid(),
            unitId,
            homeownerId: insertedHomeowner.id,
            startDate: data.moveInDate ?? new Date().toISOString().slice(0, 10),
            primary: true,
          });

          unitNumber = insertedUnit.unitNumber ?? null;
        }

        await tx
          .insert(communityActivation)
          .values({
            id: nanoid(),
            communityId,
            rosterImported: true,
            rosterImportedAt: now,
          })
          .onConflictDoUpdate({
            target: communityActivation.communityId,
            set: { rosterImported: true, rosterImportedAt: now },
          });

        return { ...insertedHomeowner, unitNumber };
      });

      return c.json({ homeowner: result }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("unique") ||
        (err as { code?: string }).code === "23505"
      ) {
        return c.json(
          {
            error:
              "A homeowner with this email already exists in this community",
          },
          409,
        );
      }
      throw err;
    }
  },
);

export default router;
