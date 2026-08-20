import { Hono } from "hono";
import type { Context, Next } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gt, inArray, isNull, or, lte, gte } from "drizzle-orm";
import { z } from "zod";
import {
  OWNER_PORTAL_LINK_EXPIRY_DAYS,
  PUBLIC_APP_URL,
  createOwnerPortalSessionInput,
} from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import {
  ownerPortalSessions,
  archRequests,
} from "../../db/schema/governance.js";
import {
  homeowners,
  assessments,
  payments,
  unitOwnerships,
  units,
} from "../../db/schema/dues.js";
import { communities } from "../../db/schema/tenancy.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { createStripe } from "../../lib/stripe-client.js";
import { captureEvent, captureException } from "../../lib/observability.js";
import { seedDefaultChartOfAccounts } from "../../domain/accounting/seed.js";
import {
  assertFeatureTier,
  requireCapability,
} from "../../domain/policy/access.js";
import {
  buildOwnerPortalInviteEmail,
  sendOwnerPortalInviteEmail,
} from "../../domain/governance/ownerPortalInvite.js";

type AllVariables = {
  userId: string;
  homeownerId: string;
  communityId: string;
};
type AppContext = Context<{ Bindings: Env; Variables: AllVariables }>;

async function captureOwnerPortalEvent(
  name:
    | "owner_portal_payment_started"
    | "owner_portal_checkout_ready"
    | "owner_portal_arch_request_submitted",
  properties: Record<string, unknown>,
  homeownerId: string,
  env: Env,
) {
  try {
    await captureEvent(name, properties, `owner:${homeownerId}`, env);
  } catch {
    // Analytics is best-effort and must not break owner portal workflows.
  }
}

const router = new Hono<{ Bindings: Env; Variables: AllVariables }>();

function toOwnerPortalAssessment(assessment: typeof assessments.$inferSelect) {
  return {
    id: assessment.id,
    description: assessment.period,
    amountCents: assessment.amountCents,
    dueDate: assessment.dueDate,
    status: assessment.status,
  };
}

// Board auth middleware — applied only to board routes
async function boardAuthMiddleware(c: AppContext, next: Next) {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
}

// Portal auth middleware — applied only to portal routes
async function portalAuthMiddleware(c: AppContext, next: Next) {
  const token = c.req.header("x-owner-token") ?? c.req.query("token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const db = createDb(c.env);
  const [sess] = await db
    .select()
    .from(ownerPortalSessions)
    .where(
      and(
        eq(ownerPortalSessions.token, token),
        gt(ownerPortalSessions.expiresAt, new Date()),
      ),
    );
  if (!sess) return c.json({ error: "Invalid or expired token" }, 401);

  await assertFeatureTier(db, sess.communityId, "owner-operations");

  await db
    .update(ownerPortalSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(ownerPortalSessions.id, sess.id));

  c.set("homeownerId", sess.homeownerId);
  c.set("communityId", sess.communityId);
  await next();
}

// Issue owner portal token (board member → homeowner invite)
router.post(
  "/owner/sessions",
  boardAuthMiddleware,
  zValidator("json", createOwnerPortalSessionInput),
  async (c) => {
    const { homeownerId, communityId, sendEmail } = c.req.valid("json");
    const db = createDb(c.env);

    let membership: Awaited<ReturnType<typeof requireCapability>>;
    try {
      membership = await requireCapability(
        db,
        communityId,
        c.get("userId"),
        "owner-portal-session:create",
      );
    } catch {
      return c.json({ error: "Forbidden" }, 403);
    }

    await assertFeatureTier(db, communityId, "owner-operations");

    const [homeowner] = await db
      .select()
      .from(homeowners)
      .where(
        and(
          eq(homeowners.id, homeownerId),
          eq(homeowners.communityId, communityId),
          eq(homeowners.active, true),
        ),
      );
    if (!homeowner || homeowner.active === false) {
      return c.json({ error: "Homeowner not found" }, 404);
    }

    const token = nanoid(48);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + OWNER_PORTAL_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    await db
      .update(ownerPortalSessions)
      .set({ expiresAt: now })
      .where(
        and(
          eq(ownerPortalSessions.homeownerId, homeownerId),
          eq(ownerPortalSessions.communityId, communityId),
          gt(ownerPortalSessions.expiresAt, now),
        ),
      );

    const [sess] = await db
      .insert(ownerPortalSessions)
      .values({
        id: nanoid(),
        homeownerId,
        communityId,
        token,
        expiresAt,
      })
      .returning();

    let sent = false;
    if (sendEmail) {
      try {
        const [community] = await db
          .select({ name: communities.name })
          .from(communities)
          .where(eq(communities.id, communityId))
          .limit(1);
        const communityName = community?.name ?? "Your community";
        const portalBaseUrl = (c.env.APP_URL || PUBLIC_APP_URL).replace(
          /\/+$/,
          "",
        );
        const portalUrl = `${portalBaseUrl}/portal?token=${encodeURIComponent(sess.token)}`;
        const email = await buildOwnerPortalInviteEmail(
          {
            firstName: homeowner.firstName,
            email: homeowner.email,
            communityName,
            portalUrl,
            expiresAt: sess.expiresAt,
          },
          c.env,
        );
        await sendOwnerPortalInviteEmail(email, c.env.RESEND_API_KEY);
        sent = true;
      } catch (err) {
        captureException(err, {
          tags: { source: "api", route: "owner-portal-session-email" },
          extra: { communityId, homeownerId },
        });
      }
    }

    try {
      await captureEvent(
        "owner_portal_session_created",
        {
          community_id: communityId,
          invite_sent: sent,
          role: membership.role,
          session_id: sess.id,
        },
        c.get("userId"),
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break owner portal invites.
    }

    return c.json({ token: sess.token, expiresAt: sess.expiresAt, sent }, 201);
  },
);

router.get("/owner/me", portalAuthMiddleware, async (c) => {
  const db = createDb(c.env);
  const homeownerId = c.get("homeownerId") as string;
  const communityId = c.get("communityId") as string;

  const [homeowner] = await db
    .select()
    .from(homeowners)
    .where(
      and(
        eq(homeowners.id, homeownerId),
        eq(homeowners.communityId, communityId),
        eq(homeowners.active, true),
      ),
    );
  if (!homeowner || homeowner.active === false) {
    return c.json({ error: "Not found" }, 404);
  }

  const ownershipDate = new Date().toISOString().slice(0, 10);
  const ownedUnits = await db
    .select({ unitId: unitOwnerships.unitId })
    .from(unitOwnerships)
    .where(
      and(
        eq(unitOwnerships.homeownerId, homeownerId),
        lte(unitOwnerships.startDate, ownershipDate),
        or(
          isNull(unitOwnerships.endDate),
          gte(unitOwnerships.endDate, ownershipDate),
        ),
      ),
    );

  const unitIds = ownedUnits.map((u) => u.unitId);
  const activeUnits =
    unitIds.length > 0
      ? await db
          .select({ id: units.id, unitNumber: units.unitNumber })
          .from(units)
          .where(
            and(
              inArray(units.id, unitIds),
              eq(units.communityId, communityId),
              eq(units.active, true),
            ),
          )
      : [];
  const primaryUnit = activeUnits[0];
  const activeUnitIds = activeUnits.map((unit) => unit.id);

  const ownerAssessments =
    activeUnitIds.length > 0
      ? await db
          .select()
          .from(assessments)
          .where(
            and(
              eq(assessments.communityId, communityId),
              or(
                inArray(assessments.unitId, activeUnitIds),
                isNull(assessments.unitId),
              ),
            ),
          )
      : await db
          .select()
          .from(assessments)
          .where(
            and(
              eq(assessments.communityId, communityId),
              isNull(assessments.unitId),
            ),
          );

  return c.json({
    homeowner: {
      ...homeowner,
      unitId: primaryUnit?.id ?? null,
      unitNumber: primaryUnit?.unitNumber ?? null,
    },
    assessments: ownerAssessments.map(toOwnerPortalAssessment),
  });
});

const ownerPayDuesInput = z.object({
  assessmentId: z.string().min(1),
  amountCents: z.number().int().positive(),
  method: z.enum(["ach", "card"]),
});

router.post(
  "/owner/dues/pay",
  portalAuthMiddleware,
  zValidator("json", ownerPayDuesInput),
  async (c) => {
    const data = c.req.valid("json");
    const db = createDb(c.env);
    const homeownerId = c.get("homeownerId") as string;
    const communityId = c.get("communityId") as string;

    const [assessment] = await db
      .select()
      .from(assessments)
      .where(
        and(
          eq(assessments.id, data.assessmentId),
          eq(assessments.communityId, communityId),
        ),
      )
      .limit(1);

    if (!assessment) return c.json({ error: "Assessment not found" }, 404);
    if (assessment.status !== "pending" && assessment.status !== "past_due") {
      return c.json({ error: "Assessment is not payable" }, 409);
    }
    if (data.amountCents !== assessment.amountCents) {
      return c.json(
        { error: "Payment amount must match the assessment balance" },
        422,
      );
    }

    const [homeowner] = await db
      .select()
      .from(homeowners)
      .where(
        and(
          eq(homeowners.id, homeownerId),
          eq(homeowners.communityId, communityId),
          eq(homeowners.active, true),
        ),
      )
      .limit(1);
    if (!homeowner || homeowner.active === false) {
      return c.json({ error: "Homeowner not found" }, 404);
    }

    if (assessment.unitId) {
      const paymentDate = new Date().toISOString().slice(0, 10);
      const [ownership] = await db
        .select()
        .from(unitOwnerships)
        .where(
          and(
            eq(unitOwnerships.unitId, assessment.unitId),
            eq(unitOwnerships.homeownerId, homeownerId),
            lte(unitOwnerships.startDate, paymentDate),
            or(
              isNull(unitOwnerships.endDate),
              gte(unitOwnerships.endDate, paymentDate),
            ),
          ),
        )
        .limit(1);

      if (!ownership) {
        return c.json(
          { error: "Homeowner does not own the assessed unit" },
          422,
        );
      }

      const [activeUnit] = await db
        .select({ id: units.id })
        .from(units)
        .where(
          and(
            eq(units.id, assessment.unitId),
            eq(units.communityId, communityId),
            eq(units.active, true),
          ),
        )
        .limit(1);

      if (!activeUnit) {
        return c.json(
          { error: "Assessed unit is not active in this community" },
          422,
        );
      }
    }

    await seedDefaultChartOfAccounts(db, communityId);

    // Only reuse a PaymentIntent that belongs to this exact, still-pending
    // request. Without the amount + journalEntryId-null filters, a homeowner
    // returning to pay an assessment that was paid and then reopened (e.g. a
    // refund flipped it back to pending) would be handed the OLD already-settled
    // PaymentIntent's client_secret and could never complete payment. Mirrors
    // the board dues/pay reuse key.
    const [existingPayment] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.assessmentId, data.assessmentId),
          eq(payments.homeownerId, homeownerId),
          eq(payments.amountCents, data.amountCents),
          eq(payments.method, data.method),
          isNull(payments.journalEntryId),
        ),
      )
      .limit(1);

    const stripe = createStripe(c.env);
    if (existingPayment?.stripePaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(
        existingPayment.stripePaymentIntentId,
      );
      await Promise.all([
        captureOwnerPortalEvent(
          "owner_portal_payment_started",
          {
            assessment_id: data.assessmentId,
            community_id: communityId,
            method: data.method,
            reused_pending: true,
            status: assessment.status,
          },
          homeownerId,
          c.env,
        ),
        captureOwnerPortalEvent(
          "owner_portal_checkout_ready",
          {
            assessment_id: data.assessmentId,
            checkout_available: false,
            community_id: communityId,
            method: data.method,
            reused_pending: true,
          },
          homeownerId,
          c.env,
        ),
      ]);
      return c.json(
        {
          clientSecret: existing.client_secret,
          checkoutUrl: null,
          paymentIntentId: existing.id,
        },
        200,
      );
    }

    const portalBaseUrl = (
      (c.env as Env | undefined)?.APP_URL || PUBLIC_APP_URL
    ).replace(/\/+$/, "");
    const token = c.req.header("x-owner-token") ?? c.req.query("token") ?? "";
    const metadata = {
      communityId,
      assessmentId: data.assessmentId,
      homeownerId,
      method: data.method,
      source: "owner_portal",
    };
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        customer: homeowner.stripeCustomerId ?? undefined,
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              product_data: { name: assessment.period },
              unit_amount: data.amountCents,
            },
          },
        ],
        payment_intent_data: { metadata },
        success_url: `${portalBaseUrl}/portal?token=${encodeURIComponent(token)}&checkout=success`,
        cancel_url: `${portalBaseUrl}/portal?token=${encodeURIComponent(token)}&checkout=cancelled`,
        metadata,
      },
      {
        idempotencyKey: [
          "owner-dues",
          communityId,
          homeownerId,
          data.assessmentId,
          data.method,
          data.amountCents,
        ].join(":"),
      },
    );
    await Promise.all([
      captureOwnerPortalEvent(
        "owner_portal_payment_started",
        {
          assessment_id: data.assessmentId,
          community_id: communityId,
          method: data.method,
          status: assessment.status,
        },
        homeownerId,
        c.env,
      ),
      captureOwnerPortalEvent(
        "owner_portal_checkout_ready",
        {
          assessment_id: data.assessmentId,
          checkout_available: Boolean(checkoutSession.url),
          community_id: communityId,
          method: data.method,
        },
        homeownerId,
        c.env,
      ),
    ]);

    return c.json(
      { checkoutUrl: checkoutSession.url, paymentIntentId: null },
      201,
    );
  },
);

router.get("/owner/arch-requests", portalAuthMiddleware, async (c) => {
  const db = createDb(c.env);
  const homeownerId = c.get("homeownerId") as string;
  const communityId = c.get("communityId") as string;
  const rows = await db
    .select()
    .from(archRequests)
    .where(
      and(
        eq(archRequests.homeownerId, homeownerId),
        eq(archRequests.communityId, communityId),
      ),
    );
  return c.json({ archRequests: rows });
});

const createPortalArchRequestInput = z.object({
  requestType: z.string().min(1).max(100),
  description: z.string().min(1),
  unitId: z.string().optional(),
});

router.post(
  "/owner/arch-requests",
  portalAuthMiddleware,
  zValidator("json", createPortalArchRequestInput),
  async (c) => {
    const db = createDb(c.env);
    const homeownerId = c.get("homeownerId") as string;
    const communityId = c.get("communityId") as string;
    const { requestType, description, unitId } = c.req.valid("json");
    const today = new Date().toISOString().slice(0, 10);
    let resolvedUnitId: string;

    const [homeowner] = await db
      .select({ id: homeowners.id })
      .from(homeowners)
      .where(
        and(
          eq(homeowners.id, homeownerId),
          eq(homeowners.communityId, communityId),
          eq(homeowners.active, true),
        ),
      )
      .limit(1);
    if (!homeowner) {
      return c.json({ error: "Homeowner not found" }, 404);
    }

    // Validate that the provided unitId belongs to this community to prevent
    // homeowners from submitting requests against units in other communities.
    if (unitId) {
      const [unit] = await db
        .select({ id: units.id })
        .from(units)
        .where(
          and(
            eq(units.id, unitId),
            eq(units.communityId, communityId),
            eq(units.active, true),
          ),
        )
        .limit(1);
      if (!unit) {
        return c.json({ error: "Unit not found in this community" }, 400);
      }

      const [owned] = await db
        .select({ id: unitOwnerships.id })
        .from(unitOwnerships)
        .where(
          and(
            eq(unitOwnerships.unitId, unitId),
            eq(unitOwnerships.homeownerId, homeownerId),
            lte(unitOwnerships.startDate, today),
            or(
              isNull(unitOwnerships.endDate),
              gte(unitOwnerships.endDate, today),
            ),
          ),
        )
        .limit(1);
      if (!owned) {
        return c.json({ error: "Homeowner does not own unit" }, 400);
      }
      resolvedUnitId = unitId;
    } else {
      const currentOwnerships = await db
        .select({ unitId: unitOwnerships.unitId })
        .from(unitOwnerships)
        .where(
          and(
            eq(unitOwnerships.homeownerId, homeownerId),
            lte(unitOwnerships.startDate, today),
            or(
              isNull(unitOwnerships.endDate),
              gte(unitOwnerships.endDate, today),
            ),
          ),
        );
      const currentUnitIds = currentOwnerships.map(({ unitId }) => unitId);
      if (currentUnitIds.length === 0) {
        return c.json({ error: "Homeowner does not own an active unit" }, 400);
      }

      const [activeUnit] = await db
        .select({ id: units.id })
        .from(units)
        .where(
          and(
            inArray(units.id, currentUnitIds),
            eq(units.communityId, communityId),
            eq(units.active, true),
          ),
        )
        .limit(1);
      if (!activeUnit) {
        return c.json({ error: "Homeowner does not own an active unit" }, 400);
      }
      resolvedUnitId = activeUnit.id;
    }

    const [row] = await db
      .insert(archRequests)
      .values({
        id: nanoid(),
        communityId,
        homeownerId,
        unitId: resolvedUnitId,
        requestType,
        description,
        status: "pending",
      })
      .returning();
    await captureOwnerPortalEvent(
      "owner_portal_arch_request_submitted",
      {
        community_id: communityId,
        has_unit: Boolean(resolvedUnitId),
        request_id: row.id,
        request_type_length: requestType.length,
      },
      homeownerId,
      c.env,
    );
    return c.json({ archRequest: row }, 201);
  },
);

export default router;
