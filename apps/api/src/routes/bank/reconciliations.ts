import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { MatchInput, FinalizeReconciliationInput } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import {
  reconciliations,
  reconciliationMatches,
  bankStatements,
  bankStatementLines,
} from "../../db/schema/bankRec.js";
import { communityMembers } from "../../db/schema/tenancy.js";
import { assessments, payments } from "../../db/schema/dues.js";
import { journalLines } from "../../db/schema/journal.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { captureEvent } from "../../lib/observability.js";
import { verifyBalance } from "../../domain/bankRec/reconciliation.js";

type Variables = { userId: string };

const reconciliationsRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

const WRITE_ROLES = ["owner", "admin", "treasurer"] as const;

// Auth middleware
reconciliationsRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

// GET /bank/reconciliations/:id?communityId=
reconciliationsRouter.get("/bank/reconciliations/:id", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId is required" }, 400);

  const reconciliationId = c.req.param("id");
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

  const [reconciliation] = await db
    .select()
    .from(reconciliations)
    .where(
      and(
        eq(reconciliations.id, reconciliationId),
        eq(reconciliations.communityId, communityId),
      ),
    )
    .limit(1);

  if (!reconciliation)
    return c.json({ error: "Reconciliation not found" }, 404);

  const [statement] = await db
    .select()
    .from(bankStatements)
    .where(
      and(
        eq(bankStatements.id, reconciliation.statementId),
        eq(bankStatements.communityId, communityId),
      ),
    )
    .limit(1);

  const lines = await db
    .select()
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.statementId, reconciliation.statementId),
        eq(bankStatementLines.communityId, communityId),
      ),
    );

  const matches = await db
    .select()
    .from(reconciliationMatches)
    .where(
      and(
        eq(reconciliationMatches.reconciliationId, reconciliationId),
        eq(reconciliationMatches.communityId, communityId),
      ),
    );

  return c.json({ reconciliation, statement, lines, matches });
});

// POST /bank/reconciliations/:id/matches
reconciliationsRouter.post(
  "/bank/reconciliations/:id/matches",
  zValidator("json", MatchInput, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", issues: result.error.issues },
        400,
      );
    }
  }),
  async (c) => {
    const data = c.req.valid("json");
    const reconciliationId = c.req.param("id");
    if (data.reconciliationId !== reconciliationId) {
      return c.json({ error: "reconciliationId must match path" }, 400);
    }

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

    const [reconciliation] = await db
      .select()
      .from(reconciliations)
      .where(
        and(
          eq(reconciliations.id, reconciliationId),
          eq(reconciliations.communityId, data.communityId),
        ),
      )
      .limit(1);

    if (!reconciliation) {
      return c.json({ error: "Reconciliation not found" }, 404);
    }

    // A finalized reconciliation is a terminal audit record; adding a match
    // would diverge the stored matchedAmount/balance snapshot from live data.
    // Mirrors the /finalize handler's terminal-state guard.
    if (reconciliation.status === "finalized") {
      return c.json(
        { error: "Cannot modify a finalized reconciliation" },
        409,
      );
    }

    const [statementLine] = await db
      .select({ id: bankStatementLines.id })
      .from(bankStatementLines)
      .where(
        and(
          eq(bankStatementLines.id, data.statementLineId),
          eq(bankStatementLines.statementId, reconciliation.statementId),
          eq(bankStatementLines.communityId, data.communityId),
        ),
      )
      .limit(1);

    if (!statementLine) {
      return c.json({ error: "Statement line not found" }, 404);
    }

    if (data.paymentId) {
      const [payment] = await db
        .select({ id: payments.id })
        .from(payments)
        .innerJoin(assessments, eq(assessments.id, payments.assessmentId))
        .where(
          and(
            eq(payments.id, data.paymentId),
            eq(assessments.communityId, data.communityId),
          ),
        )
        .limit(1);
      if (!payment) return c.json({ error: "Payment not found" }, 404);
    }

    if (data.journalLineId) {
      const [journalLine] = await db
        .select({ id: journalLines.id })
        .from(journalLines)
        .where(
          and(
            eq(journalLines.id, data.journalLineId),
            eq(journalLines.communityId, data.communityId),
          ),
        )
        .limit(1);
      if (!journalLine) return c.json({ error: "Journal line not found" }, 404);
    }

    const [match] = await db
      .insert(reconciliationMatches)
      .values({
        id: nanoid(),
        reconciliationId,
        communityId: data.communityId,
        statementLineId: data.statementLineId,
        paymentId: data.paymentId,
        journalLineId: data.journalLineId,
      })
      .returning();

    await captureBankReconciliationEvent(
      "bank_reconciliation_match_created",
      {
        community_id: data.communityId,
        match_id: match.id,
        match_target_type: data.paymentId ? "payment" : "journal_line",
        reconciliation_id: reconciliationId,
        role: membership.role,
        statement_id: reconciliation.statementId,
      },
      userId,
      c.env,
    );

    return c.json({ match }, 201);
  },
);

// DELETE /bank/reconciliations/:id/matches/:matchId?communityId=
reconciliationsRouter.delete(
  "/bank/reconciliations/:id/matches/:matchId",
  async (c) => {
    const communityId = c.req.query("communityId");
    if (!communityId) return c.json({ error: "communityId is required" }, 400);

    const matchId = c.req.param("matchId");
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

    const reconciliationId = c.req.param("id");
    const [match] = await db
      .select({ id: reconciliationMatches.id })
      .from(reconciliationMatches)
      .where(
        and(
          eq(reconciliationMatches.id, matchId),
          eq(reconciliationMatches.reconciliationId, reconciliationId),
          eq(reconciliationMatches.communityId, communityId),
        ),
      )
      .limit(1);

    if (!match) {
      return c.json({ error: "Match not found" }, 404);
    }

    // A finalized reconciliation is a terminal audit record; removing a match
    // would diverge the stored matchedAmount/balance snapshot from live data.
    // Mirrors the /finalize handler's terminal-state guard.
    const [reconciliation] = await db
      .select()
      .from(reconciliations)
      .where(
        and(
          eq(reconciliations.id, reconciliationId),
          eq(reconciliations.communityId, communityId),
        ),
      )
      .limit(1);

    if (reconciliation?.status === "finalized") {
      return c.json(
        { error: "Cannot modify a finalized reconciliation" },
        409,
      );
    }

    await db
      .delete(reconciliationMatches)
      .where(
        and(
          eq(reconciliationMatches.id, matchId),
          eq(reconciliationMatches.reconciliationId, reconciliationId),
          eq(reconciliationMatches.communityId, communityId),
        ),
      );

    await captureBankReconciliationEvent(
      "bank_reconciliation_match_deleted",
      {
        community_id: communityId,
        match_id: matchId,
        reconciliation_id: reconciliationId,
        role: membership.role,
      },
      userId,
      c.env,
    );

    return c.json({ ok: true });
  },
);

// POST /bank/reconciliations/:id/finalize
reconciliationsRouter.post(
  "/bank/reconciliations/:id/finalize",
  zValidator("json", FinalizeReconciliationInput, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", issues: result.error.issues },
        400,
      );
    }
  }),
  async (c) => {
    const data = c.req.valid("json");
    const reconciliationId = c.req.param("id");
    if (data.reconciliationId !== reconciliationId) {
      return c.json({ error: "reconciliationId must match path" }, 400);
    }

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

    const [reconciliation] = await db
      .select()
      .from(reconciliations)
      .where(
        and(
          eq(reconciliations.id, data.reconciliationId),
          eq(reconciliations.communityId, data.communityId),
        ),
      )
      .limit(1);

    if (!reconciliation) {
      return c.json({ error: "Reconciliation not found" }, 404);
    }

    // Finalize is a one-way terminal transition. Guard against a repeat call
    // (retry / double-submit / second board member) overwriting the immutable
    // finalizedAt + finalizedByUserId audit record and re-emitting the
    // bank_reconciliation_finalized event.
    if (reconciliation.status === "finalized") {
      return c.json({ error: "Reconciliation is already finalized" }, 409);
    }

    const [statement] = await db
      .select()
      .from(bankStatements)
      .where(
        and(
          eq(bankStatements.id, reconciliation.statementId),
          eq(bankStatements.communityId, data.communityId),
        ),
      )
      .limit(1);

    if (!statement) {
      return c.json({ error: "Statement not found" }, 404);
    }

    const lines = await db
      .select()
      .from(bankStatementLines)
      .where(
        and(
          eq(bankStatementLines.statementId, reconciliation.statementId),
          eq(bankStatementLines.communityId, data.communityId),
        ),
      );

    const matches = await db
      .select()
      .from(reconciliationMatches)
      .where(
        and(
          eq(reconciliationMatches.reconciliationId, data.reconciliationId),
          eq(reconciliationMatches.communityId, data.communityId),
        ),
      );

    const matchedLineIds = new Set(matches.map((m) => m.statementLineId));
    const allMatched = lines.every((l) => matchedLineIds.has(l.id));
    const matchedExistingLineCount = lines.filter((l) =>
      matchedLineIds.has(l.id),
    ).length;
    const unmatchedLineCount = lines.filter(
      (l) => !matchedLineIds.has(l.id),
    ).length;

    const matchedAmountCents = matches.reduce((sum, m) => {
      const line = lines.find((l) => l.id === m.statementLineId);
      return sum + (line?.amountCents ?? 0);
    }, 0);

    const { balanced, deltaCents } = verifyBalance(
      matchedAmountCents,
      statement.beginningBalanceCents,
      statement.endingBalanceCents,
    );

    if (!allMatched || !balanced) {
      await captureBankReconciliationEvent(
        "bank_reconciliation_finalize_failed",
        {
          balanced,
          community_id: data.communityId,
          line_count: lines.length,
          matched_line_count: matchedExistingLineCount,
          reconciliation_id: data.reconciliationId,
          role: membership.role,
          statement_id: reconciliation.statementId,
          unmatched_line_count: unmatchedLineCount,
        },
        userId,
        c.env,
      );
      return c.json(
        {
          error: "Reconciliation does not balance",
          deltaCents,
          unmatchedLines: unmatchedLineCount,
        },
        422,
      );
    }

    // Re-check status === "open" atomically in the WHERE clause. The JS guard
    // above is a fast path, but two concurrent finalize calls can both SELECT an
    // open row and both pass it; only the status predicate here serializes the
    // one-way transition. The race loser updates zero rows → 409, so the
    // immutable finalizedAt/finalizedByUserId audit record is written exactly
    // once and the finalized events are emitted exactly once.
    const [finalized] = await db
      .update(reconciliations)
      .set({
        status: "finalized",
        finalizedAt: new Date(),
        finalizedByUserId: userId,
      })
      .where(
        and(
          eq(reconciliations.id, data.reconciliationId),
          eq(reconciliations.communityId, data.communityId),
          eq(reconciliations.status, "open"),
        ),
      )
      .returning();

    if (!finalized) {
      return c.json({ error: "Reconciliation is already finalized" }, 409);
    }

    const finalizedProperties = {
      community_id: data.communityId,
      line_count: lines.length,
      matched_line_count: matchedExistingLineCount,
      reconciliation_id: data.reconciliationId,
      role: membership.role,
      statement_id: reconciliation.statementId,
    };
    await Promise.all([
      captureBankReconciliationEvent(
        "bank_reconciliation_finalized",
        finalizedProperties,
        userId,
        c.env,
      ),
      captureBankReconciliationEvent(
        "reconciliation_completed",
        finalizedProperties,
        userId,
        c.env,
      ),
    ]);

    return c.json({
      ok: true,
      reconciliationId: data.reconciliationId,
      status: "finalized",
    });
  },
);

async function captureBankReconciliationEvent(
  name:
    | "bank_reconciliation_match_created"
    | "bank_reconciliation_match_deleted"
    | "bank_reconciliation_finalize_failed"
    | "bank_reconciliation_finalized"
    | "reconciliation_completed",
  properties: Record<string, unknown>,
  userId: string,
  env: Env,
): Promise<void> {
  try {
    await captureEvent(name, properties, userId, env);
  } catch {
    // Analytics is best-effort and must not break reconciliation workflows.
  }
}

export default reconciliationsRouter;
