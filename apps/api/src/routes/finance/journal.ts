import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { createJournalEntryInput } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import { journalEntries, journalLines } from "../../db/schema/journal.js";
import { accounts } from "../../db/schema/accounts.js";
import { communityMembers } from "../../db/schema/tenancy.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import {
  buildInternalErrorBody,
  captureEvent,
  captureException,
} from "../../lib/observability.js";
import {
  postEntry,
  CommingleError,
} from "../../domain/accounting/postEntry.js";

type Variables = { userId: string };

const financeJournalRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

const WRITE_ROLES = ["owner", "admin", "treasurer"] as const;
const listJournalQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

// Auth middleware
financeJournalRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// POST /finance/journal — create a journal entry
financeJournalRouter.post(
  "/finance/journal",
  zValidator("json", createJournalEntryInput, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", issues: result.error.issues },
        400,
      );
    }
  }),
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

    try {
      const result = await postEntry(db, {
        communityId: data.communityId,
        createdByUserId: userId,
        entryDate: data.entryDate,
        memo: data.memo,
        lines: data.lines,
      });

      await captureEvent(
        "journal_entry_posted",
        {
          community_id: data.communityId,
          entry_id: result.entryId,
          entry_month: data.entryDate.slice(0, 7),
          line_count: result.lineCount,
          role: membership.role,
        },
        userId,
        c.env,
      );

      return c.json(result, 201);
    } catch (err) {
      if (err instanceof CommingleError) {
        return c.json({ error: err.message }, 422);
      }
      const trackingId = captureException(err, {
        tags: { source: "finance-journal-create" },
        extra: { communityId: data.communityId },
      });
      return c.json(buildInternalErrorBody(trackingId), 500);
    }
  },
);

// GET /finance/journal — paginated list of entries with lines
financeJournalRouter.get("/finance/journal", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId is required" }, 400);

  const userId = c.get("userId");
  const db = createDb(c.env);

  const membershipRows = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    )
    .limit(1);
  const membership = membershipRows[0];

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const pagination = listJournalQuery.safeParse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
  if (!pagination.success) {
    return c.json(
      { error: "Invalid pagination query", issues: pagination.error.issues },
      400,
    );
  }
  const { limit, offset } = pagination.data;

  const rows = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.communityId, communityId))
    .orderBy(desc(journalEntries.entryDate))
    .limit(limit)
    .offset(offset);

  // Fetch all lines for the page of entries in a single query, then group in
  // application code. This replaces the previous N+1 pattern (one query per
  // entry) with two total queries regardless of page size.
  const entryIds = rows.map((e) => e.id);
  const allLines =
    entryIds.length > 0
      ? await db
          .select({
            id: journalLines.id,
            entryId: journalLines.entryId,
            accountId: journalLines.accountId,
            debitCents: journalLines.debitCents,
            creditCents: journalLines.creditCents,
            fundType: journalLines.fundType,
            accountName: accounts.name,
            accountCode: accounts.code,
          })
          .from(journalLines)
          .leftJoin(accounts, eq(journalLines.accountId, accounts.id))
          .where(
            and(
              inArray(journalLines.entryId, entryIds),
              eq(journalLines.communityId, communityId),
            ),
          )
      : [];

  const linesByEntry = new Map<string, (typeof allLines)[number][]>();
  for (const line of allLines) {
    const bucket = linesByEntry.get(line.entryId) ?? [];
    bucket.push(line);
    linesByEntry.set(line.entryId, bucket);
  }

  const entriesWithLines = rows.map((entry) => ({
    ...entry,
    lines: linesByEntry.get(entry.id) ?? [],
  }));

  return c.json({
    entries: entriesWithLines,
    limit,
    offset,
  });
});

// GET /finance/journal/:entryId — single entry with lines
financeJournalRouter.get("/finance/journal/:entryId", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId is required" }, 400);

  const entryId = c.req.param("entryId");
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

  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.id, entryId),
        eq(journalEntries.communityId, communityId),
      ),
    )
    .limit(1);

  if (!entry) return c.json({ error: "Entry not found" }, 404);

  const lines = await db
    .select({
      id: journalLines.id,
      entryId: journalLines.entryId,
      accountId: journalLines.accountId,
      debitCents: journalLines.debitCents,
      creditCents: journalLines.creditCents,
      fundType: journalLines.fundType,
      accountName: accounts.name,
      accountCode: accounts.code,
    })
    .from(journalLines)
    .leftJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(
      and(
        eq(journalLines.entryId, entryId),
        eq(journalLines.communityId, communityId),
      ),
    );

  return c.json({ entry, lines });
});

export default financeJournalRouter;
