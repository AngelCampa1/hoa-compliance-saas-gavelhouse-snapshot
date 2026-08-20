# Production E2E Focused QA Bug Report - 2026-05-06

**Environment:** production  
**Marketing:** `https://gavelhouse.app`  
**App:** `https://my.gavelhouse.app`  
**API:** `https://api.gavelhouse.app`  
**Artifacts:** `output/playwright/e2e-production-focused-2026-05-06/`  
**QA credentials:** stored only in gitignored `.env` under `LIVE_E2E_*`

## Summary

Focused QA rechecked API health metadata, production login reachability, owner
portal and report/export code paths, and prior Cloudflare project constraints.

One deploy-confidence defect was reproduced and fixed locally:

1. API health endpoints served `commit: "dev"` in production after deploy,
   causing `scripts/deploy-verify.ts` to fail for the API.

No additional production code changes were made for owner portal or report role
behavior during this pass. Those areas need product policy confirmation before
changing behavior: owner portal links are reusable by current design, and Scale
report APIs are tier-gated for community members but are not separately
role-gated.

## BUG-01 - API health metadata serves `dev` after production deploy

**Severity:** Major  
**Status:** Fixed, deployed, and verified in production  
**Area:** API deploy orchestration / release metadata  
**Evidence:** `health-body.json`, Playwright API health screenshot/snapshot

### Steps

1. Open `https://api.gavelhouse.app/health`.
2. Open `https://api.gavelhouse.app/api/health`.
3. Run `pnpm exec tsx scripts/deploy-verify.ts --project api --commit 4e6f67c --timeout 10000`.

### Expected

Health endpoints should expose the deployed git SHA so deployment verification
can confirm the live Worker matches the expected commit.

### Actual

Both health endpoints returned:

```json
{"ok":true,"version":"1","commit":"dev"}
```

Deploy verification failed after four attempts with served commit `dev`.

### Root Cause

The API deploy script injected the commit into a generated Wrangler config and
as an esbuild `--define`, but production was still serving the fallback
placeholder. Dry-run inspection confirmed Wrangler accepts an explicit runtime
`--var BUILD_COMMIT:<sha>` binding and exposes it in the Worker binding list.

### Fix

`scripts/run-deploy-sequence.mjs` now passes `BUILD_COMMIT` through Wrangler's
runtime `--var` flag during API deploys, in addition to the existing generated
config and bundled `globalThis.__BUILD_COMMIT__` define.

### Regression Coverage

- `scripts/run-deploy-sequence.test.ts`

## Focused Findings

- API `/health` and `/api/health` are healthy and expose deployed release
  metadata after deploying the API fix.
- Production login page at `https://my.gavelhouse.app/login` rendered with
  labelled email/password controls and submit actions.
- Direct API sign-in with the saved owner credential block returned an empty
  `500`; protected routes then returned `401`. This was treated as a credential
  or direct-auth probing gap, not a confirmed app bug.
- Owner portal tokens are reusable until expiry in current code. Reuse updates
  `lastUsedAt`; there is no `consumedAt` or token hash column. If portal links
  are intended to be single-use, this is a product/security gap.
- Owner portal token validation rejects missing, invalid, and expired tokens in
  code, and Growth-tier gating is enforced for portal reads.
- Report/export APIs require authentication, community membership, and Scale
  tier, but do not apply a separate role-capability gate. A viewer in a Scale
  community is expected by current code to read/export reports.
- Audit pack and role handoff check tier before membership, unlike the other
  report routes. This can return `upgrade_required` before a plain nonmember
  `403` on below-Scale communities.
- Cloudflare Pages project hygiene was already verified earlier on 2026-05-06:
  `boardstack-web` is the only Gavelhouse production marketing Pages project,
  with `boardstack-app` present for the dashboard.

## Access Gaps

- Inbox access was unavailable, so invitation acceptance, password reset email
  delivery, and unsubscribe-click behavior were not verified.
- The saved `LIVE_E2E_*` role credential block could not be used through direct
  API sign-in in this pass. Role-matrix production route probing remains
  incomplete until credentials are refreshed or UI login can be exercised without
  exposing secrets in command output.
- Backend/database setup was not used to force expired or consumed owner portal
  token states in production.

## Verification Log

- `git pull`: already up to date on `master`.
- `.env` `LIVE_E2E_*` keys were canonicalized to one local block after creating
  an ignored backup; no secret values were printed.
- `pnpm install`: passed in the worktree.
- Baseline `pnpm run typecheck`: passed.
- Baseline `pnpm run test:coverage`: timed out after 10 minutes before this
  scoped fix; narrower verification is listed below.
- Playwright CLI opened `https://api.gavelhouse.app/api/health` and captured the
  `commit:"dev"` response.
- `pnpm exec tsx scripts/deploy-verify.ts --project api --commit 4e6f67c --timeout 10000`: failed as expected before the fix.
- `pnpm exec vitest run --config scripts/vitest.config.ts scripts/run-deploy-sequence-source.test.ts`: failed before the fix with the first source-level regression test.
- `pnpm exec vitest run --config scripts/vitest.config.ts scripts/run-deploy-sequence.test.ts`: passed after replacing the source-level assertion with an executable deploy-orchestrator harness.
- `pnpm run verify`: passed after the final regression test update.
- Dedicated reviewer agents: initial review found untracked files and weak
  source-level test coverage; second review found a Windows-only test shim;
  final review found no P0/P1 issues after fixes.
- `pnpm run deploy:api`: deployed Worker `boardstack-api` and verified live
  commit `f55955f`.
