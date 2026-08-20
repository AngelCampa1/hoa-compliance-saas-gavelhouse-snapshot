import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import {
  updateReserveAllocationInput,
  upsertReserveStudyInput,
} from "@boardstack/shared";
import { STATE_RESERVE_REQUIREMENTS } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import {
  reserveStudies,
  reserveComponents,
} from "../../db/schema/reserveStudy.js";
import { communityMembers, communities } from "../../db/schema/tenancy.js";
import { communityActivation } from "../../db/schema/activation.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { captureEvent } from "../../lib/observability.js";
import {
  parseReserveStudyCsv,
  parseReserveStudyJson,
} from "../../domain/accounting/reserveStudyImport.js";

type Variables = { userId: string };

const financeReservesRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

const WRITE_ROLES = ["owner", "admin", "treasurer"] as const;

// Auth middleware
financeReservesRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

async function buildSummary(
  db: ReturnType<typeof createDb>,
  communityId: string,
) {
  const [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const stateCode = community?.state ?? null;
  const stateRule =
    stateCode && STATE_RESERVE_REQUIREMENTS[stateCode]
      ? STATE_RESERVE_REQUIREMENTS[stateCode]
      : null;

  const stateRequirements =
    stateRule !== undefined && stateRule !== null
      ? {
          stateCode: stateRule.stateCode,
          stateName: stateRule.stateName,
          reserveStudyRequired: stateRule.reserveStudyRequired,
          minimumFundingPercent: stateRule.minimumFundingPercent,
          statuteCitation: stateRule.statuteCitation,
        }
      : null;

  const [study] = await db
    .select()
    .from(reserveStudies)
    .where(eq(reserveStudies.communityId, communityId))
    .limit(1);

  if (!study) {
    return {
      studyId: null,
      effectiveDate: null,
      components: [],
      totalReserveBalance: 0,
      totalProjectedNeed: 0,
      percentFunded: null,
      annualBudgetCents: null,
      annualReserveContributionCents: null,
      allocationPercent: null,
      fannieMaeCompliant: null,
      fannieMaeComplianceBasis: null,
      stateRequirements,
    };
  }

  const components = await db
    .select()
    .from(reserveComponents)
    .where(eq(reserveComponents.studyId, study.id));

  const totalReserveBalance = components.reduce(
    (sum, c) => sum + c.currentReserveCents,
    0,
  );
  const totalProjectedNeed = components.reduce(
    (sum, c) => sum + c.replacementCostCents,
    0,
  );
  const percentFunded =
    totalProjectedNeed > 0
      ? (totalReserveBalance / totalProjectedNeed) * 100
      : null;

  const annualBudgetCents = study.annualBudgetCents ?? null;
  const annualReserveContributionCents =
    study.annualReserveContributionCents ?? null;
  const allocationPercent =
    annualBudgetCents !== null &&
    annualBudgetCents > 0 &&
    annualReserveContributionCents !== null
      ? (annualReserveContributionCents / annualBudgetCents) * 100
      : null;

  const fannieMaeCompliant =
    allocationPercent !== null ? allocationPercent >= 15 : null;
  const fannieMaeComplianceBasis =
    allocationPercent !== null
      ? "annual_budget_allocation"
      : "annual_budget_allocation_unavailable";

  return {
    studyId: study.id,
    effectiveDate: study.effectiveDate,
    components: components.map((c) => ({
      id: c.id,
      name: c.name,
      usefulLifeYears: c.usefulLifeYears,
      remainingLifeYears: c.remainingLifeYears,
      replacementCostCents: c.replacementCostCents,
      currentReserveCents: c.currentReserveCents,
    })),
    totalReserveBalance,
    totalProjectedNeed,
    percentFunded,
    annualBudgetCents,
    annualReserveContributionCents,
    allocationPercent,
    fannieMaeCompliant,
    fannieMaeComplianceBasis,
    stateRequirements,
  };
}

async function upsertStudyAndComponents(
  db: ReturnType<typeof createDb>,
  communityId: string,
  data: {
    effectiveDate: string;
    methodology?: string;
    notes?: string;
    annualBudgetCents?: number;
    annualReserveContributionCents?: number;
    components: Array<{
      name: string;
      usefulLifeYears: number;
      remainingLifeYears: number;
      replacementCostCents: number;
      currentReserveCents: number;
    }>;
  },
): Promise<string> {
  const [existing] = await db
    .select()
    .from(reserveStudies)
    .where(eq(reserveStudies.communityId, communityId))
    .limit(1);

  const studyId = existing ? existing.id : nanoid();

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(reserveStudies)
        .set({
          effectiveDate: data.effectiveDate,
          methodology: data.methodology ?? existing.methodology ?? null,
          notes: data.notes ?? existing.notes ?? null,
          annualBudgetCents:
            data.annualBudgetCents ?? existing.annualBudgetCents ?? null,
          annualReserveContributionCents:
            data.annualReserveContributionCents ??
            existing.annualReserveContributionCents ??
            null,
        })
        .where(eq(reserveStudies.id, studyId));

      await tx
        .delete(reserveComponents)
        .where(eq(reserveComponents.studyId, studyId));
    } else {
      await tx.insert(reserveStudies).values({
        id: studyId,
        communityId,
        effectiveDate: data.effectiveDate,
        methodology: data.methodology ?? null,
        notes: data.notes ?? null,
        annualBudgetCents: data.annualBudgetCents ?? null,
        annualReserveContributionCents:
          data.annualReserveContributionCents ?? null,
      });
    }

    await tx.insert(reserveComponents).values(
      data.components.map((comp) => ({
        id: nanoid(),
        studyId,
        name: comp.name,
        usefulLifeYears: comp.usefulLifeYears,
        remainingLifeYears: comp.remainingLifeYears,
        replacementCostCents: comp.replacementCostCents,
        currentReserveCents: comp.currentReserveCents,
      })),
    );
  });

  return studyId;
}

financeReservesRouter.get("/finance/reserves/summary", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId is required" }, 400);

  const userId = c.get("userId");
  const db = createDb(c.env);

  const [membership] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) return c.json({ error: "Forbidden" }, 403);

  const summary = await buildSummary(db, communityId);
  return c.json(summary, 200);
});

financeReservesRouter.put(
  "/finance/reserves/study",
  zValidator("json", upsertReserveStudyInput),
  async (c) => {
    const data = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);

    const [membership] = await db
      .select()
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, data.communityId),
          eq(communityMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) return c.json({ error: "Forbidden" }, 403);
    if (!(WRITE_ROLES as readonly string[]).includes(membership.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await upsertStudyAndComponents(db, data.communityId, data);

    // Flip reservePopulated with a conflict-safe upsert. communityId is UNIQUE,
    // so a check-then-insert would let two concurrent requests both miss the
    // row and race into a 23505 unique-violation. onConflictDoUpdate is idempotent.
    await db
      .insert(communityActivation)
      .values({
        id: nanoid(),
        communityId: data.communityId,
        reservePopulated: true,
        reservePopulatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: communityActivation.communityId,
        set: {
          reservePopulated: true,
          reservePopulatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    const summary = await buildSummary(db, data.communityId);
    return c.json(summary, 200);
  },
);

financeReservesRouter.patch(
  "/finance/reserves/allocation",
  zValidator("json", updateReserveAllocationInput),
  async (c) => {
    const data = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);

    const [membership] = await db
      .select()
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, data.communityId),
          eq(communityMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) return c.json({ error: "Forbidden" }, 403);
    if (!(WRITE_ROLES as readonly string[]).includes(membership.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const [existing] = await db
      .select()
      .from(reserveStudies)
      .where(eq(reserveStudies.communityId, data.communityId))
      .limit(1);

    if (!existing) {
      return c.json(
        { error: "Import a reserve study before saving allocation." },
        404,
      );
    }

    await db
      .update(reserveStudies)
      .set({
        annualBudgetCents: data.annualBudgetCents,
        annualReserveContributionCents: data.annualReserveContributionCents,
      })
      .where(eq(reserveStudies.id, existing.id));

    const summary = await buildSummary(db, data.communityId);
    const allocationPercent =
      (data.annualReserveContributionCents / data.annualBudgetCents) * 100;
    await captureEvent(
      "reserve_allocation_updated",
      {
        allocation_percent: allocationPercent,
        community_id: data.communityId,
        fannie_mae_compliant: allocationPercent >= 15,
        role: membership.role,
        study_id: existing.id,
      },
      userId,
      c.env,
    );
    return c.json(summary, 200);
  },
);

financeReservesRouter.post("/finance/reserve-study/import", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId is required" }, 400);

  const userId = c.get("userId");
  const db = createDb(c.env);

  const [membership] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) return c.json({ error: "Forbidden" }, 403);
  if (!(WRITE_ROLES as readonly string[]).includes(membership.role)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const contentType = c.req.header("Content-Type") ?? "";
  const bodyText = await c.req.text();
  const importFormat = contentType.includes("text/csv") ? "csv" : "json";

  let rows: Array<{
    name: string;
    usefulLifeYears: number;
    remainingLifeYears: number;
    replacementCostCents: number;
    currentReserveCents: number;
  }>;
  let errors: Array<{ row: number; field: string; message: string }>;

  if (contentType.includes("text/csv")) {
    const result = parseReserveStudyCsv(bodyText);
    rows = result.rows;
    errors = result.errors;
  } else if (contentType.includes("application/json")) {
    const result = parseReserveStudyJson(bodyText);
    rows = result.rows;
    errors = result.errors;
  } else {
    return c.json(
      { error: "Unsupported Content-Type. Use text/csv or application/json" },
      400,
    );
  }

  if (errors.length > 0 && rows.length === 0) {
    return c.json({ errors }, 422);
  }

  if (rows.length > 0) {
    const studyId = await upsertStudyAndComponents(db, communityId, {
      effectiveDate: new Date().toISOString().slice(0, 10),
      components: rows,
    });

    // Flip reservePopulated with a conflict-safe upsert. communityId is UNIQUE,
    // so a check-then-insert would let two concurrent requests both miss the
    // row and race into a 23505 unique-violation. onConflictDoUpdate is idempotent.
    await db
      .insert(communityActivation)
      .values({
        id: nanoid(),
        communityId,
        reservePopulated: true,
        reservePopulatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: communityActivation.communityId,
        set: {
          reservePopulated: true,
          reservePopulatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    await captureEvent(
      "reserve_imported",
      {
        community_id: communityId,
        component_count: rows.length,
        error_count: errors.length,
        import_format: importFormat,
        role: membership.role,
        study_id: studyId,
      },
      userId,
      c.env,
    );
  }

  if (errors.length > 0) {
    return c.json({ inserted: rows.length, errors }, 207);
  }

  return c.json({ inserted: rows.length }, 201);
});

export default financeReservesRouter;
