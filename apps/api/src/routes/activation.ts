import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { ACTIVATION_CHECKLIST, ActivationStep } from "@boardstack/shared";
import { createDb } from "../db/client.js";
import { communityActivation, communityMembers } from "../db/schema/index.js";
import type { Env } from "../types/env.js";
import { getAuth } from "../lib/auth.js";
import { captureEvent } from "../lib/observability.js";

const WRITE_ROLES = ["owner", "admin"] as const;
const TOTAL_ACTIVATION_STEPS = ACTIVATION_CHECKLIST.length;
const ACTIVATION_EVENT_UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

type ActivationSnapshot = {
  rosterImported: boolean;
  reservePopulated: boolean;
  complianceAcknowledged: boolean;
  dueBatchConfigured: boolean;
};

const STEP_TO_FLAG: Record<ActivationStep, keyof ActivationSnapshot> = {
  roster_imported: "rosterImported",
  reserve_populated: "reservePopulated",
  compliance_acknowledged: "complianceAcknowledged",
  dues_batch_configured: "dueBatchConfigured",
};

function countCompletedActivationSteps(row: ActivationSnapshot): number {
  return ACTIVATION_CHECKLIST.filter(({ step }) => row[STEP_TO_FLAG[step]])
    .length;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

async function deterministicActivationEventUuid(name: string): Promise<string> {
  const namespaceBytes = uuidToBytes(ACTIVATION_EVENT_UUID_NAMESPACE);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", input));
  const uuidBytes = hash.slice(0, 16);
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50;
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
  return bytesToUuid(uuidBytes);
}

type Variables = { userId: string };

const activationRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

activationRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

activationRouter.get("/activation", async (c) => {
  const { communityId } = c.req.query();
  if (!communityId) return c.json({ error: "communityId required" }, 400);
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

  const [row] = await db
    .select()
    .from(communityActivation)
    .where(eq(communityActivation.communityId, communityId))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ activation: row });
});

const patchBody = z.object({
  communityId: z.string().min(1),
  completed: z.boolean(),
});

activationRouter.patch(
  "/activation/:step",
  zValidator("json", patchBody),
  async (c) => {
    const step = c.req.param("step");
    const parsed = ActivationStep.safeParse(step);
    if (!parsed.success) return c.json({ error: "Invalid step" }, 400);

    const { communityId, completed } = c.req.valid("json");
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

    const [previousActivation] = completed
      ? await db
          .select()
          .from(communityActivation)
          .where(eq(communityActivation.communityId, communityId))
          .limit(1)
      : [undefined];

    const now = new Date();
    let updateData: Partial<typeof communityActivation.$inferInsert>;

    switch (parsed.data) {
      case "roster_imported":
        updateData = {
          rosterImported: completed,
          rosterImportedAt: completed ? now : null,
          updatedAt: now,
        };
        break;
      case "reserve_populated":
        updateData = {
          reservePopulated: completed,
          reservePopulatedAt: completed ? now : null,
          updatedAt: now,
        };
        break;
      case "compliance_acknowledged":
        updateData = {
          complianceAcknowledged: completed,
          complianceAcknowledgedAt: completed ? now : null,
          updatedAt: now,
        };
        break;
      case "dues_batch_configured":
        updateData = {
          dueBatchConfigured: completed,
          dueBatchConfiguredAt: completed ? now : null,
          updatedAt: now,
        };
        break;
    }

    await db
      .update(communityActivation)
      .set(updateData)
      .where(eq(communityActivation.communityId, communityId));

    if (completed) {
      const previousSnapshot: ActivationSnapshot = {
        rosterImported: previousActivation?.rosterImported ?? false,
        reservePopulated: previousActivation?.reservePopulated ?? false,
        complianceAcknowledged:
          previousActivation?.complianceAcknowledged ?? false,
        dueBatchConfigured: previousActivation?.dueBatchConfigured ?? false,
      };
      const nextSnapshot = {
        ...previousSnapshot,
        [STEP_TO_FLAG[parsed.data]]: true,
      };
      const stepWasAlreadyCompleted =
        previousSnapshot[STEP_TO_FLAG[parsed.data]];
      const previousCompletedCount =
        countCompletedActivationSteps(previousSnapshot);
      const completedCount = countCompletedActivationSteps(nextSnapshot);
      const eventBase = {
        community_id: communityId,
        role: membership.role,
        completed_count: completedCount,
        total_count: TOTAL_ACTIVATION_STEPS,
      };

      const analyticsEvents = stepWasAlreadyCompleted
        ? []
        : [
            captureEvent(
              "activation_step_completed",
              {
                ...eventBase,
                step: parsed.data,
              },
              userId,
              c.env,
              {
                uuid: await deterministicActivationEventUuid(
                  `activation:${communityId}:step:${parsed.data}`,
                ),
              },
            ),
          ];

      if (previousCompletedCount === 0 && completedCount > 0) {
        analyticsEvents.push(
          captureEvent(
            "aha_reached",
            {
              ...eventBase,
              first_completed_step: parsed.data,
            },
            userId,
            c.env,
            {
              uuid: await deterministicActivationEventUuid(
                `activation:${communityId}:aha_reached`,
              ),
            },
          ),
        );
      }

      if (
        previousCompletedCount < TOTAL_ACTIVATION_STEPS &&
        completedCount === TOTAL_ACTIVATION_STEPS
      ) {
        analyticsEvents.push(
          captureEvent("activation_completed", eventBase, userId, c.env, {
            uuid: await deterministicActivationEventUuid(
              `activation:${communityId}:activation_completed`,
            ),
          }),
        );
      }

      await Promise.all(analyticsEvents);
    }

    return c.json({ ok: true });
  },
);

export default activationRouter;
