# Production E2E Exhaustive Bug Report - 2026-05-07

## Scope

Production QA covered:

- Marketing: `https://gavelhouse.app`
- App: `https://my.gavelhouse.app`
- API: `https://api.gavelhouse.app`

Artifacts were written under
`output/playwright/prod-e2e-bug-hunt-2026-05-07/`.

Existing `LIVE_E2E_*` and `LIVE_E2E_QA_*` credentials from the gitignored root
`.env` were used. Credential values, cookies, and tokens were not added to
tracked files.

## Summary

The production pass crawled all 403 sitemap URLs on desktop and mobile, checked
representative marketing screenshots, exercised unauthenticated app redirects,
signed in with the dedicated production QA owner account, opened 24 dashboard
routes, and probed public and authenticated API validation/auth surfaces.

One reproducible marketing defect was found and fixed:

1. The contact page used a `mailto:` form action, which Chromium reported as a
   mixed-content form target on the HTTPS page.

No authenticated app route produced first-party console errors or failed
first-party responses during the sweep. Starter-trial gated routes rendered
upgrade states without leaking gated API request errors.

## BUG-01 - Contact page mailto form triggers mixed-content warning

**Severity:** Minor  
**Status:** Fixed, deployed, and verified in production  
**Area:** Marketing contact page  
**Route:** `/contact/`  
**Role:** Public visitor  
**Viewports:** Desktop and mobile

### Reproduction

1. Open `https://gavelhouse.app/contact/`.
2. Inspect browser console output.

### Expected

The contact page should render without browser security warnings. Contact
actions should be explicit links or a real HTTPS-backed form endpoint.

### Actual

Chromium logged:

- `Mixed Content: The page at 'https://gavelhouse.app/contact/' ... contains a form that targets an insecure endpoint 'mailto:angel.campa@gavelhouse.app'.`

### Evidence

- `output/playwright/prod-e2e-bug-hunt-2026-05-07/qa-results.json`
- `output/playwright/prod-e2e-bug-hunt-2026-05-07/marketing-contact-desktop.png`
- `output/playwright/prod-e2e-bug-hunt-2026-05-07/marketing-contact-mobile.png`

### Root Cause

`apps/web/src/pages/contact.astro` rendered a real form with
`action="mailto:angel.campa@gavelhouse.app"`. On an HTTPS page, Chromium treats
that form target as an insecure submission endpoint and logs a mixed-content
warning. It also creates a fragile UX because submitting depends on the
visitor's local mail client.

### Fix

Replaced the fake mailto form with a non-submitting contact card and explicit
`mailto:` links using `siteConfig.contactEmail`.

### Regression Coverage

- `apps/web/src/components/shared-copy-source.test.ts`

The regression test was confirmed red before the fix and green after the fix:

- `pnpm --filter @boardstack/web exec vitest run src/components/shared-copy-source.test.ts -t "does not submit the contact page through a mailto form action"`

### Production Recheck

After Cloudflare OAuth was refreshed, `pnpm run deploy:web` deployed Worker
`boardstack-web` and verified live commit `e55cd86`.

A direct production fetch of `https://gavelhouse.app/contact/` confirmed:

- the page no longer contains `action="mailto:`;
- the page serves the replacement contact card markup.

## Marketing Crawl Notes

- Sitemap index returned successfully.
- 403 unique public URLs were crawled on desktop and mobile.
- All crawled page navigations returned 200.
- No horizontal overflow was detected.
- The only first-party browser warning was BUG-01.
- Cloudflare RUM requests repeatedly appeared as aborted during rapid crawling;
  these matched prior telemetry noise and were not treated as product defects.

## App QA Notes

Unauthenticated route checks:

- `/dashboard`, `/finance/accounts`, and `/settings` redirected to login with
  preserved redirect parameters.
- `/login`, `/signup`, `/forgot-password`, and `/owner` rendered without
  console errors.

Authenticated owner route checks:

- Opened dashboard, settings, billing, help, finance, banking, reports,
  governance, close, portfolio, and owner routes.
- No checked route emitted console errors.
- No checked route produced first-party 4xx/5xx network responses during page
  load.
- Starter trial gated routes showed upgrade states for Growth/Scale features.

Representative artifacts:

- `output/playwright/prod-e2e-bug-hunt-2026-05-07/app-auth-dashboard-after-login.png`
- `output/playwright/prod-e2e-bug-hunt-2026-05-07/app-auth-settings.png`
- `output/playwright/prod-e2e-bug-hunt-2026-05-07/app-auth-billing.png`
- `output/playwright/prod-e2e-bug-hunt-2026-05-07/app-auth-governance-homeowners.png`
- `output/playwright/prod-e2e-bug-hunt-2026-05-07/app-auth-reports-audit-pack.png`
- `output/playwright/prod-e2e-bug-hunt-2026-05-07/app-auth-sweep-results.json`

## API QA Notes

Expected responses observed:

- `GET /health`: 200
- `GET /api/health`: 200
- `GET /api/auth/providers`: 200
- Unauthenticated app API reads: 401
- Authenticated `GET /communities/me`: 200
- Authenticated feature reads with valid `communityId`: 200 where available
- Missing `communityId`: 400 validation responses
- Cross-community `communityId`: 403
- Starter trial Scale-only close endpoint: 403 `upgrade_required`
- Malformed feedback body: 400 validation response

## Access Gaps

- Inbox access was not available, so password reset, invite delivery,
  unsubscribe-click delivery headers, and email authentication headers were not
  verified directly.
- Only the dedicated QA owner account had a password in `.env`; role email
  variables were present but not sufficient for independent role logins in this
  pass.
- Payment entry was intentionally skipped.

## Verification Log

- 2026-05-07: `git pull` on `master` returned already up to date.
- 2026-05-07: Worktree created at
  `.claude/worktrees/prod-e2e-bug-hunt-2026-05-07`.
- 2026-05-07: Baseline `pnpm run typecheck` passed.
- 2026-05-07: Playwright CLI opened and snapshotted production marketing and
  app pages.
- 2026-05-07: Production sweep wrote `qa-results.json`.
- 2026-05-07: Authenticated app/API sweep wrote
  `app-auth-sweep-results.json`.
- 2026-05-07: BUG-01 regression test failed before the fix and passed after the
  fix.
- 2026-05-07: Merged and pushed `0c3869d` to `origin/master`.
- 2026-05-07: `pnpm run deploy:web` was attempted and blocked by missing
  Cloudflare Wrangler authentication.
- 2026-05-07: Direct production fetch confirmed `/contact/` still serves the
  pre-deploy `mailto:` form action.
- 2026-05-07: Cloudflare OAuth was refreshed with `npx wrangler login`.
- 2026-05-07: Pushed report update `e55cd86` to `origin/master`.
- 2026-05-07: `pnpm run deploy:web` deployed `boardstack-web`; deploy verifier
  confirmed live commit `e55cd86`.
- 2026-05-07: Direct production fetch confirmed `/contact/` no longer serves a
  `mailto:` form action and includes the contact card.
