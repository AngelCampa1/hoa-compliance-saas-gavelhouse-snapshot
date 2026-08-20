import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import * as React from "react";
import {
  SubscribeRequestSchema,
  WaitlistSubscribeRequestSchema,
  WaitlistSurveyRequestSchema,
} from "@boardstack/shared";
import { createDb } from "../db/client.js";
import { leads, leadMagnetDownloads } from "../db/schema/index.js";
import { captureEvent } from "../lib/observability.js";
import { buildSignedLeadMagnetDownloadUrl } from "../lib/leadMagnetDownloads.js";
import { sendLeadMagnetEmail } from "../lib/leadMagnetMailer.js";
import { LeadMagnetDelivery } from "../emails/LeadMagnetDelivery.js";
import { getMagnetConfig } from "../emails/content/magnets.js";
import type { Env } from "../types/env.js";
import { enrollSequencerSequence } from "../lib/sequencer.js";
import { verifyTurnstile } from "../lib/turnstile.js";

/** Rate-limit: max subscribe attempts per IP per window (in ms). */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Per-identity throttle. An IP limiter is necessary but insufficient because
 * attackers rotate IPs; this caps how often any single email address can be
 * targeted even from many IPs, blunting email-bombing of a chosen victim.
 */
const EMAIL_RATE_LIMIT_MAX = 3;
const EMAIL_RATE_LIMIT_WINDOW_MS = 600_000;
const PricingClickRequestSchema = z.object({
  tier: z.string().trim().min(1),
  sourcePage: z.string().trim().min(1).optional().nullable(),
  sessionId: z.string().trim().min(1),
  billingPeriod: z.enum(["monthly", "annual", "lifetime"]).optional(),
});

/**
 * In-memory fixed-window rate limiter keyed by `cf-connecting-ip`.
 *
 * This is deliberately minimal. Each Cloudflare Worker instance (colo)
 * carries its own `Map`, so the effective limit is `RATE_LIMIT_MAX` per
 * colo per window — not globally strict. Good enough to stop casual
 * scripted abuse of the public subscribe endpoint. If we ever need a
 * hard global limit we should swap this for a Durable Object or KV-backed
 * counter.
 *
 * Entries are garbage-collected lazily: whenever a request arrives we
 * discard any expired entry for its key before counting.
 */
type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();
const emailRateBuckets = new Map<string, RateBucket>();

export function __resetRateLimiterForTests(): void {
  rateBuckets.clear();
  emailRateBuckets.clear();
}

function takeFixedWindowToken(
  buckets: Map<string, RateBucket>,
  key: string,
  max: number,
  windowMs: number,
  now: number,
): boolean {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= max) {
    return false;
  }
  existing.count += 1;
  return true;
}

function takeRateLimitToken(ip: string, now: number): boolean {
  return takeFixedWindowToken(
    rateBuckets,
    ip,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
    now,
  );
}

function takeEmailRateLimitToken(email: string, now: number): boolean {
  return takeFixedWindowToken(
    emailRateBuckets,
    email,
    EMAIL_RATE_LIMIT_MAX,
    EMAIL_RATE_LIMIT_WINDOW_MS,
    now,
  );
}

/**
 * Honeypot: a hidden form field real users never fill. Any non-empty value is
 * treated as a bot. Callers must respond with a normal success-shaped body and
 * perform no side effects — never reveal detection.
 */
function isHoneypotTripped(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isUniqueConstraintError(err: unknown): boolean {
  const maybe = err as { code?: unknown; cause?: { code?: unknown } };
  return maybe.code === "23505" || maybe.cause?.code === "23505";
}

async function findLeadByEmail(
  db: ReturnType<typeof createDb>,
  email: string,
): Promise<typeof leads.$inferSelect | null> {
  const found = await db
    .select()
    .from(leads)
    .where(eq(leads.email, email))
    .limit(1);
  return found[0] ?? null;
}

async function findLeadBySurveyToken(
  db: ReturnType<typeof createDb>,
  surveyToken: string,
): Promise<typeof leads.$inferSelect | null> {
  const found = await db
    .select()
    .from(leads)
    .where(eq(leads.surveyToken, surveyToken))
    .limit(1);
  return found[0] ?? null;
}

const leadMagnetApp = new Hono<{ Bindings: Env }>();

leadMagnetApp.post(
  "/pricing-click",
  zValidator("json", PricingClickRequestSchema),
  async (c) => {
    const { tier, sourcePage, sessionId, billingPeriod } = c.req.valid("json");

    try {
      await captureEvent(
        "pricing_tier_selected",
        {
          tier,
          source_page: sourcePage ?? null,
          session_id: sessionId,
          billing_period: billingPeriod ?? "monthly",
        },
        sessionId,
        c.env,
      );
    } catch {
      // Analytics should never fail the pricing click endpoint.
    }

    return c.body(null, 204);
  },
);

leadMagnetApp.post("/subscribe", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const userAgent = c.req.header("user-agent") ?? null;

  if (!takeRateLimitToken(ip, Date.now())) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const pathname = new URL(c.req.url).pathname;
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const isLegacyLeadMagnetWaitlistRequest =
    typeof rawBody === "object" && rawBody !== null && "magnetSlug" in rawBody;
  if (pathname.startsWith("/waitlist/") && !isLegacyLeadMagnetWaitlistRequest) {
    const parsed = WaitlistSubscribeRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid request body", issues: parsed.error.issues },
        400,
      );
    }

    const {
      email,
      sourcePage,
      posthogDistinctId,
      utmSource,
      utmMedium,
      utmCampaign,
      referredBy,
      companyWebsite,
      turnstileToken,
    } = parsed.data;

    // Honeypot: silently succeed for bots without touching the DB.
    if (isHoneypotTripped(companyWebsite)) {
      return c.json({ success: true, alreadySubscribed: false });
    }
    // Proof-of-humanity. Fails closed; rejects before any DB write.
    if (
      !(await verifyTurnstile({
        token: turnstileToken,
        ip: ip === "unknown" ? null : ip,
        env: c.env,
      }))
    ) {
      return c.json({ error: "verification_failed" }, 403);
    }
    // Per-identity throttle defeats IP rotation. Apply it only after
    // Turnstile passes so invalid challenge attempts cannot burn a victim's
    // email quota.
    if (!takeEmailRateLimitToken(email, Date.now())) {
      return c.json({ error: "rate_limited" }, 429);
    }

    const db = createDb(c.env);
    let lead = await findLeadByEmail(db, email);
    let leadCreated = false;
    const alreadySubscribed = lead !== null;
    if (!lead) {
      try {
        const insertedLead = await db
          .insert(leads)
          .values({
            email,
            sourcePage: sourcePage ?? null,
            posthogDistinctId: posthogDistinctId ?? null,
          })
          .returning();
        lead = insertedLead[0] ?? null;
        leadCreated = lead !== null;
      } catch (err) {
        if (!isUniqueConstraintError(err)) {
          throw err;
        }
        lead = await findLeadByEmail(db, email);
      }
    }

    if (!lead) {
      throw new Error("Lead upsert failed");
    }

    if (lead.unsubscribedAt !== null) {
      await db
        .update(leads)
        .set({ unsubscribedAt: null })
        .where(eq(leads.id, lead.id));
    }

    const distinctId = posthogDistinctId ?? `lead:${lead.id}`;
    try {
      if (leadCreated) {
        await captureEvent(
          "lead_created",
          {
            lead_type: "waitlist",
            source_page: sourcePage ?? null,
            utm_source: utmSource ?? null,
            utm_medium: utmMedium ?? null,
            utm_campaign: utmCampaign ?? null,
            referred_by: referredBy ?? null,
          },
          distinctId,
          c.env,
        );
      }
      await captureEvent(
        "waitlist_submitted",
        {
          source_page: sourcePage ?? null,
          utm_source: utmSource ?? null,
          utm_medium: utmMedium ?? null,
          utm_campaign: utmCampaign ?? null,
          referred_by: referredBy ?? null,
        },
        distinctId,
        c.env,
      );
    } catch {
      // Analytics must never crash the request.
    }

    return c.json({
      success: true,
      alreadySubscribed,
      surveyToken: lead.surveyToken,
    });
  }

  const parsed = SubscribeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      400,
    );
  }

  const {
    email,
    magnetSlug,
    sourcePage,
    posthogDistinctId,
    companyWebsite,
    turnstileToken,
  } = parsed.data;

  // Honeypot: return the normal success shape (a signed download URL) without
  // any DB write, email send, or enrollment. Signing is side-effect-free, so
  // the bot sees a response indistinguishable from a real one.
  if (isHoneypotTripped(companyWebsite)) {
    const honeypotUrl = await buildSignedLeadMagnetDownloadUrl({
      slug: magnetSlug,
      env: c.env,
      now: new Date(),
    });
    return c.json({ downloadUrl: honeypotUrl, alreadySubscribed: true });
  }
  // Proof-of-humanity. Fails closed; rejects before any DB write or email send.
  if (
    !(await verifyTurnstile({
      token: turnstileToken,
      ip: ip === "unknown" ? null : ip,
      env: c.env,
    }))
  ) {
    return c.json({ error: "verification_failed" }, 403);
  }
  // Per-identity throttle defeats IP rotation. Apply it only after Turnstile
  // passes so invalid challenge attempts cannot burn a victim's email quota.
  if (!takeEmailRateLimitToken(email, Date.now())) {
    return c.json({ error: "rate_limited" }, 429);
  }

  const db = createDb(c.env);

  // 1) Upsert the lead by email. Because `leads.email` is citext UNIQUE,
  //    concurrent first submissions can race between select and insert; when
  //    that happens, recover by re-reading the row that won the race.
  let lead = await findLeadByEmail(db, email);
  let leadCreated = false;
  if (!lead) {
    try {
      const insertedLead = await db
        .insert(leads)
        .values({
          email,
          sourcePage: sourcePage ?? null,
          posthogDistinctId: posthogDistinctId ?? null,
        })
        .returning();
      lead = insertedLead[0] ?? null;
      leadCreated = lead !== null;
    } catch (err) {
      if (!isUniqueConstraintError(err)) {
        throw err;
      }
      lead = await findLeadByEmail(db, email);
    }
  }

  if (!lead) {
    throw new Error("Lead upsert failed");
  }

  const wasUnsubscribed = lead.unsubscribedAt !== null;
  if (wasUnsubscribed) {
    await db
      .update(leads)
      .set({ unsubscribedAt: null })
      .where(eq(leads.id, lead.id));
  }

  const leadId = lead.id;

  // 2) Record a download row. The (lead_id, magnet_slug) unique index
  //    means duplicates are no-ops — .returning() is empty when the
  //    row already existed. Capture `ip` and `user_agent` for
  //    abuse-investigation audit trail.
  const downloadRows = await db
    .insert(leadMagnetDownloads)
    .values({
      leadId,
      magnetSlug,
      ip: ip === "unknown" ? null : ip,
      userAgent,
    })
    .onConflictDoNothing()
    .returning();
  const inserted = downloadRows.length > 0;

  const now = new Date();
  let downloadUrl: string;
  try {
    downloadUrl = await buildSignedLeadMagnetDownloadUrl({
      slug: magnetSlug,
      env: c.env,
      now,
    });
  } catch {
    try {
      await captureEvent(
        "lead_magnet_download_failed",
        { content_slug: magnetSlug, failure_type: "url_generation_failed" },
        posthogDistinctId ?? `lead:${lead.id}`,
        c.env,
      );
    } catch {
      // Analytics must never crash the request.
    }
    throw new Error("Failed to generate download URL");
  }

  try {
    await captureEvent(
      "lead_magnet_download_ready",
      { content_slug: magnetSlug, already_subscribed: !inserted },
      posthogDistinctId ?? `lead:${lead.id}`,
      c.env,
    );
  } catch {
    // Analytics must never crash the request.
  }

  // Gate every outbound side effect on whether the download row was actually
  // new. An idempotent write alone is not enough: the email send and sequencer
  // enrollment are what cost money and sender reputation, so they must only
  // fire the first time this (email, magnet) pair is seen. A duplicate
  // submission still gets the success-shaped response with a working download
  // URL below, but triggers no email and no enrollment — closing the
  // email-bombing relay. (Reactivating an unsubscribed lead above is a state
  // fix, not an outbound effect, so it stays ungated.)
  if (inserted) {
    const magnet = getMagnetConfig(magnetSlug);
    const deliveryExpires = new URL(downloadUrl).searchParams.get("expires")!;

    await sendLeadMagnetEmail({
      to: email,
      subject: magnet.deliverySubject,
      react: React.createElement(LeadMagnetDelivery, {
        magnet,
        downloadUrl,
        companyPostalAddress: c.env.COMPANY_POSTAL_ADDRESS ?? "",
      }),
      magnetSlug,
      step: 0,
      enrollmentId: `${leadId}:${magnetSlug}:${deliveryExpires}`,
      env: c.env,
    });

    // First-time download for this email+magnet → enroll in the central
    // Sequencer nurture sequence.
    await enrollSequencerSequence(c.env, {
      email,
      sequenceSlug: "boardstack-nurture-value-1",
      externalId: `${leadId}:${magnetSlug}`,
      metadata: {
        leadId,
        magnetSlug,
        sourcePage: sourcePage ?? null,
        posthogDistinctId: posthogDistinctId ?? null,
        wasUnsubscribed,
      },
    });
  }

  // 4) Fire-and-await PostHog capture, but swallow errors so analytics
  //    issues never fail the subscription request.
  const distinctId = posthogDistinctId ?? `lead:${lead.id}`;
  try {
    if (leadCreated) {
      await captureEvent(
        "lead_created",
        {
          lead_type: "lead_magnet",
          content_slug: magnetSlug,
          source_page: sourcePage ?? null,
        },
        distinctId,
        c.env,
      );
    }
    await captureEvent(
      "lead_magnet_submitted",
      {
        content_slug: magnetSlug,
        source_page: sourcePage ?? null,
        already_subscribed: !inserted,
      },
      distinctId,
      c.env,
    );
  } catch {
    // Analytics must never crash the request — swallow and continue.
  }

  return c.json({
    downloadUrl,
    alreadySubscribed: !inserted,
  });
});

leadMagnetApp.post(
  "/survey",
  zValidator("json", WaitlistSurveyRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Invalid request body", issues: result.error.issues },
        400,
      );
    }
  }),
  async (c) => {
    const { surveyToken, answers } = c.req.valid("json");
    const db = createDb(c.env);
    const lead = await findLeadBySurveyToken(db, surveyToken);
    if (!lead) {
      return c.json({ error: "Survey token not found" }, 404);
    }
    if (lead.surveyCompletedAt != null) {
      return c.json({ error: "Survey already submitted" }, 409);
    }

    const updated = await db
      .update(leads)
      .set({
        surveyAnswers: answers,
        surveyCompletedAt: new Date(),
      })
      .where(and(eq(leads.id, lead.id), isNull(leads.surveyCompletedAt)))
      .returning({ id: leads.id });
    if (updated.length === 0) {
      return c.json({ error: "Survey already submitted" }, 409);
    }

    try {
      await captureEvent(
        "waitlist_survey_submitted",
        {
          answer_count: answers.length,
          source_page: lead.sourcePage,
        },
        lead.posthogDistinctId ?? `lead:${lead.id}`,
        c.env,
      );
    } catch {
      // Analytics must never crash the request.
    }

    return c.json({ success: true });
  },
);

export default leadMagnetApp;
