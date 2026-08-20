/// <reference types="@cloudflare/workers-types" />

export type Env = {
  // Storage -- declared in wrangler.toml; always present at deploy time
  GOVERNANCE_BUCKET?: R2Bucket;
  AUDIT_PACK_BUCKET?: R2Bucket;
  LEAD_MAGNETS_BUCKET?: R2Bucket;
  AI_SDR_NONCE_DB?: D1Database;
  /**
   * D1 database backing AI-CS app-context replay protection (table
   * `ai_cs_nonces`). Bound to the same physical database as `AI_SDR_NONCE_DB`
   * in wrangler.toml; absent in local dev/tests, where the endpoint fails closed.
   */
  AI_CS_NONCE_DB?: D1Database;
  /**
   * KV namespace used by the auth and invitation rate limiter.
   * Bound via wrangler.toml [[kv_namespaces]] binding "AUTH_RATE_LIMIT_KV".
   * Absent in local dev/tests -- the limiter falls back to in-memory counters.
   */
  AUTH_RATE_LIMIT_KV?: KVNamespace;
  // Database
  DATABASE_URL?: string;
  // Auth
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  APP_URL: string;
  // Stripe
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_STARTER_MONTHLY: string;
  STRIPE_PRICE_STARTER_ANNUAL: string;
  STRIPE_PRICE_GROWTH_MONTHLY: string;
  STRIPE_PRICE_GROWTH_ANNUAL: string;
  STRIPE_PRICE_SCALE_MONTHLY: string;
  STRIPE_PRICE_SCALE_ANNUAL: string;
  STRIPE_PRICE_PORTFOLIO_MONTHLY?: string;
  STRIPE_PRICE_PORTFOLIO_ANNUAL?: string;
  // Email
  RESEND_API_KEY: string;
  SEQUENCER_BASE_URL?: string;
  SEQUENCER_CF_ACCESS_CLIENT_ID?: string;
  SEQUENCER_CF_ACCESS_CLIENT_SECRET?: string;
  /** HMAC secret used to sign expiring lead magnet download URLs. */
  LEAD_MAGNET_DOWNLOAD_SECRET?: string;
  /** HMAC secret used to verify signed AI-SDR product context requests. */
  AI_SDR_CONTEXT_SECRET?: string;
  /**
   * HMAC secret shared with the AI-CS Worker. Used to verify the Worker's signed
   * app-context requests and to sign the context responses. Set via
   * `wrangler secret put AI_CS_CONTEXT_SECRET`; the endpoint fails closed (503)
   * when unset.
   */
  AI_CS_CONTEXT_SECRET?: string;
  /**
   * Cloudflare Turnstile secret key used to verify proof-of-humanity tokens
   * on public marketing forms. Set via `wrangler secret put TURNSTILE_SECRET_KEY`;
   * never committed. When unset outside production the verifier bypasses (local
   * dev / tests); when unset in production the verifier fails closed.
   */
  TURNSTILE_SECRET_KEY?: string;
  /** HMAC secret used to sign authenticated AI-CS Worker requests. */
  AI_CS_CLIENT_ASSERTION_SECRET?: string;
  /**
   * Origin URL of the AI-CS Worker endpoint.
   * Must be set in production; the proxy fails closed (503) when absent.
   * Example: https://ventora-ai-cs-worker.example.workers.dev
   * Set via: pnpm --filter @boardstack/api exec wrangler secret put AI_CS_WORKER_ORIGIN --name boardstack-api
   */
  AI_CS_WORKER_ORIGIN?: string;
  // OAuth
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // Observability
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  POSTHOG_KEY?: string;
  /** PostHog ingest host. Defaults to https://us.i.posthog.com when absent. */
  POSTHOG_HOST?: string;
  /** When true, production returns explicit shutdown responses. */
  GAVELHOUSE_SHUTDOWN?: string;
  /** Public marketing site origin used to build lead magnet download URLs. */
  PUBLIC_WEB_URL?: string;
  /** Public API origin used to build unsubscribe URLs in outbound emails. */
  PUBLIC_API_URL?: string;
  /**
   * Physical postal address shown in the footer of every marketing email for
   * CAN-SPAM compliance. Production deploys must set this to the real
   * registered business address; the placeholder below is only acceptable
   * for local dev and test environments.
   */
  COMPANY_POSTAL_ADDRESS?: string;
  /**
   * Short git SHA of the commit this Worker bundle was built from. Injected via
   * `wrangler deploy --var BUILD_COMMIT:<sha>` by the deploy orchestrator and
   * exposed on `/health` / `/api/health` so the deploy verifier can confirm
   * the running Worker matches the expected commit.
   */
  BUILD_COMMIT?: string;
};
