# Gavelhouse -- Go-Live Checklist

**Owner:** Angel Campa
**Goal:** Everything *you personally* must do (outside the codebase) to take Gavelhouse
from "code complete" to "accepting real customers at gavelhouse.app."
**Companion to:** `docs/infra-bootstrap.md` (first-time infra provisioning).

This document assumes Phases 0-4 are merged, Cloudflare production builds are healthy, and `infra-bootstrap.md`
has been completed with **Stripe in test mode**. Go-live flips everything to
production, verifies it end-to-end, and opens the doors.

Work top-to-bottom. Each section has prerequisites stated at the top. Do not
skip ahead -- several steps (DNS, Stripe live mode, webhook signing secrets)
will silently break downstream steps if done out of order.

---

## 0. Pre-flight -- one week before launch

**Goal:** catch every problem while you still have time to fix it.

- [ ] **Freeze `master`.** No feature merges after pre-flight begins; only
      launch-blocker bug fixes.
- [ ] Run the full local quality gate on a clean checkout of `master`:
      ```bash
      pnpm install
      pnpm run verify
      ```
      Lint, typecheck, and 95%+ coverage must pass.
- [ ] Confirm the latest production and preview deploys are green in Cloudflare
      Pages / Workers for `boardstack-web`, `boardstack-app`, and
      `boardstack-api`.
- [ ] Read through `docs/qa-pass-2026-04.md` and close any open findings.
- [ ] Run the Playwright MCP QA sweep (see `feedback_qa_style` memory -- drive via
      MCP, do not add new `.spec.ts` files) against a staging deploy of
      `apps/app` and `apps/web`. Capture screenshots to `docs/qa-screenshots/`.
- [ ] Confirm you have **one** production Neon branch (`main`) and **one**
      preview/dev branch (`dev`). Delete any stale branches.
- [ ] Confirm you own the domain `gavelhouse.app` in Cloudflare Registrar
      (or the registrar you used) and the nameservers point at Cloudflare.
- [ ] Make sure you have access to: Cloudflare, Neon, Stripe, Resend,
      Sentry, PostHog, Apollo, Google Cloud Console (for OAuth),
      and the `angel.campa@gavelhouse.app` inbox. Put all credentials in
      1Password / your password manager before launch day.

---

## 1. Domain, DNS, and TLS

**Prereqs:** Cloudflare account owns `gavelhouse.app`.

### 1.1 Verify nameservers

- [ ] In your registrar, confirm nameservers point to Cloudflare
      (`*.ns.cloudflare.com`).
- [ ] Cloudflare -> **Websites** -> `gavelhouse.app` shows **Active** status.

### 1.2 Custom domains on Pages / Workers

These should already exist from `infra-bootstrap.md` Section 1d. Re-verify each:

- [ ] `gavelhouse.app` -> attached to Worker `boardstack-web`,
      status **Active**.
- [ ] `www.gavelhouse.app` -> attached to Worker `boardstack-web`; Astro
      middleware redirects to apex.
- [ ] `my.gavelhouse.app` -> attached to Worker `boardstack-app`,
      status **Active**.
- [ ] `api.gavelhouse.app` -> attached to Worker `boardstack-api`,
      status **Active**.

### 1.3 TLS / SSL

- [ ] Cloudflare -> `gavelhouse.app` -> **SSL/TLS** -> **Overview** -> set mode to
      **Full (strict)**. (Not Flexible -- Flexible breaks Better Auth cookies.)
- [ ] **SSL/TLS** -> **Edge Certificates** -> **Always Use HTTPS** = On.
- [ ] **Edge Certificates** -> **HSTS** -> Enable with:
      `max-age=31536000; includeSubDomains; preload` -- *only* after you've
      verified all three subdomains load correctly on HTTPS. HSTS is hard to
      reverse.
- [ ] **Edge Certificates** -> **Minimum TLS Version** = 1.2.
- [ ] Test in browser: `https://gavelhouse.app`, `https://www.gavelhouse.app`,
      `https://my.gavelhouse.app`, `https://api.gavelhouse.app/health` all
      return 200 with a valid cert.

### 1.4 Cookies

- [ ] In Better Auth config (`apps/api`), confirm session cookie domain is
      `.gavelhouse.app` so `my.gavelhouse.app` and `api.gavelhouse.app` share
      sessions.
- [ ] Confirm cookies are `Secure`, `HttpOnly`, `SameSite=Lax` in production.

---

## 2. Email deliverability

**Prereqs:** Section 1 complete. Resend account and `boardstack-prod` API key exist
(`infra-bootstrap.md` Section 4).

### 2.1 Resend domain records

In Cloudflare DNS for `gavelhouse.app`, add the records Resend gives you at
**Domains -> gavelhouse.app**:

- [ ] **TXT** `_resend.gavelhouse.app` -- domain ownership
- [ ] **CNAME** `resend._domainkey.gavelhouse.app` -- DKIM
- [ ] **TXT** `gavelhouse.app` -- SPF, value:
      `v=spf1 include:_spf.resend.com ~all`
      (Merge with any existing SPF record; you can only have one.)
- [ ] **TXT** `_dmarc.gavelhouse.app` -- DMARC, value:
      `v=DMARC1; p=quarantine; rua=mailto:dmarc@gavelhouse.app; adkim=s; aspf=s`
      Start at `p=quarantine`. Move to `p=reject` after two weeks of clean
      DMARC reports.
- [ ] Back in Resend, click **Verify**. All records show green.

### 2.2 From addresses

- [ ] Create aliases / forwarders (Cloudflare Email Routing is easiest):
      - `hello@gavelhouse.app` -> your inbox
      - `support@gavelhouse.app` -> your inbox
      - `billing@gavelhouse.app` -> your inbox
      - `dmarc@gavelhouse.app` -> your inbox (for DMARC reports)
      - `legal@gavelhouse.app` -> your inbox
- [ ] Confirm sender addresses in `apps/api` code match Resend verified identities:
      - `angel.campa@gavelhouse.app` -- lead magnet nurture + trial lifecycle emails
      - `angel.campa@gavelhouse.app` -- dues reminder emails (HOA board -> homeowners)

### 2.3 Test sends

- [ ] Trigger a real signup on staging -> confirm the verification email
      arrives in Gmail inbox (not spam).
- [ ] Trigger a password reset -> confirm delivery.
- [ ] Send a test email to `check-auth@verifier.port25.com` -- reply shows
      SPF, DKIM, DMARC all **pass**.

---

## 3. Google OAuth (production client)

**Prereqs:** Section 1 complete -- `my.gavelhouse.app` resolves.

The dev OAuth client will not work on production origins -- create a separate
production client.

- [ ] [Google Cloud Console](https://console.cloud.google.com) -> create
      project `boardstack-prod` (or use existing).
- [ ] **APIs & Services** -> **OAuth consent screen**:
  - User type: **External**
  - App name: `Gavelhouse`
  - User support email: `angel.campa@gavelhouse.app`
  - Logo: upload 120x120 Gavelhouse logo (PNG, transparent bg)
  - App domain: `https://gavelhouse.app`
  - Privacy policy URL: `https://gavelhouse.app/privacy`
  - Terms URL: `https://gavelhouse.app/terms`
  - Authorized domains: `gavelhouse.app`
  - Developer contact: `angel.campa@gavelhouse.app`
  - Scopes: `email`, `profile`, `openid` (no sensitive scopes needed)
- [ ] **Publish** the consent screen (not just save). Required for users
      outside your Google org.
- [ ] **Credentials** -> **Create credentials** -> **OAuth client ID**:
  - Type: **Web application**
  - Name: `boardstack-api-prod`
  - Authorized JavaScript origins: `https://my.gavelhouse.app`,
    `https://api.gavelhouse.app`
  - Authorized redirect URIs: `https://api.gavelhouse.app/auth/callback/google`
    (exact path -- match what Better Auth expects)
- [ ] Copy **Client ID** and **Client Secret**.
- [ ] Store as Worker secrets:
      ```bash
      wrangler secret put GOOGLE_CLIENT_ID --name boardstack-api
      wrangler secret put GOOGLE_CLIENT_SECRET --name boardstack-api
      ```
- [ ] Test "Sign in with Google" on staging before launch day.

---

## 4. Stripe -- flip to live mode

**Prereqs:** Full end-to-end billing test passed in test mode (signup ->
Checkout -> webhook -> subscription state updates on `communities`).

This is the highest-risk step. Do it at least 48 hours before launch so you
have time to fix problems.

### 4.1 Activate the Stripe account

- [ ] Stripe Dashboard -> top-right toggle from **Test mode** to **Live mode**.
      If the account is not yet activated, complete **Activate payments**:
  - Legal entity: your business entity (LLC / sole proprietor)
  - Tax ID / EIN
  - Bank account (ACH payout)
  - Statement descriptor: `GAVELHOUSE` (<=22 chars, no special)
  - Public business name: `Gavelhouse`
  - Support phone / email: `angel.campa@gavelhouse.app`
  - Website: `https://gavelhouse.app`
  - Product description: "Compliance-focused SaaS for self-managed HOA/condo
    boards. Reserve fund accounting, governance workflows, and state
    compliance reporting."

### 4.2 Recreate products and prices in live mode

Test-mode products do not carry over.

- [ ] Recreate the three products from `infra-bootstrap.md` Section 7a in **Live**.
- [ ] Recreate the six recurring prices from Section 7b. Copy each **live** price ID
      (`price_...`, starts with the same prefix but is a new object).
- [ ] Update `packages/shared` (or wherever price IDs are referenced) with
      the live IDs. Or, preferably, keep price IDs as Worker secrets so you
      don't rebuild the dashboard just to swap them.

### 4.3 Live restricted API key

- [ ] **Developers** -> **API keys** -> **Live mode** -> **Create restricted key**
      with the same permissions as the test key.
- [ ] `wrangler secret put STRIPE_SECRET_KEY --name boardstack-api` -- paste
      the live key.

### 4.4 Live webhook endpoint

- [ ] **Developers** -> **Webhooks** -> **Live mode** -> **Add endpoint**:
  - URL: `https://api.gavelhouse.app/billing/webhook`
  - Events: `checkout.session.completed`, `customer.subscription.created`,
    `customer.subscription.updated`, `customer.subscription.deleted`,
    `invoice.payment_failed`, `invoice.payment_succeeded`
- [ ] Copy the **live signing secret** (`whsec_...`).
- [ ] `wrangler secret put STRIPE_WEBHOOK_SECRET --name boardstack-api`.
- [ ] Push all price-ID secrets:
      ```bash
      wrangler secret put STRIPE_PRICE_STARTER_MONTHLY --name boardstack-api
      wrangler secret put STRIPE_PRICE_STARTER_ANNUAL  --name boardstack-api
      wrangler secret put STRIPE_PRICE_GROWTH_MONTHLY  --name boardstack-api
      wrangler secret put STRIPE_PRICE_GROWTH_ANNUAL   --name boardstack-api
      wrangler secret put STRIPE_PRICE_SCALE_MONTHLY   --name boardstack-api
      wrangler secret put STRIPE_PRICE_SCALE_ANNUAL    --name boardstack-api
      ```
- [ ] Redeploy the Worker so the new secrets load.

### 4.5 Live billing smoke test

- [ ] With a **real personal card**, sign up on `my.gavelhouse.app`, create a
      community, start the trial, then upgrade to Starter monthly. Confirm:
  - [ ] Stripe shows a live customer + subscription
  - [ ] Webhook endpoint shows 2xx responses (no failed deliveries)
  - [ ] `communities` row has `stripe_subscription_id`, `plan`, `status=active`
  - [ ] Receipt email arrives from Stripe
- [ ] Cancel the test subscription in Stripe -> confirm webhook fires and
      `communities.status` transitions to `canceled`.
- [ ] Refund the charge in Stripe before launch day so you don't leave a real
      charge on your card.

### 4.6 Tax, invoices, and payouts

- [ ] Stripe **Settings** -> **Tax** -> enable Stripe Tax if you're charging
      customers in multiple US states. (You're B2B SaaS; sales tax applies in
      some states -- consult your accountant.)
- [ ] **Billing** -> **Invoices** -> set default footer with business legal name
      and address.
- [ ] **Settings** -> **Bank accounts and scheduling** -> confirm payout bank
      account and payout schedule (default: rolling 2-day).
- [ ] **Settings** -> **Emails** -> customize receipt/invoice email header with
      Gavelhouse logo.

---

## 5. Neon -- production database readiness

**Prereqs:** `infra-bootstrap.md` Section 2-3 complete.

- [ ] Confirm `main` branch has all migrations applied:
      ```bash
      pnpm --filter @boardstack/api run db:migrate
      ```
- [ ] Confirm the live schema matches the current Drizzle migrations by
      checking `apps/api/src/db/schema/` against the latest generated migration
      files before you run `db:migrate`.
- [ ] Verify the production database does not require any one-off seed script
      before launch. If launch data needs to exist, add that migration or admin
      step explicitly before go-live.
- [ ] Neon console -> `main` branch -> **Compute** -> set autoscaling limits
      appropriate for launch (start with 0.25-1 CU).
- [ ] **Settings** -> **Point-in-time restore** -> confirm PITR retention is at
      least 7 days (Scale plan) or the max your plan allows.
- [ ] Record the Neon recovery procedure somewhere you can find at 2am (Notion
      runbook): *how to restore `main` to a timestamp*.

---

## 6. Cloudflare / DB connectivity - production verification

Gavelhouse's production Worker connects to Neon via DATABASE_URL. Hyperdrive
does not sit on the current production path, so verify the direct connection
setup instead of looking for a Hyperdrive binding.

- [ ] Cloudflare Workers -> boardstack-api -> confirm DATABASE_URL is set as
      a production secret and the latest deploy is healthy.
- [ ] Run a real app/API query through the deployed Worker (for example:
      authenticated community fetch or billing portal bootstrap) and confirm
      end-to-end latency is acceptable from a US client.
- [ ] Rotate the Neon production password / connection string once after
      launch, update the Worker secret, redeploy, and verify the Worker still
      connects (proves rotation procedure works).

---

## 7. Security hardening

- [ ] Cloudflare -> **Security** -> **WAF** -> enable the **Cloudflare Managed
      Ruleset** for `gavelhouse.app`.
- [ ] **Security** -> **Bots** -> enable **Bot Fight Mode** (free) or Super Bot
      Fight Mode (Pro).
- [ ] **Security** -> **Settings** -> Security Level = **Medium**.
- [ ] **Rules** -> **Rate Limiting Rules** -> add a rule for
      `api.gavelhouse.app/auth/*` -- e.g., 10 requests / 10 seconds per IP,
      action = Block.
- [ ] Add a similar rule for `api.gavelhouse.app/billing/webhook` -- allow only
      Stripe's published IP ranges (or rely on signature verification -- which
      you already do -- but rate limit anyway).
- [ ] Confirm `apps/api` sends these security headers on HTML responses where
      relevant, and on all API responses:
  - `Strict-Transport-Security` (matches Cloudflare HSTS)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [ ] `apps/web` and `apps/app` serve a Content Security Policy. Minimum:
      `default-src 'self'; connect-src 'self' https://api.gavelhouse.app
       https://us.i.posthog.com https://*.sentry.io; img-src 'self' data:
       https:; script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com;
       style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`.
      Tune by loading the app with DevTools open and fixing CSP violations.
- [ ] Confirm CORS on `api.gavelhouse.app` allows only
      `https://my.gavelhouse.app` and `https://gavelhouse.app` as origins.
- [ ] Confirm Stripe webhook handler **only** trusts requests with a valid
      `Stripe-Signature` header against the live signing secret.
- [ ] Rotate any secret that was ever pasted into a chat, Slack, or
      screenshot during development.

---

## 8. Monitoring, alerting, and logging

**Prereqs:** Sentry, PostHog set up per `infra-bootstrap.md` Section 5-6.

### 8.1 Sentry

- [ ] Both projects (`boardstack-app`, `boardstack-api`) receiving events from
      production after a test deploy.
- [ ] **Alerts** -> create issue alerts for each project:
  - New issue in production -> email to `angel.campa@gavelhouse.app`
  - Issue frequency > 20 events/min -> email
- [ ] Confirm source maps are available in Sentry for recent production errors,
      whether they were uploaded through Cloudflare-native build steps or a
      manual release flow.
- [ ] Set **data scrubbing** to strip fields named `password`, `token`,
      `stripe_*`, `session`, `cookie`.

### 8.2 PostHog

- [ ] Confirm events from `apps/web` (pageviews, CTA clicks) and `apps/app`
      (signup, community created, trial started, upgraded) appear in live data.
- [ ] Create a dashboard: **"Launch funnel"** with:
  - Landing pageview -> Signup start -> Signup complete -> Community created ->
    Trial activated -> Converted to paid.
- [ ] Set up an alert on signup drop: if daily signups = 0 during a weekday,
      email Angel.

### 8.3 Cloudflare

- [ ] **Workers & Pages** -> `boardstack-api` -> **Logs** -> **Workers Logs**
      enabled.
- [ ] **Notifications** -> subscribe `angel.campa@gavelhouse.app` to:
  - HTTP error rate anomaly
  - Workers usage error alert
  - Pages deployment failures
  - DNS record changes (in case of account compromise)

### 8.4 Uptime monitoring (external)

- [ ] Set up an external uptime monitor (Better Stack / UptimeRobot / OneUptime)
      hitting `https://api.gavelhouse.app/health` and
      `https://gavelhouse.app` every 60 s, with SMS alert to your phone.

---

## 9. Legal and compliance content

Gavelhouse markets itself on compliance -- the site must not be sloppy on its
own compliance.

- [ ] **Privacy Policy** at `/privacy` -- accurate to what you collect (email,
      name, community data, Stripe customer, Neon DB data, PostHog analytics,
      Sentry crash data). Disclose subprocessors: Cloudflare, Neon, Stripe,
      Resend, PostHog, Sentry, Google (OAuth), Apollo.
- [ ] **Terms of Service** at `/terms` -- name the legal entity, limitation of
      liability, SLA (or explicit "no SLA for Starter tier"), payment terms,
      cancellation/refund terms.
- [ ] **DPA** at `/dpa` -- data processing agreement for customers who need
      one. A stub linking to `angel.campa@gavelhouse.app` is acceptable at launch;
      a full DPA is blocking if you're selling to enterprise.
- [ ] **Subprocessor list** at `/subprocessors`.
- [ ] **Cookie notice** -- a banner on `gavelhouse.app` disclosing PostHog
      analytics. (You don't need GDPR consent gating for US-only launch, but
      add disclosure.)
- [ ] Remove every trace of fabricated social proof: user counts, testimonials,
      waitlist numbers. Per `CLAUDE.md` brand rules.
- [ ] Confirm pricing page uses annual billing by default, shows Y80OFF,
      names the 30-day money-back guarantee, and matches `packages/shared`
      pricing constants and Terms.
- [ ] Ensure no copy claims HOA-law / real-estate expertise. Builder
      perspective only.
- [ ] Footer: copyright line with your legal entity name and current year.

---

## 10. Content and SEO

- [ ] Open Graph image at `apps/web/public/og-default.png` (1200x630) -- renders
      correctly when you paste a Gavelhouse URL in iMessage / Slack / LinkedIn.
- [ ] Favicon at `apps/web/public/favicon.ico` + `favicon-32x32.png` +
      `apple-touch-icon.png` (180x180).
- [ ] `apps/web/public/robots.txt` allows all + points to sitemap.
- [ ] `apps/web/public/sitemap.xml` (or Astro-generated) includes every live
      marketing page.
- [ ] Submit the site to:
  - [ ] [Google Search Console](https://search.google.com/search-console)
        -- verify via Cloudflare DNS TXT, submit sitemap.
  - [ ] [Bing Webmaster Tools](https://www.bing.com/webmasters) -- same.
- [ ] Run [PageSpeed Insights](https://pagespeed.web.dev/) on the homepage.
      LCP under 2.5s, CLS under 0.1. Fix any red metrics.
- [ ] Tripled-check every `<title>` and `<meta description>` on
      marketing pages is unique and pitched at compliance-focused board members.

---

## 11. Support and ops

- [ ] Create Notion/Linear/Dropbox Paper page: **Gavelhouse runbook**.
      Include:
  - On-call contact (you)
  - How to roll back a Worker deploy (`wrangler rollback`)
  - How to restore Neon to a point in time
  - How to pause Stripe billing in an emergency
  - How to invalidate all sessions (rotate Better Auth secret)
- [ ] Set up `angel.campa@gavelhouse.app` inbox workflow (Gmail label / filter, or
      Help Scout / Plain / Linear front-end).
- [ ] Status page: create a free [Instatus](https://instatus.com) or
      [status.io](https://status.io) page at `status.gavelhouse.app`. Wire it
      to your uptime monitor.
- [ ] Write one canned response for each of: password reset help, Stripe
      billing issue, "how do I import my HOA data?", "is Gavelhouse right for
      a [X]-unit community?".

---

## 12. Deploy safety

- [ ] Production deploys happen from `master` through the repo deploy scripts.
      Confirm frontend deploys target Workers `boardstack-app` and
      `boardstack-web`, not Cloudflare Pages projects.
- [ ] Keep a **manual gate** on Worker deploys: use `wrangler deploy`
      deliberately until you have completed at least one successful prod deploy
      plus rollback rehearsal.
- [ ] Try a rollback once before launch: deploy, then `wrangler rollback`, then
      confirm the previous version is serving.

---

## 13. Final launch-day runbook

Do these, in order, on launch day.

- [ ] **T-24h:** freeze merges to `master`.
- [ ] **T-4h:** final `pnpm run verify` on clean checkout. Deploy Worker +
      both Pages sites from `master`. Smoke test `/health`, signup, Stripe
      checkout with a real card, Google OAuth, password reset email.
- [ ] **T-1h:** publish status page as **operational**.
- [ ] **T-0:** flip any "coming soon" gate on marketing site. Post launch
      announcements (Product Hunt, LinkedIn, Twitter/X, HOA-board subreddits
      where allowed, your personal network, any waitlist in Apollo).
- [ ] **T+15min:** watch Sentry, PostHog live events, Cloudflare analytics,
      Stripe payments, uptime monitor, support inbox -- all simultaneously.
- [ ] **T+1h:** confirm first real signup (or at least first real pageview
      beyond your own). Check DMARC is not bouncing transactional emails.
- [ ] **T+24h:** review Sentry error rate, top PostHog funnels, any failed
      Stripe webhooks, any 5xx spikes in Cloudflare. File issues for each.

---

## 14. Post-launch week 1

- [ ] Un-freeze `master`; resume normal dev flow.
- [ ] Write a retro in `docs/launch-retro.md`: what broke, what surprised you,
      what to change for the next feature launch.
- [ ] Review DMARC reports from `dmarc@gavelhouse.app`. If clean after 2
      weeks, move DMARC policy to `p=reject`.
- [ ] Review Stripe payouts landing in your bank.
- [ ] Follow up personally (email or call) with the first 10 signups.
- [ ] Book an accountant conversation about sales tax nexus if you have
      paying customers in multiple states.

---

## Appendix A -- Complete manual credential checklist

Everything you touch outside the repo, in one list, for a password-manager
sweep:

- [ ] Cloudflare account login + 2FA recovery codes saved
- [ ] Cloudflare API token (scoped to Pages + Workers + DNS for
      `gavelhouse.app`) saved -- for Cloudflare and `wrangler`
- [ ] Neon account login + 2FA + production connection strings
- [ ] Production `DATABASE_URL` / Neon connection strings saved
- [ ] Stripe account login + 2FA + live restricted API key + live webhook
      signing secret + all 6 live price IDs
- [ ] Resend login + prod API key
- [ ] Sentry login + DSNs for both projects + source map auth token
- [ ] PostHog login + project API key
- [ ] Apollo login + API key
- [ ] Google Cloud Console login + OAuth client ID/secret for prod
- [ ] Registrar login (if not Cloudflare Registrar)
- [ ] Domain email routing credentials
- [ ] External uptime monitor login

## Appendix B -- Kill switches

If something goes badly wrong post-launch:

- **Stop new signups:** feature-flag the signup route in `apps/api` to return
  503, redeploy. Marketing site still up.
- **Pause billing:** disable the Stripe webhook endpoint and stop all
  outgoing webhook retries from the Dashboard. Existing subscriptions
  continue, but no new charges are processed through your flow.
- **Take the app offline:** Cloudflare -> `my.gavelhouse.app` -> Page Rule:
  forward to `gavelhouse.app/maintenance`. Marketing site stays up.
- **Full outage:** Cloudflare -> DNS -> pause `gavelhouse.app` (temporarily
  remove proxy). Site goes dark. Use only as last resort; breaks email too.
- **Restore DB:** Neon -> `main` -> Restore to timestamp. This creates a new
  branch; you then update the Worker `DATABASE_URL` secret to point at it. Rehearse before launch.
