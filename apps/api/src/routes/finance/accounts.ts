import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createAccountInput, updateAccountInput } from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import { accounts } from "../../db/schema/accounts.js";
import { communityMembers } from "../../db/schema/tenancy.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { seedDefaultChartOfAccounts } from "../../domain/accounting/seed.js";
import { captureEvent } from "../../lib/observability.js";

type Variables = { userId: string };

const financeAccountsRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

const WRITE_ROLES = ["owner", "admin", "treasurer"] as const;
const listAccountsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

// Auth middleware
financeAccountsRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

financeAccountsRouter.get("/finance/accounts", async (c) => {
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
  if ((WRITE_ROLES as readonly string[]).includes(membership.role)) {
    const seedResult = await seedDefaultChartOfAccounts(db, communityId);
    if (seedResult.created) {
      try {
        await captureEvent(
          "chart_of_accounts_seeded",
          {
            community_id: communityId,
            role: membership.role,
            seeded_count: seedResult.count,
          },
          userId,
          c.env,
        );
      } catch {
        // Analytics is best-effort and must not break account listing.
      }
    }
  }

  const pagination = listAccountsQuery.safeParse({
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
    .from(accounts)
    .where(eq(accounts.communityId, communityId))
    .limit(limit)
    .offset(offset);

  return c.json({ accounts: rows });
});

const createAccountBody = createAccountInput.extend({
  communityId: z.string().min(1),
});

financeAccountsRouter.post(
  "/finance/accounts",
  zValidator("json", createAccountBody),
  async (c) => {
    const data = c.req.valid("json");
    const { communityId, ...accountData } = data;
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

    const accountId = nanoid();
    try {
      await db.insert(accounts).values({
        id: accountId,
        communityId,
        ...accountData,
      });
    } catch (err) {
      const dbErr = err as Error & { code?: string };
      const isDuplicateKey =
        dbErr.code === "23505" ||
        (typeof dbErr.message === "string" &&
          dbErr.message.includes("duplicate key"));
      if (isDuplicateKey) {
        return c.json(
          { error: "Account code already exists in this community" },
          409,
        );
      }
      throw err;
    }

    try {
      await captureEvent(
        "account_created",
        {
          account_id: accountId,
          account_type: accountData.accountType,
          community_id: communityId,
          fund_type: accountData.fundType,
          role: membership.role,
        },
        userId,
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break account creation.
    }

    return c.json({ accountId }, 201);
  },
);

const patchAccountBody = updateAccountInput
  .omit({ fundType: true, accountType: true, code: true })
  .extend({
    communityId: z.string().min(1),
    fundType: z.never().optional(),
    accountType: z.never().optional(),
    code: z.never().optional(),
  });

financeAccountsRouter.patch("/finance/accounts/:id", async (c) => {
  const userId = c.get("userId");
  const accountId = c.req.param("id");

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const communityId = body["communityId"];
  if (typeof communityId !== "string" || communityId.length === 0) {
    return c.json({ error: "communityId is required" }, 400);
  }

  // Reject attempts to change fundType or accountType
  if ("fundType" in body) {
    return c.json(
      { error: "fundType cannot be changed after account creation" },
      400,
    );
  }
  if ("accountType" in body) {
    return c.json(
      { error: "accountType cannot be changed after account creation" },
      400,
    );
  }
  if ("code" in body) {
    return c.json(
      { error: "code cannot be changed after account creation" },
      400,
    );
  }

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

  // Validate remaining fields via updateAccountInput (partial)
  const validation = patchAccountBody.safeParse(body);
  if (!validation.success) {
    return c.json({ error: "Invalid update data" }, 400);
  }

  const { communityId: _cid, ...updateData } = validation.data;

  const updates: {
    name?: string;
    active?: boolean;
    parentAccountId?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (updateData.name !== undefined) updates.name = updateData.name;
  if (updateData.active !== undefined) updates.active = updateData.active;
  if (updateData.parentAccountId !== undefined)
    updates.parentAccountId = updateData.parentAccountId;

  const updated = await db
    .update(accounts)
    .set(updates)
    .where(
      and(eq(accounts.id, accountId), eq(accounts.communityId, communityId)),
    )
    .returning();

  if (updated.length === 0) {
    return c.json({ error: "Account not found" }, 404);
  }

  try {
    await captureEvent(
      "account_updated",
      {
        account_id: accountId,
        changed_active: updateData.active !== undefined,
        changed_name: updateData.name !== undefined,
        changed_parent_account: updateData.parentAccountId !== undefined,
        community_id: communityId,
        role: membership.role,
      },
      userId,
      c.env,
    );
  } catch {
    // Analytics is best-effort and must not break account updates.
  }

  return c.json({ ok: true });
});

export default financeAccountsRouter;
