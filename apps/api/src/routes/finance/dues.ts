import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, lte, gte, or, isNull, sql, asc, inArray } from "drizzle-orm";
import {
  createUnitInput,
  createHomeownerInput,
  createAssessmentInput,
  createAssessmentBatchInput,
  payDuesInput,
} from "@boardstack/shared";
import { createDb } from "../../db/client.js";
import {
  units,
  homeowners,
  assessments,
  payments,
  unitOwnerships,
} from "../../db/schema/dues.js";
import { accounts } from "../../db/schema/accounts.js";
import { communityActivation } from "../../db/schema/activation.js";
import { communityMembers } from "../../db/schema/tenancy.js";
import type { Env } from "../../types/env.js";
import { getAuth } from "../../lib/auth.js";
import { nanoid } from "../../lib/nanoid.js";
import { captureEvent, captureException } from "../../lib/observability.js";
import { postEntry } from "../../domain/accounting/postEntry.js";
import { seedDefaultChartOfAccounts } from "../../domain/accounting/seed.js";
import { createStripe } from "../../lib/stripe-client.js";
import {
  assertFeatureTier,
  assertHomeLimit,
} from "../../domain/policy/access.js";
import {
  acquireXactLock,
  assessmentLockKey,
  homeLockKey,
} from "../../domain/policy/locks.js";

type Variables = { userId: string };

const financeDuesRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

const WRITE_ROLES = ["owner", "admin", "treasurer"] as const;

/**
 * Thrown inside the dues-pay transaction when the under-lock re-validation
 * rejects the payment, so the surrounding handler can roll back and map it to
 * the correct HTTP status.
 */
class DuesPaymentError extends Error {
  constructor(
    readonly kind: "not_payable" | "exceeds",
    readonly outstanding = 0,
  ) {
    super(kind);
    this.name = "DuesPaymentError";
  }
}

// Auth middleware
financeDuesRouter.use("/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", session.user.id);
  await next();
});

async function requireWriteMembership(
  db: ReturnType<typeof createDb>,
  communityId: string,
  userId: string,
) {
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

  if (!membership) return { error: "Forbidden", status: 403 as const };
  if (!(WRITE_ROLES as readonly string[]).includes(membership.role)) {
    return { error: "Forbidden", status: 403 as const };
  }
  return { membership };
}

async function requireReadMembership(
  db: ReturnType<typeof createDb>,
  communityId: string,
  userId: string,
) {
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

  if (!membership) return { error: "Forbidden", status: 403 as const };
  return { membership };
}

// GET /finance/units
financeDuesRouter.get("/finance/units", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId is required" }, 400);

  const userId = c.get("userId");
  const db = createDb(c.env);

  const check = await requireReadMembership(db, communityId, userId);
  if ("error" in check) return c.json({ error: check.error }, check.status);

  const rows = await db
    .select()
    .from(units)
    .where(eq(units.communityId, communityId));

  return c.json({ units: rows });
});

// POST /finance/units
financeDuesRouter.post(
  "/finance/units",
  zValidator("json", createUnitInput),
  async (c) => {
    const data = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);

    const check = await requireWriteMembership(db, data.communityId, userId);
    if ("error" in check) return c.json({ error: check.error }, check.status);

    await assertFeatureTier(db, data.communityId, "owner-operations");

    const unitId = nanoid();
    // Hold the per-community home lock across the cap check and the insert so
    // concurrent unit creates cannot jointly overshoot the tier's home cap.
    await db.transaction(async (tx) => {
      await acquireXactLock(tx, homeLockKey(data.communityId));
      await assertHomeLimit(tx, data.communityId, 1);
      await tx.insert(units).values({
        id: unitId,
        communityId: data.communityId,
        address: data.address,
        unitNumber: data.unitNumber ?? null,
        sqft: data.sqft ?? null,
      });
    });

    return c.json({ unitId }, 201);
  },
);

// GET /finance/homeowners
financeDuesRouter.get("/finance/homeowners", async (c) => {
  const communityId = c.req.query("communityId");
  if (!communityId) return c.json({ error: "communityId is required" }, 400);

  const userId = c.get("userId");
  const db = createDb(c.env);

  const check = await requireReadMembership(db, communityId, userId);
  if ("error" in check) return c.json({ error: check.error }, check.status);

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
      stripeCustomerId: homeowners.stripeCustomerId,
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
    .where(
      and(eq(homeowners.communityId, communityId), eq(homeowners.active, true)),
    );

  const dedupedRows = Array.from(
    rows
      .reduce((byHomeowner, row) => {
        if (!byHomeowner.has(row.id)) byHomeowner.set(row.id, row);
        return byHomeowner;
      }, new Map<string, (typeof rows)[number]>())
      .values(),
  );

  return c.json({ homeowners: dedupedRows });
});

// POST /finance/homeowners
financeDuesRouter.post(
  "/finance/homeowners",
  zValidator("json", createHomeownerInput),
  async (c) => {
    const data = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);

    const check = await requireWriteMembership(db, data.communityId, userId);
    if ("error" in check) return c.json({ error: check.error }, check.status);
    await assertFeatureTier(db, data.communityId, "owner-operations");

    const homeownerId = nanoid();
    let stripeCustomerId: string | null = null;

    try {
      const stripe = createStripe(c.env);
      const customer = await stripe.customers.create({
        email: data.email,
        name: `${data.firstName} ${data.lastName}`,
        metadata: { communityId: data.communityId, homeownerId },
      });
      stripeCustomerId = customer.id;
    } catch (err) {
      captureException(err, {
        tags: { source: "stripe-customer-create" },
        extra: { communityId: data.communityId },
      });
    }

    await db.insert(homeowners).values({
      id: homeownerId,
      communityId: data.communityId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone ?? null,
      moveInDate: data.moveInDate ?? null,
      stripeCustomerId,
    });

    return c.json({ homeownerId }, 201);
  },
);

const assessmentPaginationQuery = z.object({
  communityId: z.string().min(1),
  period: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

// GET /finance/assessments
financeDuesRouter.get("/finance/assessments", async (c) => {
  const rawQuery = {
    communityId: c.req.query("communityId"),
    period: c.req.query("period"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const parsed = assessmentPaginationQuery.safeParse(rawQuery);
  if (!parsed.success) {
    return c.json({ error: "Invalid query parameters" }, 400);
  }

  const { communityId, period, limit, offset } = parsed.data;

  const userId = c.get("userId");
  const db = createDb(c.env);

  const check = await requireReadMembership(db, communityId, userId);
  if ("error" in check) return c.json({ error: check.error }, check.status);

  const whereClause = period
    ? and(
        eq(assessments.communityId, communityId),
        eq(assessments.period, period),
      )
    : eq(assessments.communityId, communityId);

  // Fetch one extra row to determine if more results exist beyond this page
  const rows = await db
    .select()
    .from(assessments)
    .where(whereClause)
    .orderBy(asc(assessments.createdAt), asc(assessments.id))
    .limit(limit + 1)
    .offset(offset);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(assessments)
    .where(whereClause);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return c.json({
    assessments: page,
    total: Number(countRow?.total ?? 0),
    limit,
    offset,
    hasMore,
  });
});

// POST /finance/assessments
financeDuesRouter.post(
  "/finance/assessments",
  zValidator("json", createAssessmentInput),
  async (c) => {
    const data = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);

    const check = await requireWriteMembership(db, data.communityId, userId);
    if ("error" in check) return c.json({ error: check.error }, check.status);

    await assertFeatureTier(db, data.communityId, "owner-operations");

    const [unit] = await db
      .select({ id: units.id })
      .from(units)
      .where(
        and(eq(units.id, data.unitId), eq(units.communityId, data.communityId)),
      )
      .limit(1);

    if (!unit) {
      return c.json(
        { error: "Unit must belong to the assessment community" },
        400,
      );
    }

    const assessmentId = nanoid();
    await db.insert(assessments).values({
      id: assessmentId,
      communityId: data.communityId,
      unitId: data.unitId,
      period: data.period,
      amountCents: data.amountCents,
      fundType: data.fundType,
      dueDate: data.dueDate,
    });

    // Flip dueBatchConfigured with a conflict-safe upsert. communityId is UNIQUE,
    // so a check-then-insert would let two concurrent setup submits both miss the
    // row and race into a 23505 unique-violation. onConflictDoUpdate is idempotent.
    await db
      .insert(communityActivation)
      .values({
        id: nanoid(),
        communityId: data.communityId,
        dueBatchConfigured: true,
        dueBatchConfiguredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: communityActivation.communityId,
        set: {
          dueBatchConfigured: true,
          dueBatchConfiguredAt: new Date(),
          updatedAt: new Date(),
        },
      });

    return c.json({ assessmentId }, 201);
  },
);

// POST /finance/assessments/batch
financeDuesRouter.post(
  "/finance/assessments/batch",
  zValidator("json", createAssessmentBatchInput),
  async (c) => {
    const data = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);

    const check = await requireWriteMembership(db, data.communityId, userId);
    if ("error" in check) return c.json({ error: check.error }, check.status);

    await assertFeatureTier(db, data.communityId, "owner-operations");

    const distinctUnitIds = [...new Set(data.unitIds)];
    const matchedUnits = await db
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          inArray(units.id, distinctUnitIds),
          eq(units.communityId, data.communityId),
        ),
      );

    if (matchedUnits.length !== distinctUnitIds.length) {
      return c.json(
        { error: "Unit must belong to the assessment community" },
        400,
      );
    }

    const assessmentIds: string[] = distinctUnitIds.map(() => nanoid());

    await db.transaction(async (tx) => {
      for (let i = 0; i < distinctUnitIds.length; i++) {
        await tx.insert(assessments).values({
          id: assessmentIds[i]!,
          communityId: data.communityId,
          unitId: distinctUnitIds[i]!,
          period: data.period,
          amountCents: data.amountCents,
          fundType: data.fundType,
          dueDate: data.dueDate,
        });
      }
    });

    // Flip dueBatchConfigured with a conflict-safe upsert. communityId is UNIQUE,
    // so a check-then-insert would let two concurrent setup submits both miss the
    // row and race into a 23505 unique-violation. onConflictDoUpdate is idempotent.
    await db
      .insert(communityActivation)
      .values({
        id: nanoid(),
        communityId: data.communityId,
        dueBatchConfigured: true,
        dueBatchConfiguredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: communityActivation.communityId,
        set: {
          dueBatchConfigured: true,
          dueBatchConfiguredAt: new Date(),
          updatedAt: new Date(),
        },
      });

    try {
      await captureEvent(
        "dues_batch_created",
        {
          amount_cents: data.amountCents,
          assessment_count: assessmentIds.length,
          community_id: data.communityId,
          distinct_unit_count: distinctUnitIds.length,
          fund_type: data.fundType,
          period: data.period,
          role: check.membership.role,
        },
        userId,
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break assessment creation.
    }

    return c.json({ assessmentIds }, 201);
  },
);

// POST /finance/dues/pay
financeDuesRouter.post(
  "/finance/dues/pay",
  zValidator("json", payDuesInput),
  async (c) => {
    const data = c.req.valid("json");
    const userId = c.get("userId");
    const db = createDb(c.env);

    const check = await requireWriteMembership(db, data.communityId, userId);
    if ("error" in check) return c.json({ error: check.error }, check.status);

    await assertFeatureTier(db, data.communityId, "owner-operations");

    // Verify assessment belongs to this community
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(
        and(
          eq(assessments.id, data.assessmentId),
          eq(assessments.communityId, data.communityId),
        ),
      )
      .limit(1);

    if (!assessment) return c.json({ error: "Assessment not found" }, 404);
    if (assessment.status !== "pending" && assessment.status !== "past_due") {
      return c.json({ error: "Assessment is not payable" }, 409);
    }

    // Compute the outstanding balance from the payment ledger so that partial
    // payments already recorded are taken into account.
    const [paidRow] = await db
      .select({
        paidCents:
          sql<number>`coalesce(sum(${payments.amountCents}), 0)`.mapWith(
            Number,
          ),
      })
      .from(payments)
      .where(eq(payments.assessmentId, data.assessmentId));
    const alreadyPaidCents = paidRow?.paidCents ?? 0;
    const outstandingCents = assessment.amountCents - alreadyPaidCents;

    if (data.amountCents > outstandingCents) {
      return c.json(
        {
          error: `Payment amount exceeds outstanding balance of ${outstandingCents} cents`,
        },
        400,
      );
    }

    // Verify homeowner belongs to this community
    const [homeowner] = await db
      .select()
      .from(homeowners)
      .where(
        and(
          eq(homeowners.id, data.homeownerId),
          eq(homeowners.communityId, data.communityId),
        ),
      )
      .limit(1);

    if (!homeowner) return c.json({ error: "Homeowner not found" }, 404);
    if (assessment.unitId) {
      const paymentDate = new Date().toISOString().slice(0, 10);
      const [ownership] = await db
        .select()
        .from(unitOwnerships)
        .where(
          and(
            eq(unitOwnerships.unitId, assessment.unitId),
            eq(unitOwnerships.homeownerId, data.homeownerId),
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
    }

    await seedDefaultChartOfAccounts(db, data.communityId);

    if (data.method === "ach" || data.method === "card") {
      // Guard: if a pending payment already exists for this exact request,
      // return the existing PI client_secret instead of creating a duplicate.
      // The reuse key must be the full request identity — same homeowner, same
      // amount, same method, same assessment — AND the payment must still be
      // pending (journalEntryId null). Matching on assessment + method alone
      // would hand a second homeowner (or the same homeowner paying a different
      // amount, or a re-pay after the first PI already succeeded) the WRONG
      // PaymentIntent: wrong payer, wrong amount, or an unusable captured PI.
      const [existingPayment] = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.assessmentId, data.assessmentId),
            eq(payments.homeownerId, data.homeownerId),
            eq(payments.amountCents, data.amountCents),
            eq(payments.method, data.method),
            isNull(payments.journalEntryId),
          ),
        )
        .limit(1);

      if (existingPayment?.stripePaymentIntentId) {
        const stripe = createStripe(c.env);
        const existing = await stripe.paymentIntents.retrieve(
          existingPayment.stripePaymentIntentId,
        );
        try {
          await captureEvent(
            "dues_payment_started",
            {
              amount_cents: data.amountCents,
              assessment_id: data.assessmentId,
              community_id: data.communityId,
              fund_type: assessment.fundType,
              method: data.method,
              reused_pending: true,
              role: check.membership.role,
            },
            userId,
            c.env,
          );
        } catch {
          // Analytics is best-effort and must not break payment initiation.
        }
        return c.json(
          {
            clientSecret: existing.client_secret,
            paymentIntentId: existing.id,
          },
          200,
        );
      }

      const stripe = createStripe(c.env);
      const pi = await stripe.paymentIntents.create({
        amount: data.amountCents,
        currency: "usd",
        customer: homeowner.stripeCustomerId ?? undefined,
        metadata: {
          communityId: data.communityId,
          assessmentId: data.assessmentId,
          homeownerId: data.homeownerId,
          method: data.method,
        },
      });

      // Reserve the amount UNDER the per-assessment advisory lock. Creating the
      // PI above moved no money (capture happens later when the payer confirms),
      // so the correct prevention point for over-reservation is here: two
      // concurrent ach/card requests that both pass the pre-lock outstanding
      // check would otherwise both insert a pending row and jointly over-collect
      // once both PIs are captured. The lock serializes them so the second sees
      // the first's committed reservation and is rejected. If the reservation is
      // rejected we MUST cancel the already-created PI so no orphaned capturable
      // PI remains; the cancel happens after the tx (the network call must not
      // run while the advisory lock is held).
      const paymentId = nanoid();
      try {
        await db.transaction(async (tx) => {
          await acquireXactLock(tx, assessmentLockKey(data.assessmentId));

          const [lockedAssessment] = await tx
            .select({
              amountCents: assessments.amountCents,
              status: assessments.status,
            })
            .from(assessments)
            .where(eq(assessments.id, data.assessmentId))
            .limit(1);
          if (
            !lockedAssessment ||
            (lockedAssessment.status !== "pending" &&
              lockedAssessment.status !== "past_due")
          ) {
            throw new DuesPaymentError("not_payable");
          }

          const [lockedPaidRow] = await tx
            .select({
              paidCents:
                sql<number>`coalesce(sum(${payments.amountCents}), 0)`.mapWith(
                  Number,
                ),
            })
            .from(payments)
            .where(eq(payments.assessmentId, data.assessmentId));
          const lockedPaidCents = lockedPaidRow?.paidCents ?? 0;
          const lockedOutstandingCents =
            lockedAssessment.amountCents - lockedPaidCents;
          if (data.amountCents > lockedOutstandingCents) {
            throw new DuesPaymentError("exceeds", lockedOutstandingCents);
          }

          // Insert the pending payments row INSIDE the locked tx so concurrent
          // siblings see this reservation, and payment stays tracked even if the
          // webhook is lost.
          await tx.insert(payments).values({
            id: paymentId,
            assessmentId: data.assessmentId,
            homeownerId: data.homeownerId,
            amountCents: data.amountCents,
            method: data.method,
            stripePaymentIntentId: pi.id,
            journalEntryId: null,
          });
        });
      } catch (err) {
        if (err instanceof DuesPaymentError) {
          // The PI was created before the lock; cancel it so no orphaned
          // capturable PI survives the rejected reservation. A cancel failure is
          // a lesser evil than masking the original rejection with a 500.
          try {
            await stripe.paymentIntents.cancel(pi.id);
          } catch {
            // Swallow cancel errors — an uncanceled PI is preferable to a 500.
            // Emit an observability signal so the orphaned capturable PI is
            // reconcilable. Analytics is best-effort and must not surface here.
            try {
              await captureEvent(
                "dues_payment_pi_cancel_failed",
                {
                  community_id: data.communityId,
                  assessment_id: data.assessmentId,
                  pi_id: pi.id,
                },
                userId,
                c.env,
              );
            } catch {
              // Analytics failure must never break the rejection control flow.
            }
          }
          if (err.kind === "not_payable") {
            return c.json({ error: "Assessment is not payable" }, 409);
          }
          return c.json(
            {
              error: `Payment amount exceeds outstanding balance of ${err.outstanding} cents`,
            },
            400,
          );
        }
        throw err;
      }

      try {
        await captureEvent(
          "dues_payment_started",
          {
            amount_cents: data.amountCents,
            assessment_id: data.assessmentId,
            community_id: data.communityId,
            fund_type: assessment.fundType,
            method: data.method,
            reused_pending: false,
            role: check.membership.role,
          },
          userId,
          c.env,
        );
      } catch {
        // Analytics is best-effort and must not break payment initiation.
      }

      return c.json(
        { clientSecret: pi.client_secret, paymentIntentId: pi.id },
        201,
      );
    }

    // method === 'check' | 'other' — record immediately
    const accountCode = assessment.fundType === "operating" ? "4000" : "4100";

    // Look up the revenue account by code + communityId
    const [revenueAccount] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.communityId, data.communityId),
          eq(accounts.code, accountCode),
        ),
      )
      .limit(1);

    if (!revenueAccount) {
      return c.json(
        {
          error: `Revenue account ${accountCode} not found for this community`,
        },
        422,
      );
    }

    // Look up a cash/AR account (code 1000 for operating, 1500 for reserve)
    const cashCode = assessment.fundType === "operating" ? "1000" : "1500";
    const [cashAccount] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.communityId, data.communityId),
          eq(accounts.code, cashCode),
        ),
      )
      .limit(1);

    if (!cashAccount) {
      return c.json(
        { error: `Cash account ${cashCode} not found for this community` },
        422,
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const paymentId = nanoid();

    // A partial payment must NOT change the assessment's classification — it
    // only records money. Only a payment that settles the full balance flips
    // the row to "paid". Preserving the prior status keeps an overdue
    // assessment (status "past_due", e.g. a failed Stripe dues payment) flagged
    // as overdue; demoting it to "pending" would silently clear the arrears
    // flag and drop it out of the past_due portfolio rollup.
    let newStatus: "pending" | "past_due" | "paid";

    try {
      newStatus = await db.transaction(async (tx) => {
        // Serialize concurrent payments against this assessment: hold the
        // advisory lock, then re-read status and the payment ledger UNDER it.
        // The pre-lock outstanding check above is only a fast-fail; two
        // payments that both passed it would otherwise both insert and
        // over-collect (payments are non-unique per assessment, so onConflict
        // cannot backstop this). Under the lock the second payment sees the
        // first's committed row and is rejected.
        await acquireXactLock(tx, assessmentLockKey(data.assessmentId));

        const [lockedAssessment] = await tx
          .select({
            amountCents: assessments.amountCents,
            status: assessments.status,
          })
          .from(assessments)
          .where(eq(assessments.id, data.assessmentId))
          .limit(1);
        if (
          !lockedAssessment ||
          (lockedAssessment.status !== "pending" &&
            lockedAssessment.status !== "past_due")
        ) {
          throw new DuesPaymentError("not_payable");
        }

        const [lockedPaidRow] = await tx
          .select({
            paidCents:
              sql<number>`coalesce(sum(${payments.amountCents}), 0)`.mapWith(
                Number,
              ),
          })
          .from(payments)
          .where(eq(payments.assessmentId, data.assessmentId));
        const lockedPaidCents = lockedPaidRow?.paidCents ?? 0;
        const lockedOutstandingCents =
          lockedAssessment.amountCents - lockedPaidCents;
        if (data.amountCents > lockedOutstandingCents) {
          throw new DuesPaymentError("exceeds", lockedOutstandingCents);
        }

        const computedStatus: "pending" | "past_due" | "paid" =
          lockedPaidCents + data.amountCents >= lockedAssessment.amountCents
            ? "paid"
            : lockedAssessment.status;

        const entryResult = await postEntry(tx, {
          communityId: data.communityId,
          createdByUserId: userId,
          entryDate: today,
          memo: `Dues payment — assessment ${data.assessmentId}`,
          lines: [
            {
              accountId: cashAccount.id,
              debitCents: data.amountCents,
              creditCents: 0,
            },
            {
              accountId: revenueAccount.id,
              debitCents: 0,
              creditCents: data.amountCents,
            },
          ],
        });

        await tx.insert(payments).values({
          id: paymentId,
          assessmentId: data.assessmentId,
          homeownerId: data.homeownerId,
          amountCents: data.amountCents,
          method: data.method,
          stripePaymentIntentId: null,
          journalEntryId: entryResult.entryId,
        });

        await tx
          .update(assessments)
          .set({ status: computedStatus, updatedAt: new Date() })
          .where(eq(assessments.id, data.assessmentId));

        return computedStatus;
      });
    } catch (err) {
      if (err instanceof DuesPaymentError) {
        if (err.kind === "not_payable") {
          return c.json({ error: "Assessment is not payable" }, 409);
        }
        return c.json(
          {
            error: `Payment amount exceeds outstanding balance of ${err.outstanding} cents`,
          },
          400,
        );
      }
      throw err;
    }

    try {
      await captureEvent(
        "dues_payment_recorded",
        {
          amount_cents: data.amountCents,
          assessment_id: data.assessmentId,
          community_id: data.communityId,
          fund_type: assessment.fundType,
          method: data.method,
          paid_in_full: newStatus === "paid",
          payment_id: paymentId,
          role: check.membership.role,
        },
        userId,
        c.env,
      );
    } catch {
      // Analytics is best-effort and must not break payment recording.
    }

    return c.json({ paymentId }, 201);
  },
);

export default financeDuesRouter;
