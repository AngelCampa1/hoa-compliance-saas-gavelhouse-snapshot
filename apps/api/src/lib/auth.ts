import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import {
  BRAND_DOMAIN,
  FULL_TRIAL_TIER,
  TRIAL_DURATION_DAYS,
} from "@boardstack/shared";
import type { Env } from "../types/env.js";
import { createDb } from "../db/client.js";
import { nanoid } from "./nanoid.js";
import {
  communities,
  communityMembers,
  subscriptions,
  communityActivation,
  churnReasons,
  feedbackSubmissions,
  portfolios,
} from "../db/schema/index.js";
import {
  buildSignupConfirmationEmail,
  sendSignupEmail,
} from "../domain/signup/signupEmails.js";
import { insertDefaultChartOfAccounts } from "../domain/accounting/seed.js";
import { captureException } from "./observability.js";
import { enrollSequencerSequence } from "./sequencer.js";
import { captureEvent } from "./observability.js";

function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 56) +
    "-" +
    nanoid(6).toLowerCase()
  );
}

function buildAdvancedOptions(
  appUrl: string,
): { crossSubDomainCookies: { enabled: true; domain: string } } | undefined {
  if (appUrl.includes(BRAND_DOMAIN)) {
    return {
      crossSubDomainCookies: {
        enabled: true,
        domain: `.${BRAND_DOMAIN}`,
      },
    };
  }
  return undefined;
}

export function buildTrustedOrigins(env: Env): string[] {
  const origins = [env.APP_URL];

  if (
    !env.APP_URL.includes(BRAND_DOMAIN) ||
    !env.BETTER_AUTH_URL.includes(BRAND_DOMAIN)
  ) {
    origins.push("http://localhost:3060", "http://localhost:3061");
  }

  return origins;
}

function getGoogleProvider(env: Env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return undefined;
  }

  return {
    google: {
      clientId,
      clientSecret,
    },
  };
}

function buildMountedAuthUrl(url: string): string {
  const parsed = new URL(url);
  if (!parsed.pathname.startsWith("/api/auth/")) {
    parsed.pathname = `/api/auth${parsed.pathname}`;
  }
  if (!parsed.searchParams.has("callbackURL")) {
    parsed.searchParams.set("callbackURL", "/billing");
  }
  return parsed.toString();
}

export function getAuthProviders(env: Env): { google: boolean } {
  return {
    google: getGoogleProvider(env) !== undefined,
  };
}

async function assertUserCanBeDeleted(
  env: Env,
  userToDelete: { id: string },
): Promise<void> {
  const hookDb = createDb(env);
  const ownedCommunities = await hookDb
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.ownerUserId, userToDelete.id));
  if (ownedCommunities.length > 0) {
    throw new APIError("BAD_REQUEST", {
      message:
        "Transfer or close owned communities before deleting your account.",
    });
  }

  const ownedPortfolios = await hookDb
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.ownerUserId, userToDelete.id));
  if (ownedPortfolios.length > 0) {
    throw new APIError("BAD_REQUEST", {
      message: "Delete your portfolios before deleting your account.",
    });
  }

  const churnRows = await hookDb
    .select({ id: churnReasons.id })
    .from(churnReasons)
    .where(eq(churnReasons.userId, userToDelete.id));
  if (churnRows.length > 0) {
    throw new APIError("BAD_REQUEST", {
      message:
        "Contact support to finish account deletion because billing records reference your user.",
    });
  }
}

async function cleanupProfileDataAfterDelete(
  env: Env,
  userToDelete: { id: string },
): Promise<void> {
  await createDb(env)
    .delete(feedbackSubmissions)
    .where(eq(feedbackSubmissions.userId, userToDelete.id));
}

export function createAuth(env: Env) {
  const db = createDb(env);
  const advanced = buildAdvancedOptions(env.APP_URL);
  const socialProviders = getGoogleProvider(env);
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    ...(advanced !== undefined ? { advanced } : {}),
    trustedOrigins: buildTrustedOrigins(env),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await assertUserCanBeDeleted(env, user);
        },
        afterDelete: async (user) => {
          await cleanupProfileDataAfterDelete(env, user);
        },
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({
        user,
        url,
      }: {
        user: { email: string; name?: string | null };
        url: string;
      }) => {
        // Local development runs without a Resend key, and failing the signup
        // request over a missing dev credential makes the app unusable offline.
        // Skipping the send outside production is safe; skipping it silently in
        // production would drop every verification email with no signal
        // anywhere, so report that. Same shape as verifyTurnstile's handling of
        // an unset TURNSTILE_SECRET_KEY.
        if (!env.RESEND_API_KEY) {
          if (env.SENTRY_ENVIRONMENT === "production") {
            captureException(
              new Error(
                "RESEND_API_KEY is unset in production; signup verification " +
                  "emails are not being sent. Set it via `wrangler secret put`.",
              ),
              { tags: { component: "auth" } },
            );
          }
          return;
        }
        await sendSignupEmail(
          await buildSignupConfirmationEmail(
            {
              email: user.email,
              recipientName: user.name,
              verificationUrl: buildMountedAuthUrl(url),
            },
            env,
          ),
          env.RESEND_API_KEY,
        );
      },
    },
    ...(socialProviders !== undefined ? { socialProviders } : {}),
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string; name: string; email: string }) => {
            const hookDb = createDb(env);
            const communityId = nanoid();
            const memberId = nanoid();
            const subscriptionId = nanoid();
            const activationId = nanoid();
            const now = Date.now();
            const trialStartedAt = new Date(now);
            const trialEndsAt = new Date(
              now + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
            );

            await hookDb.transaction(async (tx) => {
              await tx.insert(communities).values({
                id: communityId,
                name: `${user.name}'s Community`,
                slug: toSlug(user.name),
                ownerUserId: user.id,
              });

              await tx.insert(communityMembers).values({
                id: memberId,
                communityId,
                userId: user.id,
                role: "owner",
              });

              await tx.insert(subscriptions).values({
                id: subscriptionId,
                communityId,
                status: "trialing",
                tier: FULL_TRIAL_TIER,
                cycle: null,
                trialStartedAt,
                trialEndsAt,
                stripeSubscriptionId: null,
                stripeCustomerId: null,
              });

              await tx.insert(communityActivation).values({
                id: activationId,
                communityId,
              });

              await insertDefaultChartOfAccounts(tx, communityId);
            });

            await enrollSequencerSequence(env, {
              email: user.email,
              sequenceSlug: "boardstack-fulfillment-welcome",
              externalId: `${user.id}:fulfillment-welcome`,
              metadata: {
                userId: user.id,
                communityId,
                signupName: user.name,
              },
            });
            await enrollSequencerSequence(env, {
              email: user.email,
              sequenceSlug: "boardstack-nurture-value-1",
              externalId: `${user.id}:nurture-value-1`,
              metadata: {
                userId: user.id,
                communityId,
                signupName: user.name,
              },
            });

            await Promise.all([
              captureEvent(
                "user_identified",
                {
                  community_id: communityId,
                  role: "owner",
                  tier: FULL_TRIAL_TIER,
                },
                user.id,
                env,
              ),
              captureEvent(
                "community_created",
                {
                  community_id: communityId,
                  role: "owner",
                  source: "signup",
                },
                user.id,
                env,
              ),
              captureEvent(
                "trial_started",
                {
                  community_id: communityId,
                  tier: FULL_TRIAL_TIER,
                  trial_duration_days: TRIAL_DURATION_DAYS,
                },
                user.id,
                env,
              ),
            ]);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

// Create a fresh auth instance per request — do NOT cache across calls.
// Caching a Better Auth instance (and its embedded postgres client) across
// Cloudflare Worker requests triggers "Cannot perform I/O on behalf of a
// different request" because the postgres connection is bound to the
// originating request's I/O context.
export function getAuth(env: Env): Auth {
  return createAuth(env);
}
