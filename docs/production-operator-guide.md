# Gavelhouse Production Operator Guide

Last updated: 2026-05-07

This is the exact step-by-step guide for finishing Gavelhouse production setup
from the current repo and Cloudflare state.

It is written against the current production architecture:

- `boardstack-web` and `boardstack-app` are Cloudflare Workers with static
  assets deployed with explicit Wrangler scripts from this repo.
- `boardstack-api` is a Cloudflare Worker on `api.gavelhouse.app`.
- The API now uses Neon directly through `DATABASE_URL`.
- Hyperdrive is not part of the production path.
- GitHub Actions are intentionally not used for deploys.

## Current known-good state

These items are already done:

- GitHub repo exists at `AngelCampa1/boardstack`.
- `origin` points at that repo and `master` is pushed.
- `boardstack-web` is the only Gavelhouse marketing Worker and serves
  `gavelhouse.app` and `www.gavelhouse.app`.
- `boardstack-app` is the dashboard Worker and serves `my.gavelhouse.app`.
- `boardstack-api` is deployed on Cloudflare.
- `boardstack-api` already has a Workers Builds production pipeline.
- `api.gavelhouse.app` is attached to `boardstack-api`.
- `https://api.gavelhouse.app/health` returns `200`.
- Production Neon schema is aligned and `db:migrate` succeeds.

## 0. Deploy From This Repo

Use the repo deploy scripts after verification. Do not add GitHub Actions for
this repo. The deploy script must include every touched project:

- `pnpm run deploy:api` deploys Worker `boardstack-api`.
- `pnpm run deploy:app` deploys Worker `boardstack-app`.
- `pnpm run deploy:web` or `pnpm run deploy:marketing` deploys Worker
  `boardstack-web`.
- `pnpm run deploy:touched -- --from <base-ref>` deploys only touched
  deployable projects since the base ref; shared workspace/root build input
  changes deploy all three.

The old `boardstack` Pages project from `ideas-validation`, plus
any `boardstack-app` or `boardstack-web` Pages projects, must not exist after
the Workers cutover. If they reappear, remove or disable them before
considering deployment complete.

## 1. Verify frontend Worker settings

These two frontend Workers should already exist after deployment from this repo.
Do not recreate them as Pages projects. Open each Worker and verify the exact
settings below.

Official docs used for this section:

- Workers static assets:
  `https://developers.cloudflare.com/workers/static-assets/`
- Wrangler configuration:
  `https://developers.cloudflare.com/workers/wrangler/configuration/`

### 1.1 `boardstack-app`

In Cloudflare:

1. Go to `Workers & Pages`.
2. Open `boardstack-app`.
3. Go to `Settings -> Domains & Routes`.
4. Verify:
   - Custom domain or route:
     `my.gavelhouse.app`
5. Verify the source config is `apps/app/wrangler.toml`.
6. Verify `[assets] directory = "dist"` and
   `not_found_handling = "single-page-application"` for SPA routes.

Production environment variables for `boardstack-app`:

- `VITE_API_URL=https://api.gavelhouse.app`
- `VITE_SENTRY_DSN=<Sentry DSN for boardstack-app>`
- `VITE_POSTHOG_KEY=<PostHog project key>`
- `VITE_POSTHOG_HOST=https://us.i.posthog.com`

The app build now fails fast in strict deploy mode when `VITE_API_URL` is
missing, points at a private/local host, or uses non-HTTPS.

### 1.2 `boardstack-web`

In Cloudflare:

1. Go to `Workers & Pages`.
2. Open `boardstack-web`.
3. Go to `Settings -> Domains & Routes`.
4. Verify:
   - Custom domain or route:
     `gavelhouse.app`
   - Custom domain or route:
     `www.gavelhouse.app`
5. Verify the source config is `apps/web/wrangler.toml`.
6. Verify `[assets] directory = "dist"`.

Production environment variables for `boardstack-web`:

- `PUBLIC_API_URL=https://api.gavelhouse.app`
- `PUBLIC_APP_URL=https://my.gavelhouse.app`
- `PUBLIC_POSTHOG_KEY=<PostHog project key>`
- `PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`
- `PUBLIC_SENTRY_DSN=<Sentry browser DSN for boardstack-web if enabled>`

### 0.3 Validation deploy

After verifying the two frontend Workers:

1. Make a tiny commit touching `apps/app/`.
2. Run `pnpm run deploy:app`.
3. Confirm Worker `boardstack-app` serves the deployed commit.
4. Make a second tiny commit touching `apps/web/`.
5. Run `pnpm run deploy:web`.
6. Confirm Worker `boardstack-web` serves the deployed commit.
7. Confirm `https://www.gavelhouse.app/` redirects to
   `https://gavelhouse.app/`.

## 1. Verify automatic API deployments with Cloudflare Workers Builds

This is the Cloudflare-native way to get automatic Worker deployments on push.
Per Cloudflare's current Workers Builds docs, the correct setup for an existing
Worker is:

- connect the existing Worker to the Git repository
- set the Worker root directory to the directory containing `wrangler.toml`
- configure build watch paths so the Worker only rebuilds when relevant files
  change

Official docs used for this section:

- Workers Builds overview:
  `https://developers.cloudflare.com/workers/ci-cd/builds/`
- Workers Builds configuration:
  `https://developers.cloudflare.com/workers/ci-cd/builds/configuration/`
- Workers Builds advanced monorepo setup:
  `https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/`
- Workers Builds API reference:
  `https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/`
- Build watch paths:
  `https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/`

### 1.1 Dashboard setup

In Cloudflare:

1. Go to `Workers & Pages`.
2. Open the Worker `boardstack-api`.
3. Go to `Settings -> Builds`.
4. If the Worker is already connected to `AngelCampa1/boardstack`, do not
   reconnect it. Just verify the settings below.
5. If it is not connected yet, click `Connect`.
6. Select the GitHub account that has access to `AngelCampa1/boardstack`.
7. Select repository `AngelCampa1/boardstack`.
8. Set production branch to `master`.
9. Do not enable preview or non-production branch deployments.

Use these build settings:

- Root directory:
  `/apps/api`
- Build command:
  `pnpm install --frozen-lockfile`
- Deploy command:
  `pnpm exec wrangler deploy --config wrangler.toml --name boardstack-api`
- Non-production branch builds:
  disabled

Why these values:

- Cloudflare's current Workers Builds monorepo guidance says the root
  directory should be the directory containing `wrangler.toml`
- `pnpm install --frozen-lockfile` makes the dependency install explicit
  instead of relying on Cloudflare's automatic install behavior
- the deploy command runs inside `apps/api`, where both `package.json` and
  `wrangler.toml` already exist
- preview deployments are intentionally disabled for the API Worker

### 1.2 Build watch paths

Still in `Settings -> Builds -> Build watch paths`, use:

- Include paths:
  - `apps/api/*`
  - `packages/shared/*`
  - `package.json`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `turbo.json`
  - `tsconfig.base.json`
- Exclude paths:
  - `docs/*`
  - `screenshots/*`
  - `apps/app/*`
  - `apps/web/*`

Why these watch paths:

- `apps/api/*` covers Worker code, tests, migrations, and `wrangler.toml`.
- `packages/shared/*` must trigger API redeploys because the API imports shared
  schemas and types from that workspace package.
- `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` affect dependency
  resolution and workspace installs.
- `turbo.json` and `tsconfig.base.json` affect repo-level TypeScript/build
  behavior that can break Worker builds.
- `apps/app/*`, `apps/web/*`, docs, and screenshots should not trigger API
  redeploys.

### 1.3 First validation push

After saving or verifying the Git connection and watch paths:

1. Make a small commit touching only `apps/api/` or `packages/shared/`.
2. Push to `master`.
3. Confirm a new Workers Build starts for `boardstack-api`.
4. Confirm the resulting deployment becomes active.
5. Re-check:
   `https://api.gavelhouse.app/health`

### 1.4 Runtime variables and secrets on `boardstack-api`

Open `Workers & Pages -> boardstack-api -> Settings -> Variables and Secrets`.

Plaintext variables that should exist exactly like this:

- `BETTER_AUTH_URL=https://api.gavelhouse.app`
- `APP_URL=https://my.gavelhouse.app`
- `POSTHOG_HOST=https://us.i.posthog.com`
- `POSTHOG_KEY=<PostHog project key or leave blank until analytics is ready>`
- `COMPANY_POSTAL_ADDRESS=<real registered mailing address for the operator>`

Runtime secrets that must exist:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_GROWTH_MONTHLY`
- `STRIPE_PRICE_GROWTH_ANNUAL`
- `STRIPE_PRICE_SCALE_MONTHLY`
- `STRIPE_PRICE_SCALE_ANNUAL`
- `RESEND_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SENTRY_DSN` if Sentry is enabled for the Worker

Critical behavior from the code:

- `APP_URL=https://my.gavelhouse.app` causes Better Auth to use
  cross-subdomain cookies on `.gavelhouse.app`
- the API trusts `APP_URL` as the main browser origin in production
- Google OAuth reads only `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- lead magnet emails refuse to send if `COMPANY_POSTAL_ADDRESS` is empty

### 1.5 What I could not finish automatically from this session

I attempted to configure Workers Builds through Cloudflare's Builds API.

What worked:

- the current Wrangler OAuth token can read the Worker list and the
  `boardstack-api` Worker tag

What did not work:

- the same token was rejected by the Builds API with an authentication error

Cloudflare's current Builds API docs require a user API token with:

- `Workers Builds Configuration: Edit`
- `Workers Scripts: Read`

If you want this configured by API instead of the dashboard, create a user API
token with those permissions and then either:

- use the dashboard steps above, or
- use the API examples in section `1.6`

### 1.6 API alternative for Workers Builds

Use this only if you want to configure Workers Builds by API.

You will need:

- Cloudflare account id
- a user API token with the Builds permissions above
- GitHub owner id
- GitHub repo id
- a build token UUID from `boardstack-api -> Settings -> Builds -> API token`

Cloudflare's Builds API identifies the Worker by its immutable tag, not by the
Worker name.

Values for the account this deploys to:

- Cloudflare account id:
  read from `CLOUDFLARE_ACCOUNT_ID` (or `CF_ACCOUNT_ID`), alongside the API
  token it is useless without -- it is not checked in
- Worker name:
  `boardstack-api`
- Worker tag:
  `640cbfa51c78430bac4b9fea92f18fe9`

Production trigger shape:

```json
{
  "external_script_id": "640cbfa51c78430bac4b9fea92f18fe9",
  "repo_connection_uuid": "<repo_connection_uuid>",
  "build_token_uuid": "<build_token_uuid>",
  "trigger_name": "Deploy production",
  "build_command": "pnpm install --frozen-lockfile",
  "deploy_command": "pnpm exec wrangler deploy --config wrangler.toml --name boardstack-api",
  "root_directory": "/apps/api",
  "branch_includes": ["master"],
  "branch_excludes": [],
  "path_includes": [
    "apps/api/*",
    "packages/shared/*",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
    "tsconfig.base.json"
  ],
  "path_excludes": ["docs/*", "screenshots/*", "apps/app/*", "apps/web/*"]
}
```

## 2. Set missing production Worker secrets

Go to `Workers & Pages -> boardstack-api -> Settings -> Variables and Secrets`
or use Wrangler.

Required before launch:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_GROWTH_MONTHLY`
- `STRIPE_PRICE_GROWTH_ANNUAL`
- `STRIPE_PRICE_SCALE_MONTHLY`
- `STRIPE_PRICE_SCALE_ANNUAL`
- `RESEND_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `COMPANY_POSTAL_ADDRESS`

Recommended:

- `SENTRY_DSN`
- `POSTHOG_KEY`

Already set:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`

Use these commands if you are filling any remaining values with Wrangler:

```bash
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_SECRET_KEY --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_WEBHOOK_SECRET --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_STARTER_MONTHLY --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_STARTER_ANNUAL --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_GROWTH_MONTHLY --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_GROWTH_ANNUAL --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_SCALE_MONTHLY --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_SCALE_ANNUAL --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put RESEND_API_KEY --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put GOOGLE_CLIENT_ID --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put GOOGLE_CLIENT_SECRET --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put COMPANY_POSTAL_ADDRESS --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put SENTRY_DSN --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put POSTHOG_KEY --name boardstack-api
```

Then verify these plaintext variables in the dashboard under the same Worker:

- `BETTER_AUTH_URL=https://api.gavelhouse.app`
- `APP_URL=https://my.gavelhouse.app`
- `POSTHOG_HOST=https://us.i.posthog.com`

## 3. Stripe live mode

This section is now aligned to the code and pricing config in:

- `packages/shared/src/brand.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/types/env.ts`

Important implementation constraints:

- The API allows self-serve checkout for monthly and annual plans.
- Portfolio is custom and is not a checkout path.
- The pricing system expects all monthly and annual Stripe price ids to be
  present as Worker secrets. Limited-offer Stripe coupon ids are fixed in code:
  `M80OFF` for monthly plans and `Y80OFF` for annual plans.

### 3.1 Activate live mode

In Stripe:

1. Switch from test mode to live mode.
2. Finish account activation if Stripe still requires business verification.

### 3.2 Create live products and prices

Create exactly these three products in Stripe live mode:

1. `Gavelhouse Starter`
2. `Gavelhouse Growth`
3. `Gavelhouse Scale`

Create exactly these six recurring prices:

1. `Gavelhouse Starter Monthly`
   - amount: `$59/month`
   - secret name:
     `STRIPE_PRICE_STARTER_MONTHLY`
2. `Gavelhouse Starter Annual`
   - amount: `$588/year`
   - secret name:
     `STRIPE_PRICE_STARTER_ANNUAL`
3. `Gavelhouse Growth Monthly`
   - amount: `$165/month`
   - secret name:
     `STRIPE_PRICE_GROWTH_MONTHLY`
4. `Gavelhouse Growth Annual`
   - amount: `$1,620/year`
   - secret name:
     `STRIPE_PRICE_GROWTH_ANNUAL`
5. `Gavelhouse Scale Monthly`
   - amount: `$299/month`
   - secret name:
     `STRIPE_PRICE_SCALE_MONTHLY`
6. `Gavelhouse Scale Annual`
   - amount: `$2,988/year`
   - secret name:
     `STRIPE_PRICE_SCALE_ANNUAL`

Create two Stripe coupons:

1. `M80OFF`
   - 80% off
   - Stripe duration: 12 months
   - Stripe promotion-code limit: 100
   - public end date: none
2. `Y80OFF`
   - 80% off
   - Stripe duration: one payment
   - Stripe promotion-code limit: 200
   - public end date: none

Product/tier mapping from the repo:

| Tier      | Marketing label |                  Homes |   Monthly |      Annual | Secret names                                                      |
| --------- | --------------- | ---------------------: | --------: | ----------: | ----------------------------------------------------------------- |
| Starter   | `Starter`       |               up to 50 |  `$59/mo` |   `$588/yr` | `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`     |
| Growth    | `Growth`        |                 51-200 |  `$165/mo` |   `$1,620/yr` | `STRIPE_PRICE_GROWTH_MONTHLY`, `STRIPE_PRICE_GROWTH_ANNUAL`       |
| Scale     | `Scale`         |                201-500 | `$299/mo` | `$2,988/yr` | `STRIPE_PRICE_SCALE_MONTHLY`, `STRIPE_PRICE_SCALE_ANNUAL`         |

After creating the prices, copy each live `price_...` id into the matching
Worker secret on `boardstack-api`.

Recommended naming in Stripe:

- Product name:
  `Gavelhouse Starter`
- Price nickname:
  `starter-monthly`

Repeat the same naming pattern for growth and scale. Portfolio is custom and has no Stripe price.

### 3.3 Create the restricted server key

In Stripe live mode:

1. Go to `Developers -> API keys`.
2. Click `Create restricted key`.
3. Name it:
   `boardstack-api-live`
4. Grant these permissions:
   - `Customers` -> `Write`
   - `Subscriptions` -> `Write`
   - `Checkout Sessions` -> `Write`
   - `Billing portal configurations / sessions` -> `Write` if Stripe shows it
     separately in your account UI
   - `Webhook endpoints` -> `Write`
5. Copy the key into Worker secret:
   `STRIPE_SECRET_KEY`

### 3.4 Create the live webhook

Create a live webhook endpoint:

- URL:
  `https://api.gavelhouse.app/billing/webhook`

Subscribe to exactly these events first:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Why only these four:

- these are the events the current webhook handler actually processes in
  `apps/api/src/routes/billing.ts`
- `customer.subscription.created` and `invoice.payment_succeeded` were listed in
  earlier generic guidance, but they are not required by the current code path
  and should not be treated as operator-critical until the app starts handling
  them explicitly

Copy the live signing secret into:

- `STRIPE_WEBHOOK_SECRET`

### 3.5 Set all Stripe Worker secrets

Set these exact secrets on `boardstack-api`:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_GROWTH_MONTHLY`
- `STRIPE_PRICE_GROWTH_ANNUAL`
- `STRIPE_PRICE_SCALE_MONTHLY`
- `STRIPE_PRICE_SCALE_ANNUAL`

If using Wrangler, run:

```bash
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_SECRET_KEY --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_WEBHOOK_SECRET --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_STARTER_MONTHLY --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_STARTER_ANNUAL --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_GROWTH_MONTHLY --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_GROWTH_ANNUAL --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_SCALE_MONTHLY --name boardstack-api
pnpm --filter @boardstack/api exec wrangler secret put STRIPE_PRICE_SCALE_ANNUAL --name boardstack-api
```

After setting secrets, redeploy `boardstack-api`.

### 3.6 Smoke test

Use this exact smoke test because it matches the current code:

Run one real-card test flow:

1. Sign up on `https://my.gavelhouse.app`
2. Create a community
3. Confirm the subscription row begins in `pending_checkout`
4. Start checkout on a monthly plan only:
   - `Starter monthly`, or
   - `Growth monthly`, or
   - `Scale monthly`
5. Complete checkout with a real card
6. In Stripe live mode, confirm:
   - customer created
   - subscription created
   - price id on the subscription matches the expected live `price_...`
7. In Cloudflare / app logs, confirm the webhook returns `2xx`
8. In the database, confirm:
   - `subscriptions.stripe_subscription_id` is populated
   - `subscriptions.status` becomes `trialing` or `active` based on Stripe
   - `subscriptions.trial_started_at` and `subscriptions.trial_ends_at` are
     populated if Stripe returned them
   - `communities.stripe_price_id` is populated with the live Stripe price id
9. Confirm the trial-started email flow and billing UI behave correctly
10. Refund/cancel the test charge before launch if this was just a smoke test

## 4. Resend and email routing

### 4.1 Add DNS records in Cloudflare DNS

In Resend:

1. Go to `Domains`
2. Add domain:
   `gavelhouse.app`
3. Copy the exact DNS records Resend gives you

Then in Cloudflare DNS, create the exact records Resend requires for
`gavelhouse.app`:

- `_resend.gavelhouse.app` TXT:
  use Resend's exact verification value
- `resend._domainkey.gavelhouse.app` CNAME:
  use Resend's exact DKIM target
- `gavelhouse.app` TXT:
  `v=spf1 include:_spf.resend.com ~all`
- `_dmarc.gavelhouse.app` TXT:
  `v=DMARC1; p=quarantine; rua=mailto:dmarc@gavelhouse.app; adkim=s; aspf=s`

If an SPF TXT record already exists on the apex, merge the Resend include into
that single existing SPF record. Do not create a second SPF record.

### 4.2 Create forwarders

Turn on Cloudflare Email Routing for `gavelhouse.app`, verify the destination
inbox Cloudflare sends to, then create these exact addresses or forwarders:

- `hello@gavelhouse.app`
- `support@gavelhouse.app`
- `billing@gavelhouse.app`
- `privacy@gavelhouse.app`
- `dmarc@gavelhouse.app`
- `legal@gavelhouse.app`

Sender addresses already used by the code:

- lead magnet and nurture emails send from:
  `Gavelhouse <angel.campa@gavelhouse.app>`
- trial lifecycle emails (started + ending reminder) send from:
  `Gavelhouse <angel.campa@gavelhouse.app>`
- dues reminder emails send from:
  `angel.campa@gavelhouse.app`

Minimum safe setup:

- make `angel.campa@gavelhouse.app` a valid sender identity in Resend
- create inbox forwarders for:
  `hello@gavelhouse.app`, `support@gavelhouse.app`, `privacy@gavelhouse.app`,
  `legal@gavelhouse.app`, and `dmarc@gavelhouse.app`
- point all forwarders at the inbox you actually monitor

### 4.3 Verify delivery

Run these exact tests:

1. Trigger signup verification email
2. Trigger password reset email
3. Confirm both arrive in a normal inbox
4. Confirm lead magnet nurture and trial lifecycle mail sends from:
   `angel.campa@gavelhouse.app`
5. Confirm dues reminder mail sends from:
   `angel.campa@gavelhouse.app`
6. Confirm SPF, DKIM, and DMARC pass in the received message headers

If you want an external authentication check, send one message to:
`check-auth@verifier.port25.com` and confirm the reply says SPF, DKIM, and
DMARC all pass.

## 5. Google OAuth production client

In Google Cloud Console:

1. Create or open the production project.
2. Go to `APIs & Services -> OAuth consent screen`.
3. Use these exact consent screen values:
   - User type:
     `External`
   - App name:
     `Gavelhouse`
   - User support email:
     `angel.campa@gavelhouse.app`
   - App domain home page:
     `https://gavelhouse.app`
   - Privacy Policy URL:
     `https://gavelhouse.app/privacy`
   - Terms of Service URL:
     `https://gavelhouse.app/terms`
   - Authorized domain:
     `gavelhouse.app`
   - Developer contact:
     `angel.campa@gavelhouse.app`
   - Scopes:
     `openid`, `email`, `profile`
4. Click `Publish app`.
5. Go to `APIs & Services -> Credentials -> Create credentials -> OAuth client ID`.
6. Choose:
   `Web application`
7. Name it exactly:
   `boardstack-api-prod`

Authorized JavaScript origins:

- `https://my.gavelhouse.app`
- `https://api.gavelhouse.app`

Authorized redirect URI:

- `https://api.gavelhouse.app/auth/callback/google`

Store the values in these exact Worker secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Then run this exact test:

1. Open `https://my.gavelhouse.app`
2. Click `Sign in with Google`
3. Complete the Google flow
4. Confirm redirect returns to Gavelhouse without OAuth error
5. Confirm the user session is established in the app
6. Confirm the auth cookie is set for `.gavelhouse.app`

## 6. Cloudflare domain and TLS checks

Verify in Cloudflare:

- `gavelhouse.app` -> Worker `boardstack-web`
- `www.gavelhouse.app` -> Worker `boardstack-web`; Astro middleware redirects
  to `https://gavelhouse.app/`
- `my.gavelhouse.app` -> Worker `boardstack-app`
- `api.gavelhouse.app` -> Worker `boardstack-api`

Exact verification path:

1. Go to `Websites -> gavelhouse.app -> DNS`.
2. Confirm the records for the three production hostnames are proxied by
   Cloudflare.
3. Go to `Workers & Pages -> boardstack-web -> Custom domains`.
4. Confirm `gavelhouse.app` is active.
5. Confirm `www.gavelhouse.app` is also active on `boardstack-web`.
6. Go to `Workers & Pages -> boardstack-app -> Custom domains`.
7. Confirm `my.gavelhouse.app` is active.
8. Go to `Workers & Pages -> boardstack-api -> Triggers -> Custom domains`.
9. Confirm `api.gavelhouse.app` is active.

TLS settings:

- SSL mode:
  `Full (strict)`
- `Always Use HTTPS`:
  on
- minimum TLS:
  `1.2`
- HSTS:
  only enable after all domains are confirmed healthy on HTTPS

## 7. Security hardening

In Cloudflare:

- go to `Security -> WAF -> Managed rules`
- enable the Cloudflare Managed Ruleset for the `gavelhouse.app` zone
- go to `Security -> Settings`
- filter for bot traffic and turn `Bot Fight Mode` on
- go to `Security -> WAF -> Rate limiting rules`
- add this first rule:
  - Name:
    `boardstack-auth-rate-limit`
  - Expression:
    `http.host eq "api.gavelhouse.app" and starts_with(http.request.uri.path,"/auth/")`
  - Threshold:
    `10 requests`
  - Period:
    `10 seconds`
  - Action:
    `Block`
- add this second rule:
  - Name:
    `boardstack-billing-webhook-rate-limit`
  - Expression:
    `http.host eq "api.gavelhouse.app" and http.request.uri.path eq"/billing/webhook"`
  - Threshold:
    `30 requests`
  - Period:
    `60 seconds`
  - Action:
    `Managed Challenge` or `Block`

Also verify in production:

- CORS only allows:
  - `https://my.gavelhouse.app`
  - `https://gavelhouse.app`
- Stripe webhook requests require a valid `Stripe-Signature`
- Better Auth production cookies are `Secure`
- `https://api.gavelhouse.app/health` still returns `200` after the security
  rules are enabled

## 8. Final production smoke test

Run this exact order:

1. `https://gavelhouse.app`
2. `https://my.gavelhouse.app`
3. `https://api.gavelhouse.app/health`
4. email/password signup
5. verification email delivery
6. Google OAuth
7. create community
8. start trial
9. upgrade through Stripe
10. verify webhook processing
11. verify support inbox and monitoring are quiet

## 9. Sources

Cloudflare official sources used while writing this guide:

- Pages Git integration:
  `https://developers.cloudflare.com/pages/configuration/git-integration/`
- Pages build configuration:
  `https://developers.cloudflare.com/pages/configuration/build-configuration/`
- Pages branch deployment controls:
  `https://developers.cloudflare.com/pages/configuration/branch-build-controls/`
- Workers CI/CD overview:
  `https://developers.cloudflare.com/workers/ci-cd/`
- Workers Builds:
  `https://developers.cloudflare.com/workers/ci-cd/builds/`
- Workers Builds configuration:
  `https://developers.cloudflare.com/workers/ci-cd/builds/configuration/`
- Workers Builds advanced monorepo setup:
  `https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/`
- Workers Builds API reference:
  `https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/`
- Workers Builds deploy hooks:
  `https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/`
- Workers build watch paths:
  `https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/`
- Bot Fight Mode:
  `https://developers.cloudflare.com/bots/get-started/bot-fight-mode/`
- Email Routing:
  `https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/`
