# Production E2E Full QA Bug Report - 2026-05-06

**Environment:** production  
**Marketing:** `https://gavelhouse.app`  
**App:** `https://my.gavelhouse.app`  
**API:** `https://api.gavelhouse.app`  
**Artifacts:** `output/playwright/e2e-production-full-2026-05-06/`  
**QA credentials:** stored only in gitignored root `.env` under `LIVE_E2E_*`

## Summary

Production QA covered public marketing routes, API health, signup, trial start,
authenticated dashboard routes, invitation token creation, owner/report gates,
lead-magnet PDF download, malformed request cases, mobile login, forced-colors
keyboard focus, and SEO audit warnings.

Two code defects were confirmed, fixed, deployed, and rechecked in production:

1. Malformed homeowner CSV with unrecognized headers returned a successful
   empty import.
2. Settings emitted React controlled/uncontrolled Select warnings after
   community data loaded.

Mailbox inspection was not available in this browser/session. Email sends were
triggered for signup, lead magnet delivery, and board invitations, but delivery
headers and unsubscribe-click behavior remain an access gap.

## BUG-01 - Malformed homeowner CSV can return successful empty import

**Severity:** Major
**Status:** Fixed, deployed, and verified in production
**Area:** API homeowner import
**Evidence:** `app-api-production-sweep.json`

### Steps

1. Sign up a production QA owner and start a Growth trial.
2. POST `bad` as CSV text to
   `/governance/homeowners/import?communityId=<qa-community>`.

### Expected

Malformed CSV without required homeowner headers should return a negative
response, so the UI/API cannot mark an empty import as successful.

### Actual

Production returned `201` with `{"imported":0,"errors":[]}`.

### Fix

`parseRosterCsv()` now validates required headers before treating a CSV as an
empty/header-only no-op. Missing required headers produce row `1` errors and the
route returns `422`.

### Regression Coverage

- `apps/api/__tests__/domain/governance/rosterImport.test.ts`
- `apps/api/__tests__/routes/governance/homeowners.test.ts`

### Production Recheck

After deploying API commit `4e6f67c`, the same malformed CSV request returned
`422` with required-header errors for `firstName`, `lastName`, `email`, and
`address`.

## BUG-02 - Settings emits controlled/uncontrolled Select warnings

**Severity:** Minor
**Status:** Fixed, deployed, and verified in production
**Area:** Dashboard Settings page
**Evidence:** `app-final-settings.png`, `app-api-production-sweep.json`

### Steps

1. Sign in to production.
2. Open `https://my.gavelhouse.app/settings`.
3. Inspect browser console output.

### Expected

Settings should render without React controlled/uncontrolled warnings.

### Actual

The page logged Select controlled/uncontrolled warnings when the community state
field reset from loading defaults to the selected community state.

### Fix

`StateSelect` now keeps Radix Select controlled by using the existing sentinel
value for the empty state instead of passing `undefined`.

### Regression Coverage

- `apps/app/__tests__/components/ui/state-select.test.tsx`
- `apps/app/__tests__/routes/settings.test.tsx`

### Production Recheck

After deploying app commit `4e6f67c`, the Settings page rendered successfully and
browser console inspection showed zero warning or error messages for the
controlled/uncontrolled Select issue.

## Non-Bug Findings

- API health passed on both `/health` and `/api/health` during the initial QA
  pass; both returned commit `fdbb7a2`.
- API deploy verification reported live commit `4e6f67c` after deployment, but
  direct post-deploy `curl` checks for both `/health` and `/api/health` returned
  `{"ok":true,"version":"1","commit":"dev"}`. The endpoints are healthy, but
  the exposed commit metadata is inconsistent with the deploy verifier.
- Dashboard app deploy verification passed for commit `4e6f67c`; the production
  HTML contains `<meta name="build-commit" content="4e6f67c" />`.
- Cloudflare Pages project listing showed `boardstack-web` as the only
  Gavelhouse marketing Pages project, with `boardstack-app` present for the
  dashboard. No stale `ideas-validation` marketing project was visible.
- Marketing route sweeps returned expected page statuses. Cloudflare RUM POSTs
  sometimes appeared as aborted after `204` responses during rapid navigation;
  these were treated as telemetry noise, not first-party app failures.
- Growth trial access to Scale-only reports returned `403 upgrade_required`,
  and the app showed upgrade gates on sampled report routes.
- Lead-magnet subscribe returned a signed download URL. The downloaded file
  started with `%PDF`; a tampered signature returned a negative response.
- Invalid invitation token UI produced an invalid/expired token state.
- `pnpm --filter @boardstack/web audit:seo` reported 6 warnings, all one-character
  truncation warnings for meta titles/descriptions. Accepted as low-risk content
  polish, not blocking defects.

## Access Gaps

- Inbox access was unavailable, so SPF/DKIM/DMARC headers, delivered subjects,
  password reset email delivery, and unsubscribe-click behavior were not
  verified directly.
- External Sentry, PostHog, Resend, Stripe, and Cloudflare dashboards were not
  available in the browser/session. Browser/network initialization and API/UI
  behavior were verified where possible.

## Verification Log

- `pnpm --filter @boardstack/web audit:seo`: passed with 6 reviewed warnings.
- `pnpm --filter @boardstack/api test -- __tests__/domain/governance/rosterImport.test.ts __tests__/routes/governance/homeowners.test.ts`: passed after fix.
- `pnpm --filter @boardstack/app test -- __tests__/components/ui/state-select.test.tsx __tests__/routes/settings.test.tsx`: passed after fix.
- `pnpm --filter @boardstack/app test:coverage`: passed.
- `pnpm run lint`: passed.
- `pnpm run typecheck`: passed.
- `pnpm run test:coverage`: passed.
- `pnpm run test:scripts`: passed.
- `pnpm run verify`: passed.
- Dedicated reviewer agent: no remaining issues after redacting/ignoring
  generated QA output artifacts.
- `pnpm run deploy:touched -- --from 4834a93`: deployed API. App deployment
  required rerunning `pnpm run deploy:app` with
  `VITE_API_URL=https://api.gavelhouse.app`.
- Targeted production recheck: BUG-01 returned `422` for malformed CSV; BUG-02
  produced zero controlled/uncontrolled console warnings on Settings.

