# Testing

Gavelhouse had no separate QA team, so two things stood in for one: an
automated suite that ran on every commit, and a release-readiness process
(recon passes, defect inventories, phase reviews, and production bug hunts)
that a reviewer subagent carried out and a human read and acted on. Both are
covered here. The raw documents behind the second half live in
[`docs/engineering/qa-history/`](../docs/engineering/qa-history/), kept exactly
as written, including the findings nobody got around to fixing.

## The automated suite

418 test files, at least 6,580 cases (`it(`/`test(` call sites, a static
count that undercounts `it.each` tables; see
[METRICS.md](./METRICS.md#tests) for the exact method). Vitest runs the unit
and integration layer across five workspaces:
[`apps/api`](../apps/api/vitest.config.ts),
[`apps/app`](../apps/app/vitest.config.ts),
[`apps/web`](../apps/web/vitest.config.ts),
[`packages/shared`](../packages/shared/vitest.config.ts), and
[`scripts`](../scripts/vitest.config.ts), and every one of them sets the same
coverage thresholds:

```ts
thresholds: {
  perFile: true,
  lines: 95,
  functions: 95,
  branches: 95,
  statements: 95,
},
```

`perFile: true` is the load-bearing setting. It means a 100%-covered utility
module cannot average out an untested route handler; every tracked file clears
95% on its own or the build fails. Each config excludes a short, commented
list of files where coverage is structurally unreliable rather than actually
untested: Drizzle schema files (declarative table definitions, exercised by
the ORM at query time, not at import time), generated route trees, and a
handful of Shadcn/Radix wrapper components where Windows/Vitest 4 coverage
instrumentation was flaky enough that the exclusion comment names the tool
combination, not just the file.

`pnpm run verify` (the full local gate, since there is no CI on this
snapshot) runs lint, typecheck, a pricing/knowledge-base consistency check, a
guard that scans every tracked text file for hardcoded prices or URLs that
should reference shared constants, the metrics-drift check, an SEO audit,
[`check-no-raw-wrangler`](../scripts/lib/check-no-raw-wrangler.ts), coverage
across all five workspaces, and the repo-tooling suite (268 tests, covering
the scripts under [`scripts/lib/`](../scripts/lib/) at 99.75% statements,
verified by running it as part of this pass).

## Playwright end-to-end

[`apps/app/e2e/`](../apps/app/e2e/) holds two different kinds of spec, and it
matters which is which:

- **Real end-to-end checks**:
  [`ai-cs-widget.spec.ts`](../apps/app/e2e/ai-cs-widget.spec.ts),
  [`crm-feedback-widget.spec.ts`](../apps/app/e2e/crm-feedback-widget.spec.ts),
  [`live-marketing-to-aha.spec.ts`](../apps/app/e2e/live-marketing-to-aha.spec.ts),
  and [`phase4-smoke.spec.ts`](../apps/app/e2e/phase4-smoke.spec.ts) drive a
  running instance of the app through a browser and assert on behavior.
- **Capture specs**:
  [`capture-app.spec.ts`](../apps/app/e2e/capture-app.spec.ts),
  [`capture-flows.spec.ts`](../apps/app/e2e/capture-flows.spec.ts),
  [`capture-states.spec.ts`](../apps/app/e2e/capture-states.spec.ts), and
  [`capture-web.spec.ts`](../apps/app/e2e/capture-web.spec.ts) don't assert
  anything. They walk every route at four viewports and write the PNGs that
  back [`docs/screenshots/`](../docs/screenshots/) and, curated, this
  repository's screenshots.

[`playwright.config.ts`](../apps/app/playwright.config.ts) pins locale,
timezone, and browser language (`en-US` / `America/Chicago`) explicitly: the
comment there explains that `locale` alone doesn't control it, because
Chromium renders native `<input type="date">` placeholders in the browser
process's language, not the page's, so a run on a non-English machine would
otherwise silently produce different-looking dues-form captures.

## The release-readiness process

Solo development means the reviewer, the QA engineer, and the author are the
same person working through the same subagent tooling at different times. The
documents in `docs/engineering/qa-history/` are what that process actually
produced, not a retrospective summary of it:

- **Pre-launch recon**: five passes
  ([`recon-01`](../docs/engineering/qa-history/recon-01-dashboard-app.md)
  through
  [`recon-05`](../docs/engineering/qa-history/recon-05-review.md)) covering
  the dashboard, the marketing site, the API, cross-service wiring, and a
  consolidated review, each mapping what existed against what the product was
  supposed to do before the first production deploy.
- **Defect inventories**: read-only, route-by-route audits of each
  workspace, each finding classified by severity:

  | Workspace | Critical / high / med / low | Total |
  | --- | ---: | ---: |
  | [`apps/api`](../docs/engineering/qa-history/defect-inventory-api.md) | 5 / 13 / 22 / 4 | 44 |
  | [`apps/app`](../docs/engineering/qa-history/defect-inventory-app.md) | 4 / 17 / 24 / 14 | 59 |
  | [`apps/web`](../docs/engineering/qa-history/defect-inventory-web.md) | 4 / 9 / 12 / 7 | 32 |

  135 defects catalogued across the three. The web inventory's header is
  explicit about why it exists: an earlier "lite" audit pass had reported zero
  defects, which the author judged implausible and replaced with a deeper
  pass that found 32.
- **Phase reviews**: a code review at the end of each of the four build
  phases, each with its own verdict. Phase 1's review found one critical
  issue (a billing route with no membership check) and required it fixed
  before merge. Phase 2's found the double-entry commingling invariant itself
  correct ("the core accounting invariants are correctly implemented") but
  flagged three major tenant-isolation and idempotency gaps, one of which
  ([`MAJOR-2`](./ACCOUNTING-ENGINE.md), a `journalLines` query missing a
  `communityId` filter) is the guard referenced throughout the accounting
  code today. Phase 4's review ran with 948 tests passing and found two
  critical tenant-isolation gaps (`UPDATE` statements missing a `communityId`
  predicate), both fixed before merge, both now visible in the review file
  as a specific line number and a specific fix.
- **Verified-fixed follow-up**:
  [`recon-05-review.md`](../docs/engineering/qa-history/recon-05-review.md)
  (2026-05-27) confirms 16 of 18 critical/high findings from the recon passes
  were actually fixed, not just logged: rate limiting on auth endpoints,
  invitation email verification, system-actor attribution on dues payments,
  and report pagination among them.
- **A separate inventory, a separate defect**:
  [`defect-inventory-api.md`](../docs/engineering/qa-history/defect-inventory-api.md)
  is a different audit with its own five criticals. Its first is the sharpest
  in the repo: `getCommunityTier` short-circuited to return the top pricing
  tier whenever `process.env["VITEST_WORKER_ID"]` was set
  (`domain/policy/access.ts:38-40`): every tier gate silently disabled on any
  path where that variable leaked outside a test run. It is gone from
  [`apps/api/src/domain/policy/access.ts`](../apps/api/src/domain/policy/access.ts)
  today, confirmed by reading the current file rather than trusting a review
  that says so.

## Production bug hunts

Six dated reports in
[`production-bug-reports/`](../docs/engineering/qa-history/production-bug-reports/)
from May 2026 record manual Playwright sweeps against the *live* deployment
(not staging), covering marketing, auth, signup, billing, the dashboard shell,
finance, banking, reports, governance, the owner portal, and responsive
checks at desktop and mobile widths. The first found two code-fixable bugs:
PostHog initializing with no token on every public marketing page, and
Scale-tier report routes mounting their UI and firing forbidden API requests
for a Growth-trial community instead of showing an upgrade prompt. Both are
marked fixed and reverified in production in the report itself.
[`e2e-live-walk-findings.md`](../docs/engineering/qa-history/e2e-live-walk-findings.md),
[`goal-e2e-defect-hunt.md`](../docs/engineering/qa-history/goal-e2e-defect-hunt.md),
and [`qa-pass-2026-04.md`](../docs/engineering/qa-history/qa-pass-2026-04.md)
cover earlier passes over the same ground.

[`go-live-checklist.md`](../docs/engineering/qa-history/go-live-checklist.md)
is the gate the first production deploy had to clear: DNS and TLS, email
deliverability, Stripe live mode, database readiness, security hardening,
monitoring, legal content, and a launch-day runbook, each item a checkbox
against the live environment rather than a code change.

## What this doesn't cover

No CI runs any of this: every number above came from a local run during this
pass or from a dated document, not from a badge. `recon-05-review.md` names
its own two unresolved items directly: homeowner CSV import has no
deduplication, and it says so rather than omitting the finding. Phase 3's
review flags the owner portal's token-email delivery as never exercised
end-to-end locally. And the defect inventories are a snapshot of what a
deep-audit subagent found on 2026-05-28: later fixes are recorded in the
phase reviews and bug reports, but the inventories themselves were never
re-run, so a line item marked open there is not proof the issue survived to
shutdown, only that nothing in this tree re-audited it afterward.
