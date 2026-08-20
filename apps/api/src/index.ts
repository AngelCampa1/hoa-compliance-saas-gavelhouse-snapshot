import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { withSentry } from "@sentry/cloudflare";
import type { CloudflareOptions } from "@sentry/cloudflare";
import {
  BRAND_DOMAIN,
  PUBLIC_APP_URL,
  PUBLIC_WEB_URL,
} from "@boardstack/shared";
import type { Env } from "./types/env.js";
import {
  initSentry,
  captureException,
  captureEvent,
  buildInternalErrorBody,
} from "./lib/observability.js";
import health from "./routes/health.js";
import authRouter from "./routes/auth.js";
import communitiesRouter from "./routes/communities.js";
import communitiesUsageRouter from "./routes/communitiesUsage.js";
import billingRouter from "./routes/billing.js";
import activationRouter from "./routes/activation.js";
import financeAccountsRouter from "./routes/finance/accounts.js";
import financeJournalRouter from "./routes/finance/journal.js";
import financeReservesRouter from "./routes/finance/reserves.js";
import financeDuesRouter from "./routes/finance/dues.js";
import duesWebhookRouter from "./routes/billing/dues-webhook.js";
import governanceRouter from "./routes/governance/index.js";
import reportsRouter from "./routes/reports/index.js";
import bankRouter from "./routes/bank/index.js";
import { closeRouter } from "./routes/monthEndClose/index.js";
import portfolioRouter from "./routes/portfolio/index.js";
import cancelRouter from "./routes/billing/cancel.js";
import leadMagnetApp from "./routes/leadMagnet.js";
import downloadsRouter from "./routes/downloads.js";
import unsubscribeApp from "./routes/unsubscribe.js";
import aiSdrContextRouter from "./routes/aiSdrContext.js";
import aiCsProxyRouter from "./routes/aiCsProxy.js";
import aiCsContextRouter from "./routes/aiCsContext.js";
import { createAuditMiddleware } from "./domain/accounting/auditMiddleware.js";
import { createDb } from "./db/client.js";
import feedbackRouter from "./routes/feedback.js";
import { shutdownMiddleware } from "./lib/shutdown.js";

const app = new Hono<{ Bindings: Env }>();

export function buildAllowedOrigins(env?: Partial<Env>): string[] {
  const origins = [PUBLIC_WEB_URL, PUBLIC_APP_URL];

  // In production we never add localhost origins, even if env bindings are
  // absent or invalid. Fail closed: return only the hard-coded production
  // allow-list when SENTRY_ENVIRONMENT signals a production deployment.
  const isProduction = env?.SENTRY_ENVIRONMENT === "production";
  if (isProduction) {
    return origins;
  }

  // Non-production: allow localhost when either URL is absent or does not
  // reference the public brand domain (i.e. local dev or staging config).
  if (!env?.APP_URL || !env?.BETTER_AUTH_URL) {
    origins.push("http://localhost:3060", "http://localhost:3061");
    return origins;
  }

  if (
    !env.APP_URL.includes(BRAND_DOMAIN) ||
    !env.BETTER_AUTH_URL.includes(BRAND_DOMAIN)
  ) {
    origins.push("http://localhost:3060", "http://localhost:3061");
  }

  return origins;
}

// CORS — allow dashboard, marketing site, and local dev
app.use("/*", async (c, next) => {
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return "";
      return buildAllowedOrigins(c.env).includes(origin) ? origin : "";
    },
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-owner-token",
      "X-Ventora-Timestamp",
      "X-Ventora-Nonce",
      "X-Ventora-Signature",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  return corsMiddleware(c, next);
});

app.use("/*", async (c, next) => {
  await next();

  c.header(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // NOTE: There is intentionally no Content-Security-Policy header today. If one
  // is ever introduced, it MUST allow https://crm.ventoralabs.com in both
  // `script-src` (the authenticated app loads the Ventora CRM feedback widget
  // loader from there — see apps/app CrmFeedbackWidget) and `connect-src` (the
  // widget fetches its data + posts feedback to that origin). Omitting it would
  // silently break the CRM feedback widget.
});

app.route("/", health);
app.use("/*", shutdownMiddleware);
app.get("/billing/launch-offer", (c) => c.json({ error: "Not found" }, 404));
app.route("/", authRouter);
app.route("/", communitiesRouter);
app.route("/", communitiesUsageRouter);
app.route("/", billingRouter);
app.route("/", cancelRouter);
app.route("/lead-magnets", leadMagnetApp);
app.route("/waitlist", leadMagnetApp);
app.route("/", downloadsRouter);
app.route("/unsubscribe", unsubscribeApp);
app.route("/", aiSdrContextRouter);
app.route("/", aiCsProxyRouter);
app.route("/", aiCsContextRouter);
app.route("/", activationRouter);
app.route("/", feedbackRouter);
app.use("/finance/*", createAuditMiddleware(createDb));
app.route("/", financeAccountsRouter);
app.route("/", financeJournalRouter);
app.route("/", financeReservesRouter);
app.route("/", financeDuesRouter);
app.route("/", duesWebhookRouter);
app.use("/governance/*", createAuditMiddleware(createDb));
app.use("/owner/*", createAuditMiddleware(createDb));
app.use("/bank/*", createAuditMiddleware(createDb));
app.use("/close/*", createAuditMiddleware(createDb));
app.route("/", governanceRouter);
app.route("/", reportsRouter);
app.route("/", bankRouter);
app.route("/", closeRouter);
app.use("/portfolio/*", createAuditMiddleware(createDb));
app.route("/", portfolioRouter);

// Sentry: report unhandled errors
app.onError((err, c) => handleAppError(err, c));

export async function handleAppError(
  err: Error,
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const response = getIntentionalErrorResponse(err);
  if (response) return response;

  const trackingId = captureException(err, {
    tags: { source: "hono-on-error" },
    extra: { method: c.req.method, pathname: new URL(c.req.url).pathname },
  });
  await captureEvent(
    "api_error",
    {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: 500,
      ...(trackingId ? { tracking_id: trackingId } : {}),
    },
    undefined,
    c.env,
  );
  return c.json(buildInternalErrorBody(trackingId), 500);
}

export function getIntentionalErrorResponse(err: Error): Response | undefined {
  return (
    (err instanceof HTTPException ? err.getResponse() : undefined) ??
    (err as { res?: Response }).res ??
    (err as { getResponse?: () => Response }).getResponse?.()
  );
}

/** Exported for testing — builds the Sentry options from Worker env bindings. */
export function buildSentryOptions(env: Env | undefined): CloudflareOptions {
  return initSentry(env) ?? {};
}

import { scheduledHandler } from "./scheduled.js";

const _handler = withSentry(buildSentryOptions, app);

/** Exported for testing — the underlying Hono app instance. */
export { app };

export default {
  fetch: _handler.fetch.bind(_handler),
  scheduled: scheduledHandler,
};
