# Gavelhouse Focused Production E2E QA Report

Date: 2026-05-06

Artifacts: `output/playwright/e2e-production-focused-deep-2026-05-06/`

## Scope

- Marketing site: `https://gavelhouse.app`
- Dashboard app: `https://my.gavelhouse.app`
- API origin observed through dashboard traffic: `https://api.gavelhouse.app`
- QA data: existing `LIVE_E2E_*` accounts from the local gitignored `.env`

## Production Checks Run

- Desktop Chrome marketing homepage loaded and rendered expected Gavelhouse
  public content.
- Owner QA account signed in and reached the dashboard.
- Secretary QA account signed in and reached the same QA community.
- Secretary account could expand the Reports navigation and see report links.
- Secretary direct navigation to Trial Balance was blocked by the current
  below-Scale tier gate before a report API request fired.

## Confirmed Bugs

### B1: Report navigation was visible to non-finance roles

Status: fixed locally

Evidence:

- Production secretary session showed Balance Sheet, Income Statement, Trial
  Balance, General Ledger, and Audit Pack links in the sidebar.
- Local code inspection confirmed sidebar gating only checked plan tier.

Expected:

- Report UI should be visible only to finance report roles: owner, admin, and
  treasurer.

Fix:

- Added shared `report:read` and `report:export` capabilities.
- Dashboard report links are hidden for roles without the matching capability.
- Direct report routes render access denied before mounting report content.

### B2: Report API routes allowed secretary/viewer members

Status: fixed locally

Evidence:

- Local route review found JSON report routes checked membership and tier but
  not role.
- Audit pack and role handoff checked tier before membership, which could
  reveal plan status to nonmembers.
- Close audit pack URL allowed any member to download completed audit packs.

Expected:

- Owner, admin, and treasurer can read/export reports on Scale+.
- Secretary and viewer receive `403 Forbidden`.
- Auth, membership, and role checks run before tier checks.

Fix:

- JSON report routes require `report:read` before tier checks.
- Audit pack and role handoff require `report:export` before strict Scale tier
  checks.
- Close audit pack URL requires `report:export`.

## Blocked Or Limited Checks

- The existing QA community is below Scale, so production could not confirm
  secretary/viewer report API access against Scale data before deployment.
- Inbox receipt checks were not performed because no local inbox credentials
  were present beyond the existing QA account variables.
- Owner portal token and invitation edge-case checks were not changed in this
  pass because the reproducible defects found were in report authorization.

## Regression Coverage Added

- Shared role policy for `report:read` and `report:export`.
- API report role denial and membership-before-tier ordering for Trial Balance,
  Audit Pack, and Role Handoff.
- Close audit pack URL denial for viewer.
- Dashboard access-denied gate for report routes.
