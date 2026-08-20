# Gavelhouse Infrastructure Bootstrap Checklist

**Owner:** Angel Campa
**Run once** before Phase 1 begins. Steps are in dependency order -- do not skip ahead.
All commands assume you are in the repo root unless noted.

---

## 1. Cloudflare -- Create Projects and Worker

### 1a. Create Worker: `boardstack-app` (dashboard)

1. Start from a clean `master` checkout.
2. Deploy from the repo so Wrangler creates the Worker from
   `apps/app/wrangler.toml`:
   ```bash
   pnpm run deploy:app
   ```
3. Confirm the Worker serves static assets from `apps/app/dist` and uses
   `not_found_handling = "single-page-application"` for dashboard routes.

### 1b. Create Worker: `boardstack-web` (marketing site)

1. Start from a clean `master` checkout.
2. Deploy from the repo so Wrangler creates the Worker from
   `apps/web/wrangler.toml`:
   ```bash
   pnpm run deploy:web
   ```
3. Confirm the Worker serves `gavelhouse.app` and `www.gavelhouse.app`; Astro
   middleware redirects `www.gavelhouse.app` to the apex host.

### 1c. Create Worker: `boardstack-api`

Option A -- via Wrangler (recommended):

```bash
cd apps/api
pnpm wrangler deploy --dry-run   # verify config first
pnpm wrangler deploy             # creates the Worker on first deploy
```

Option B -- via dashboard:

1. **Workers & Pages** -> **Create** -> **Worker**.
2. Name it `boardstack-api`.
3. You will publish code via Wrangler in a later phase; this just reserves the name.

### 1d. Add custom domains

After the projects and Worker are created:

| Resource                | Custom domain                             | Where to configure                               |
| ----------------------- | ----------------------------------------- | ------------------------------------------------ |
| `boardstack-app` Worker | `my.gavelhouse.app`                       | Worker -> **Triggers** -> **Custom domains** -> Add |
| `boardstack-web` Worker | `gavelhouse.app` and `www.gavelhouse.app` | Worker -> **Triggers** -> **Custom domains** -> Add |
| `boardstack-api` Worker | `api.gavelhouse.app`                      | Worker -> **Triggers** -> **Custom domains** -> Add |

Cloudflare will auto-configure the CNAME records when you add domains through its own dashboard (since the domain is already on Cloudflare). No manual DNS edits needed for these three records.

---

## 2. Neon -- Create Database

1. Go to [console.neon.tech](https://console.neon.tech) -> **New project**.
2. **Project name:** `boardstack`
3. **Region:** `US East (Ohio)` (us-east-2) -- closest to Cloudflare's eastern PoPs.
4. After creation, note the **Project ID** (format: `<name>-<id>`, shown in the URL and project settings). You will need this for MCP tools in Phase 1.

### 2a. Branches

Neon creates a `main` branch automatically. Create a second branch:

1. Project -> **Branches** -> **New branch**.
2. **Branch name:** `dev`
3. **Branch from:** `main`
4. Leave compute settings at defaults.

### 2b. Enable connection pooling

For **each branch** (`main` and `dev`):

1. Branch -> **Connection details**.
2. Toggle **Pooler** to **on** (uses PgBouncer in transaction mode).
3. Copy the pooled connection string -- it looks like:
   ```
   postgresql://user:pass@<project>-pooler.region.neon.tech/neondb?sslmode=require
   ```

Save both strings somewhere secure (1Password, etc.):

- `NEON_MAIN_URL` = main branch pooled connection string -> becomes `DATABASE_URL`
- `NEON_DEV_URL` = dev branch pooled connection string -> becomes `DATABASE_URL_DEV`

---

## 3. Cloudflare Worker database wiring

Gavelhouse's Worker connects directly to Neon using the `DATABASE_URL` secret.
Keep one pooled connection string for production and one for local/dev use.

> **Prerequisite:** Neon project and both branches must exist (step 2).

### 3a. Set the production Worker secret

```bash
pnpm --filter @boardstack/api exec wrangler secret put DATABASE_URL --name boardstack-api
```

Paste the pooled `NEON_MAIN_URL` when prompted.

### 3b. Set local development defaults

`apps/api/wrangler.toml` already points local dev at the Postgres instance
started by the repo's local stack. If you want local API runs to hit Neon dev
instead, put the Neon dev connection string in `apps/api/.dev.vars` before
running `pnpm --filter @boardstack/api dev`.

```dotenv
DATABASE_URL=<NEON_DEV_URL>
```

### 3c. Verify the Worker deploy uses the secret

```bash
pnpm --filter @boardstack/api exec wrangler deploy --name boardstack-api
```

After deploy, confirm the Worker can reach the database by hitting the live
health check and one authenticated API route.

---

## 4. Resend -- Email Sending

1. Go to [resend.com](https://resend.com) -> **API Keys** -> **Create API Key**.
2. **Name:** `boardstack-prod`
3. **Permission:** Sending access
4. Copy the key (shown once) -- this is `RESEND_API_KEY`.

### 4a. Verify sending domain

1. Resend dashboard -> **Domains** -> **Add domain**.
2. Enter `gavelhouse.app`.
3. Resend will provide DNS records to add (TXT for ownership verification + MX and DKIM for sending).
4. Add these records in Cloudflare DNS for `gavelhouse.app`:
   - The TXT verification record (e.g., `_resend.gavelhouse.app TXT "resend_..."`)
   - DKIM records (CNAME entries, e.g., `resend._domainkey.gavelhouse.app`)
   - MX record if Resend requires it for inbound
5. Click **Verify** in Resend after adding records. DNS propagation can take up to 48 hours, but is usually under 5 minutes on Cloudflare.

---

## 5. Sentry -- Error Monitoring

### 5a. Organization

1. Go to [sentry.io](https://sentry.io) -> create or use organization `boardstack`.

### 5b. Create project: `boardstack-app`

1. **Projects** -> **Create Project**.
2. Platform: **React** (under Browser).
3. **Project name:** `boardstack-app`
4. After creation, go to **Settings** -> **Client Keys (DSN)** and copy the DSN.
5. Save as `VITE_SENTRY_DSN`.

### 5c. Create project: `boardstack-api`

1. **Projects** -> **Create Project**.
2. Platform: **Cloudflare Workers** (under JavaScript).
3. **Project name:** `boardstack-api`
4. Copy the DSN.
5. Save as `SENTRY_DSN`.

---

## 6. PostHog -- Product Analytics

1. Go to [app.posthog.com](https://app.posthog.com) -> create or open project `boardstack`.
2. **Settings** -> **Project** -> copy:
   - **Project API key** (format: `phc_...`) -- save as `POSTHOG_KEY`
   - **API host** -- use `https://us.i.posthog.com`

These values are used in both `apps/app` and `apps/web`:

- `apps/app`: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`
- `apps/web`: `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST`

---

## 7. Stripe -- Payments

Use **test mode** first. Switch to live mode after end-to-end billing tests pass.

### 7a. Create products

In the [Stripe dashboard](https://dashboard.stripe.com) -> **Product catalog** -> **Add product**, create three products:

| Product name           | Description                           |
| ---------------------- | ------------------------------------- |
| `Gavelhouse Starter`   | Up to 50 homes                        |
| `Gavelhouse Growth`    | 51-200 homes                          |
| `Gavelhouse Scale`     | 201-500 homes                         |

Portfolio is a custom option for 500+ homes or multi-community operators. It
does not have a Stripe product or self-serve checkout price.

### 7b. Create price objects

For each product, create the following prices (recurring):

| Product              | Billing | Amount         | Notes             |
| -------------------- | ------- | -------------- | ----------------- |
| Gavelhouse Starter   | Monthly | $59.00 / mo    | --                |
| Gavelhouse Starter   | Annual  | $588.00 / yr   | $49/mo effective  |
| Gavelhouse Growth    | Monthly | $165.00 / mo    | --                |
| Gavelhouse Growth    | Annual  | $1,620.00 / yr   | $135/mo effective  |
| Gavelhouse Scale     | Monthly | $299.00 / mo   | --                |
| Gavelhouse Scale     | Annual  | $2,988.00 / yr | $249/mo effective |

Create two Stripe coupons. These Stripe settings create the same customer
offer for both billing cycles: 80% off the first year.

1. `M80OFF`: monthly-plan code, Stripe duration 12 months, limit 100.
2. `Y80OFF`: yearly-plan code, Stripe one-payment discount, limit 200.

After creating each price, copy the **Price ID** (format: `price_...`).

Store the price IDs as Worker secrets using the matching `STRIPE_PRICE_*`
environment names from `.env.example`.

### 7c. Create restricted API key

1. **Developers** -> **API keys** -> **Create restricted key**.
2. **Key name:** `boardstack-server`
3. Permissions needed:
   - Customers: **Read/Write**
   - Subscriptions: **Read/Write**
   - Checkout Sessions: **Read/Write**
   - Webhook Endpoints: **Read/Write**
4. Copy the key -- this is `STRIPE_SECRET_KEY`.

### 7d. Create webhook endpoint

1. **Developers** -> **Webhooks** -> **Add endpoint**.
2. **Endpoint URL:** `https://api.gavelhouse.app/billing/webhook`
3. **Events to listen to:**
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. After creating, copy the **Signing secret** (format: `whsec_...`) -- this is `STRIPE_WEBHOOK_SECRET`.

---

## 8. Apollo.io -- Waitlist Lead Management

1. Log in to [app.apollo.io](https://app.apollo.io).
2. Go to **Settings** -> **API Keys**.
3. Confirm the existing API key from the validation site is active and accessible.
4. Copy the key -- this is `APOLLO_API_KEY`.
5. Confirm the contact list and email sequence used by the validation site are active. These will be reused by `apps/api` for waitlist enrollments.

---

## 9. DNS Records Summary

Most records are auto-created by Cloudflare when you assign custom domains in step 1. The only manual DNS records are from Resend:

| Record type | Host                               | Value                     | Purpose                       |
| ----------- | ---------------------------------- | ------------------------- | ----------------------------- |
| CNAME       | `my.gavelhouse.app`                | Cloudflare Workers target | Auto-added in step 1d         |
| CNAME       | `gavelhouse.app`                   | Cloudflare Workers target | Auto-added in step 1d         |
| CNAME       | `www.gavelhouse.app`               | Cloudflare Workers target | Auto-added in step 1d         |
| CNAME       | `api.gavelhouse.app`               | Cloudflare Workers target | Auto-added in step 1d         |
| TXT         | `_resend.gavelhouse.app`           | Provided by Resend        | Domain ownership verification |
| CNAME       | `resend._domainkey.gavelhouse.app` | Provided by Resend        | DKIM signing                  |
| MX          | Per Resend instructions            | Per Resend instructions   | Inbound (if needed)           |

---

## 10. Environment Variables Summary

### Setting Worker secrets via Wrangler CLI

Run each command below and paste the value when prompted:

```bash
# Neon database
wrangler secret put DATABASE_URL --name boardstack-api
# (paste Neon main branch pooled connection string)

# Resend
wrangler secret put RESEND_API_KEY --name boardstack-api

# Sentry (API)
wrangler secret put SENTRY_DSN --name boardstack-api

# Stripe
wrangler secret put STRIPE_SECRET_KEY --name boardstack-api
wrangler secret put STRIPE_WEBHOOK_SECRET --name boardstack-api
wrangler secret put STRIPE_PRICE_STARTER_MONTHLY --name boardstack-api
wrangler secret put STRIPE_PRICE_STARTER_ANNUAL --name boardstack-api
wrangler secret put STRIPE_PRICE_GROWTH_MONTHLY --name boardstack-api
wrangler secret put STRIPE_PRICE_GROWTH_ANNUAL --name boardstack-api
wrangler secret put STRIPE_PRICE_SCALE_MONTHLY --name boardstack-api
wrangler secret put STRIPE_PRICE_SCALE_ANNUAL --name boardstack-api

# Apollo.io
wrangler secret put APOLLO_API_KEY --name boardstack-api
```

### Setting frontend build environment variables

Set these values locally or in the deploy shell before running the repo deploy
scripts. Runtime secrets should stay on the API Worker.

**`boardstack-app` (apps/app):**

```dotenv
VITE_API_URL            = https://api.gavelhouse.app
VITE_SENTRY_DSN         = <Sentry boardstack-app DSN>
VITE_POSTHOG_KEY        = <PostHog project API key>
VITE_POSTHOG_HOST       = https://us.i.posthog.com
```

**`boardstack-web` (apps/web):**

```dotenv
PUBLIC_POSTHOG_KEY      = <PostHog project API key>
PUBLIC_POSTHOG_HOST     = https://us.i.posthog.com
PUBLIC_API_URL          = https://api.gavelhouse.app
```

### Local `.env` file (development only -- do not commit)

Create `apps/api/.dev.vars` (Wrangler's local secret file, already gitignored):

```dotenv
DATABASE_URL=<Neon main branch pooled connection string>
DATABASE_URL_DEV=<Neon dev branch pooled connection string>
RESEND_API_KEY=<from Resend>
SENTRY_DSN=<from Sentry boardstack-api>
STRIPE_SECRET_KEY=<from Stripe>
STRIPE_WEBHOOK_SECRET=<from Stripe>
STRIPE_PRICE_STARTER_MONTHLY=<price_...>
STRIPE_PRICE_STARTER_ANNUAL=<price_...>
STRIPE_PRICE_GROWTH_MONTHLY=<price_...>
STRIPE_PRICE_GROWTH_ANNUAL=<price_...>
STRIPE_PRICE_SCALE_MONTHLY=<price_...>
STRIPE_PRICE_SCALE_ANNUAL=<price_...>
APOLLO_API_KEY=<from Apollo.io>
```

### Complete variable reference table

| Variable                       | Where                    | Value source                              |
| ------------------------------ | ------------------------ | ----------------------------------------- |
| `DATABASE_URL`                 | `apps/api` Worker secret | Neon main branch pooled connection string |
| `DATABASE_URL_DEV`             | local `.dev.vars`        | Neon dev branch pooled connection string  |
| `RESEND_API_KEY`               | `apps/api` Worker secret | Resend dashboard                          |
| `SENTRY_DSN`                   | `apps/api` Worker secret | Sentry `boardstack-api` project DSN       |
| `VITE_API_URL`                 | `apps/app` build env var | `https://api.gavelhouse.app`              |
| `VITE_SENTRY_DSN`              | `apps/app` build env var | Sentry `boardstack-app` project DSN       |
| `STRIPE_SECRET_KEY`            | `apps/api` Worker secret | Stripe restricted key                     |
| `STRIPE_WEBHOOK_SECRET`        | `apps/api` Worker secret | Stripe webhook signing secret             |
| `STRIPE_PRICE_STARTER_MONTHLY` | `apps/api` Worker secret | Stripe price ID                           |
| `STRIPE_PRICE_STARTER_ANNUAL`  | `apps/api` Worker secret | Stripe price ID                           |
| `STRIPE_PRICE_GROWTH_MONTHLY`  | `apps/api` Worker secret | Stripe price ID                           |
| `STRIPE_PRICE_GROWTH_ANNUAL`   | `apps/api` Worker secret | Stripe price ID                           |
| `STRIPE_PRICE_SCALE_MONTHLY`   | `apps/api` Worker secret | Stripe price ID                           |
| `STRIPE_PRICE_SCALE_ANNUAL`    | `apps/api` Worker secret | Stripe price ID                           |
| `APOLLO_API_KEY`               | `apps/api` Worker secret | Apollo.io dashboard                       |
| `VITE_POSTHOG_KEY`             | `apps/app` build env var | PostHog project API key                   |
| `VITE_POSTHOG_HOST`            | `apps/app` build env var | `https://us.i.posthog.com`                |
| `PUBLIC_POSTHOG_KEY`           | `apps/web` build env var | PostHog project API key                   |
| `PUBLIC_POSTHOG_HOST`          | `apps/web` build env var | `https://us.i.posthog.com`                |
| `PUBLIC_API_URL`               | `apps/web` build env var | `https://api.gavelhouse.app`              |

---

## Checklist

Use this to track completion:

- [ ] **1a** Cloudflare Worker `boardstack-app` created
- [ ] **1b** Cloudflare Worker `boardstack-web` created
- [ ] **1c** Cloudflare Worker `boardstack-api` created
- [ ] **1d** Custom domains added: `my.gavelhouse.app`, `gavelhouse.app`, `api.gavelhouse.app`
- [ ] **2** Neon project `boardstack` created; Project ID noted
- [ ] **2a** Neon `dev` branch created from `main`
- [ ] **2b** Connection pooling enabled on both branches; connection strings saved
- [ ] **3a** Production Worker `DATABASE_URL` secret set from Neon `main`
- [ ] **3b** Local/dev `DATABASE_URL` plan decided (`[env.dev]` local Postgres or Neon `dev`)
- [ ] **3c** `boardstack-api` deployed and verified against the configured database
- [ ] **4** Resend API key `boardstack-prod` created; key saved
- [ ] **4a** Resend domain `gavelhouse.app` verified; DNS records added
- [ ] **5a** Sentry organization `boardstack` confirmed
- [ ] **5b** Sentry project `boardstack-app` created; DSN saved
- [ ] **5c** Sentry project `boardstack-api` created; DSN saved
- [ ] **6** PostHog project `boardstack` created; API key and host saved
- [ ] **7a** Stripe products created (Starter, Growth, Scale)
- [ ] **7b** Stripe price objects created (6 paid prices); IDs saved
- [ ] **7c** Stripe restricted API key created; key saved
- [ ] **7d** Stripe webhook endpoint created; signing secret saved
- [ ] **8** Apollo.io API key confirmed; saved as `APOLLO_API_KEY`
- [ ] **9** Resend DNS records added to Cloudflare DNS
- [ ] **10** All Worker secrets set via Wrangler
- [ ] **10** All frontend build env vars available to deploy scripts
- [ ] **10** Local `apps/api/.dev.vars` created
