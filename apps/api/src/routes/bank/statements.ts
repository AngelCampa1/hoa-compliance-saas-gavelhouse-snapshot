import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, inArray } from "drizzle-orm";
import { StatementImportInput } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import {
  bankStatements,
  bankStatementLines,
  reconciliations,
} from "../../db/schema/bankRec.js";
import { accounts } from "../../db/schema/accounts.js";
import { communityMembers } from "../../db/schema/tenancy.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { captureEvent } from "../../lib/observability.js";
import { parseCsv } from "../../domain/bankRec/statementImport.js";

type Variables = { userId: string };

const statementsRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

const WRITE_ROLES = ["owner", "admin", "treasurer"] as const;

// Auth middleware
statementsRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

/** Maximum allowed CSV size in bytes: 10 MB. */
const MAX_CSV_BYTES = 10 * 1024 * 1024;

function statementMonth(statementDate: string): string {
  return statementDate.slice(0, 7);
}

// POST /bank/statements
statementsRouter.post(
  "/bank/statements",
  async (c, next) => {
    // Reject oversized payloads early, before the body is parsed, to avoid
    // wasting CPU on large uploads that would be rejected anyway.
    const contentLengthHeader = c.req.header("content-length");
    if (contentLengthHeader !== undefined) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > MAX_CSV_BYTES) {
        await captureStatementImportEvent(
          "bank_statement_upload_failed",
          { failure_type: "payload_too_large" },
          c.get("userId"),
          c.env,
        );
        return c.json({ error: "payload_too_large" }, 413);
      }
    }
    // Reject non-JSON content type — the body must be application/json
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      await captureStatementImportEvent(
        "bank_statement_upload_failed",
        { failure_type: "invalid_content_type" },
        c.get("userId"),
        c.env,
      );
      return c.json({ error: "Content-Type must be application/json" }, 415);
    }
    return next();
  },
  zValidator("json", StatementImportInput, async (result, c) => {
    if (!result.success) {
      // Hono's zValidator hook context does not carry this router's Bindings
      // or Variables generics, so narrow to the values the auth middleware
      // above guarantees are present (`userId`) plus the worker `env`.
      const ctx = c as unknown as { env: Env; get(key: "userId"): string };
      await captureStatementImportEvent(
        "bank_statement_upload_failed",
        { failure_type: "invalid_body" },
        ctx.get("userId"),
        ctx.env,
      );
      return c.json(
        { error: "Invalid request body", issues: result.error.issues },
        400,
      );
    }
  }),
  async (c) => {
    const data = c.req.valid("json");

    // Reject CSV strings that exceed 10 MB
    if (new TextEncoder().encode(data.csv).length > MAX_CSV_BYTES) {
      await captureStatementImportEvent(
        "bank_statement_upload_failed",
        {
          failure_type: "csv_too_large",
          statement_month: statementMonth(data.statementDate),
        },
        c.get("userId"),
        c.env,
      );
      return c.json({ error: "CSV content exceeds 10 MB size limit" }, 413);
    }

    // statementDate is validated by Zod's .date() to YYYY-MM-DD format
    // (digits and hyphens only), so no further sanitization is needed.
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

    if (!membership) {
      await captureStatementImportEvent(
        "bank_statement_upload_failed",
        {
          failure_type: "not_member",
          statement_month: statementMonth(data.statementDate),
        },
        userId,
        c.env,
      );
      return c.json({ error: "Forbidden" }, 403);
    }
    if (!(WRITE_ROLES as readonly string[]).includes(membership.role)) {
      await captureStatementImportEvent(
        "bank_statement_upload_failed",
        {
          account_id: data.accountId,
          community_id: data.communityId,
          failure_type: "role_forbidden",
          role: membership.role,
          statement_month: statementMonth(data.statementDate),
        },
        userId,
        c.env,
      );
      return c.json({ error: "Forbidden" }, 403);
    }

    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, data.accountId),
          eq(accounts.communityId, data.communityId),
        ),
      )
      .limit(1);

    if (!account) {
      await captureStatementImportEvent(
        "bank_statement_upload_failed",
        {
          account_id: data.accountId,
          community_id: data.communityId,
          failure_type: "account_not_found",
          role: membership.role,
          statement_month: statementMonth(data.statementDate),
        },
        userId,
        c.env,
      );
      return c.json({ error: "Account not found" }, 404);
    }

    let lines;
    try {
      lines = parseCsv(data.csv);
    } catch (err) {
      await captureStatementImportEvent(
        "bank_statement_upload_failed",
        {
          account_id: data.accountId,
          community_id: data.communityId,
          failure_type: "parse_error",
          role: membership.role,
          statement_month: statementMonth(data.statementDate),
        },
        userId,
        c.env,
      );
      return c.json({ error: (err as Error).message }, 422);
    }

    const statementId = nanoid();
    const reconciliationId = nanoid();

    try {
      await db.transaction(async (tx) => {
        await tx.insert(bankStatements).values({
          id: statementId,
          communityId: data.communityId,
          accountId: data.accountId,
          statementDate: data.statementDate,
          beginningBalanceCents: data.beginningBalanceCents,
          endingBalanceCents: data.endingBalanceCents,
        });

        if (lines.length > 0) {
          for (const line of lines) {
            await tx.insert(bankStatementLines).values({
              id: nanoid(),
              statementId,
              communityId: data.communityId,
              postedDate: line.postedDate,
              description: line.description,
              amountCents: line.amountCents,
            });
          }
        }

        await tx.insert(reconciliations).values({
          id: reconciliationId,
          communityId: data.communityId,
          statementId,
          status: "open",
        });
      });
    } catch (error) {
      await captureStatementImportEvent(
        "bank_statement_upload_failed",
        {
          account_id: data.accountId,
          community_id: data.communityId,
          failure_type: "transaction_error",
          line_count: lines.length,
          role: membership.role,
          statement_month: statementMonth(data.statementDate),
        },
        userId,
        c.env,
      );
      throw error;
    }

    await captureStatementImportEvent(
      "bank_statement_uploaded",
      {
        account_id: data.accountId,
        community_id: data.communityId,
        line_count: lines.length,
        reconciliation_id: reconciliationId,
        role: membership.role,
        statement_id: statementId,
        statement_month: statementMonth(data.statementDate),
      },
      userId,
      c.env,
    );

    return c.json(
      { statementId, reconciliationId, lineCount: lines.length },
      201,
    );
  },
);

// GET /bank/statements?communityId=
statementsRouter.get("/bank/statements", async (c) => {
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

  const statements = await db
    .select()
    .from(bankStatements)
    .where(eq(bankStatements.communityId, communityId))
    .orderBy(desc(bankStatements.statementDate));

  const reconciliationMap = new Map<string, string>();
  if (statements.length > 0) {
    const recs = await db
      .select({
        id: reconciliations.id,
        statementId: reconciliations.statementId,
      })
      .from(reconciliations)
      .where(
        and(
          eq(reconciliations.communityId, communityId),
          inArray(
            reconciliations.statementId,
            statements.map((s) => s.id),
          ),
        ),
      );
    for (const r of recs) {
      reconciliationMap.set(r.statementId, r.id);
    }
  }

  return c.json({
    statements: statements.map((s) => ({
      ...s,
      reconciliationId: reconciliationMap.get(s.id) ?? null,
    })),
  });
});

async function captureStatementImportEvent(
  name: "bank_statement_uploaded" | "bank_statement_upload_failed",
  properties: Record<string, unknown>,
  userId: string,
  env: Env,
): Promise<void> {
  try {
    await captureEvent(name, properties, userId, env);
  } catch {
    // Analytics is best-effort and must not break statement imports.
  }
}

export default statementsRouter;
