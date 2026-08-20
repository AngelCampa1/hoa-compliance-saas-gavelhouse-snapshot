# Production E2E Bug Report - 2026-05-06

**Environment:** production
**Marketing:** https://gavelhouse.app
**App:** https://my.gavelhouse.app
**API:** https://api.gavelhouse.app
**Method:** manual Playwright CLI, no new Playwright specs
**Artifacts:** `output/playwright/e2e-production-qa-2026-05-06/`
**QA account:** timestamped production QA user created through signup

## Summary

The production sweep covered representative marketing routes, auth, signup,
billing/trial state, dashboard shell, finance, banking, reports, governance,
portfolio, help/settings, owner portal entry points, desktop/mobile responsive
checks, console errors, and first-party request failures.

Two code-fixable production bugs were confirmed:

1. Marketing initializes PostHog without a token on every tested public page.
2. Scale-only report routes mount report UI and issue forbidden API requests for
   a Growth trial community instead of showing an upgrade state.

## BUG-01 - Marketing initializes PostHog without a token

**Severity:** Major
**Status:** Fixed and verified in production after deploy
**Environment:** production marketing web
**URLs:** representative sample included `/`, `/pricing/`, `/features/`,
`/resources/`, `/compare/`, `/hoa-compliance/`, `/free/`,
`/free/reserve-fund-calculator/`, `/product/hoa-financial-reporting-software/`,
`/solutions/small-self-managed-hoa-software/`, legal pages, and 404.

**Steps to reproduce**

1. Open `https://gavelhouse.app/`.
2. Capture browser console errors.
3. Repeat on representative public routes.

**Expected**

Marketing should either initialize PostHog with a configured public token or
omit the PostHog bootstrap when no token is configured.

**Actual**

Every tested marketing page logs:

`[PostHog.js] PostHog was initialized without a token.`

**Evidence**

- `output/playwright/e2e-production-qa-2026-05-06/marketing-home-desktop.png`
- Playwright CLI console output from the production homepage.
- Site-wide marketing route sweep showed the same console error on desktop and
  mobile representative URLs.

**Suspected area**

`apps/web/src/lib/analytics.ts` and
`apps/web/src/layouts/base-layout.astro`.

**Fix**

`buildPostHogBootstrapScript()` now returns an empty string when
`PUBLIC_POSTHOG_KEY` is missing, so production does not inject a broken
analytics bootstrap. Added regression coverage in
`apps/web/src/lib/analytics.test.ts`.

**Post-deploy verification**

Deployed commit `3ad948c` to `boardstack-web`. Playwright smoke on
`https://gavelhouse.app/` captured
`output/playwright/e2e-production-qa-2026-05-06/post-deploy-marketing-home.png`
and confirmed the missing-token PostHog console error is no longer present.

## BUG-02 - Scale-only report routes render partial UI for lower-tier communities

**Severity:** Major
**Status:** Fixed and verified in production after deploy
**Environment:** production dashboard app and API
**URLs:**

- `https://my.gavelhouse.app/reports/trial-balance`
- `https://my.gavelhouse.app/reports/income-statement`
- `https://my.gavelhouse.app/reports/general-ledger`
- `https://my.gavelhouse.app/reports/balance-sheet`
- `https://my.gavelhouse.app/reports/audit-pack`

**Steps to reproduce**

1. Sign up for a Growth trial from
   `https://my.gavelhouse.app/signup?plan=growth&cycle=monthly`.
2. Open Scale-only report routes directly.
3. Observe console/network behavior and page content.

**Expected**

Lower-tier communities should see a clear upgrade state and should not mount
queries that call Scale-only report endpoints.

**Actual**

Trial balance, income statement, general ledger, and balance sheet pages render
their report headers/controls and then log first-party 403 resource errors.
The page content appears blank or empty rather than explaining the tier gate.

**Evidence**

- `output/playwright/e2e-production-qa-2026-05-06/app-desktop-reports-audit-pack.png`
- Production route sweep console output showed `403` resource errors for the
  Scale-only report pages when logged in as the Growth trial QA community.

**Suspected area**

Dashboard report route components under `apps/app/src/routes/_app.reports.*`.
The sidebar labels already mark the links as Scale-gated and the API enforces
the tier, but direct route entry did not gate the route body before mounting
report queries.

**Fix**

Added `TierUpgradeGate` and wrapped Scale-only report pages so lower-tier
communities see an upgrade CTA instead of partial report UI. Added regression
coverage in `apps/app/__tests__/components/tier-upgrade-gate.test.tsx`.

**Post-deploy verification**

Deployed commit `3ad948c` to `boardstack-app`. Authenticated Playwright smoke
with the isolated Growth QA account confirmed all five Scale-only report routes
show the upgrade gate and no longer issue report-endpoint `403` requests:

- `/reports/trial-balance`
- `/reports/income-statement`
- `/reports/general-ledger`
- `/reports/balance-sheet`
- `/reports/audit-pack`

## Non-Bug Observations

- Invalid login displays `Invalid email or password`; the browser logs the
  expected `401` resource load for that negative test.
- Marketing 404 returns a custom "This page doesn't exist." page. The browser
  logs the expected 404 resource load for the intentionally missing QA URL.
- Mobile marketing navigation is operable through the labelled summary control.
  Playwright exposes the control as a generic labelled element, but it can be
  clicked and opens the mobile menu.
- Signup, trial creation, dashboard, billing, finance, banking, governance,
  portfolio, help/settings, `/owner`, and `/portal` smoke checks completed
  without unexpected first-party failures in the QA account.

## Verification Log

- `pnpm run typecheck` passed before fixes.
- `pnpm --filter @boardstack/app test -- __tests__/components/tier-upgrade-gate.test.tsx`
  passed after the report gate fix.
- `pnpm --filter @boardstack/web test -- src/lib/analytics.test.ts` passed
  after the PostHog bootstrap fix.
- `pnpm --filter @boardstack/web test -- src/lib/boardstack-pricing-content-audit.test.ts`
  passed after updating stale pricing guidance in docs.
- `pnpm run verify` passed before merge and deploy.
- `pnpm run deploy:touched -- --from fdbb7a2` deployed `boardstack-app` and
  `boardstack-web`; both deploy scripts verified live commit `3ad948c`.
- `npx wrangler pages project list` confirmed `boardstack-web` is the only
  Gavelhouse production marketing Pages project; no stale
  `ideas-validation` Gavelhouse marketing project was present.
- Post-deploy Playwright smoke passed for `https://gavelhouse.app/` and the
  authenticated Scale-only report routes on `https://my.gavelhouse.app/`.

