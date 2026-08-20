# Production E2E QA Bug Report - 2026-05-07

## Scope

Production QA covered:

- Marketing: `https://gavelhouse.app`
- App: `https://my.gavelhouse.app`
- API: `https://api.gavelhouse.app`

Artifacts were written under
`output/playwright/e2e-production-full-2026-05-07/`, including screenshots and
`qa-results.json`.

Existing `LIVE_E2E_*` credentials from the gitignored root `.env` were used.
The QA account was valid. Its community was still in `pending_trial`, so a
no-card Starter trial was started through the production API/UI flow to enable
dashboard route testing. No checkout or payment details were entered.

## Summary

Marketing desktop/mobile routes loaded without horizontal overflow or
first-party 5xx failures in the sampled pass. Login, protected-route redirect,
trial status, billing, dashboard, finance, banking, reports, governance,
portfolio, help, and API health/public validation surfaces were exercised.

The main confirmed product bug was in app-side tier gates: direct links to
some gated routes rendered the feature page and fired API requests before
showing an upgrade state. On a Starter trial those requests returned 403 and
created repeated console errors.

## Confirmed Bug: Gated Routes Fetch Before Upgrade Gate

Affected project: `app`

Routes:

- `/governance/meetings`
- `/governance/violations`
- `/governance/arch-requests`
- `/close`

Reproduction steps:

1. Sign in to `https://my.gavelhouse.app` with the production QA account.
2. Ensure the active community is on a Starter trial.
3. Navigate directly to each affected route.
4. Open browser console/network.

Expected:

- Routes requiring Growth or Scale should render the existing upgrade state.
- They should not call the gated API endpoint for a plan that cannot use the
  feature.
- Browser console should not show first-party 403 resource errors for normal
  gated navigation.

Actual:

- The route component mounted and called the gated API endpoint.
- Production API returned 403.
- Browser console logged repeated `Failed to load resource` messages.

Artifacts:

- `output/playwright/e2e-production-full-2026-05-07/app-governance-meetings-desktop.png`
- `output/playwright/e2e-production-full-2026-05-07/app-governance-violations-desktop.png`
- `output/playwright/e2e-production-full-2026-05-07/app-governance-arch-requests-desktop.png`
- `output/playwright/e2e-production-full-2026-05-07/app-close-desktop.png`
- `output/playwright/e2e-production-full-2026-05-07/qa-results.json`

Root cause:

- Reports routes already wrap API-backed content in `TierUpgradeGate`.
- Meetings, violations, architectural requests, and month-end close did not.
- Their `useQuery` calls ran as soon as `selectedCommunityId` was available,
  even when `selectedCommunityTier` did not include the route feature.

Fix:

- Added render-level regression coverage for gated route wrappers. The test
  renders each route as a Starter community and asserts the upgrade state
  appears without calling the gated API client.
- Wrapped the affected route content in `TierUpgradeGate`:
  - governance workflows require `governance-workflows`
  - month-end close requires `month-end-close`

Status:

- Fixed, merged, deployed to `boardstack-app`, and verified in production.
- Targeted test passed:
  `pnpm --filter @boardstack/app exec vitest run __tests__/routes/tier-gated-routes.test.tsx __tests__/routes/close.test.tsx`
- Production deploy verified commit `f55e952` on Worker `boardstack-app`.
- Post-deploy Playwright recheck confirmed each route renders the upgrade
  state with zero gated endpoint responses and no first-party page errors.

Post-deploy artifacts:

- `output/playwright/e2e-production-full-2026-05-07/postdeploy-governance-meetings-desktop.png`
- `output/playwright/e2e-production-full-2026-05-07/postdeploy-governance-violations-desktop.png`
- `output/playwright/e2e-production-full-2026-05-07/postdeploy-governance-arch-requests-desktop.png`
- `output/playwright/e2e-production-full-2026-05-07/postdeploy-close-desktop.png`
- `output/playwright/e2e-production-full-2026-05-07/postdeploy-gated-route-recheck.json`

## API Notes

Expected validation/auth responses observed:

- `GET /health` and `GET /api/health`: 200
- `GET /api/auth/providers`: 200
- API feature endpoints without `communityId`: 400 validation errors
- malformed lead magnet subscription body: 400 validation errors

`GET /api/auth/session` returned 404 in the probe. The app uses Better Auth's
client flow successfully, so this was recorded as a probe mismatch rather than
a confirmed product bug.

`POST /feedback` returned 404 in the direct API probe because the route is
mounted as `/api/feedback`; app feedback submission should be tested through
the widget or `/api/feedback`.

## UX Findings

- The gated navigation labels correctly show required tiers in the sidebar.
- Starter trial direct links should now land on an explanatory upgrade state
  rather than partial data surfaces.
- No mobile horizontal overflow was detected on sampled marketing pages.

## Verification Log

- 2026-05-07: production QA pass before fix captured the 403 console behavior.
- 2026-05-07: render-level regression test added and confirmed failing before
  the route wrappers were added.
- 2026-05-07: targeted regression test passed after the fix.
- 2026-05-07: full local verification passed with `pnpm run verify`.
- 2026-05-07: deployed app Worker `boardstack-app`; deploy verification
  confirmed live commit `f55e952`.
- 2026-05-07: post-deploy production Playwright recheck passed for
  `/governance/meetings`, `/governance/violations`,
  `/governance/arch-requests`, and `/close`.
