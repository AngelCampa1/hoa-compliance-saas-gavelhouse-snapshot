# Engineering log

Gavelhouse had no separate QA team, so the record of what actually went wrong lives in dated
review documents and bug reports rather than in a single retrospective. This file pulls the
specific, dated incidents out of that record: a bug found and what it revealed, a defect class
that recurred, a decision forced by something breaking. It is not a second copy of
[`ARCHITECTURE.md`](./ARCHITECTURE.md); nothing here explains what the system is, only what
happened while building it. Every entry cites the source document it came from, unedited, under
[`docs/engineering/qa-history/`](../docs/engineering/qa-history/).

## 2026-04-16: a review catches a cross-tenant billing bypass a day before merge

Phase 1's code review
([`phase-1-review.md`](../docs/engineering/qa-history/phase-1-review.md)) found that
`POST /billing/checkout` and `POST /billing/portal` authenticated the session but never checked
that the calling user actually belonged to the `communityId` in the request body: any signed-in
user who guessed or was handed another community's ID could open a Stripe billing portal or start
a checkout session for it. The route looked up the subscription by `communityId` alone and never
joined `communityMembers` to confirm membership. Marked CRITICAL, required fixed before merge, and
fixed the same review cycle by adding the membership check other routes already had. The same
review flagged a second issue in the same file family: the `user.create.after` database hook ran
four sequential inserts (community, membership, subscription, activation row) with no wrapping
transaction, so a mid-sequence crash would leave a user half-initialized. Both fixes shipped before
Phase 2 started.

## 2026-04-16: the `journalLines` gap that becomes a permanent code comment

Phase 2's review
([`phase-2-review.md`](../docs/engineering/qa-history/phase-2-review.md)) found the accounting
core sound ("the core accounting invariants are correctly implemented") but flagged
`GET /finance/journal`'s inner query as filtering `journalLines` by `entryId` alone, with no
`communityId` predicate. Because `entryId` is a globally unique nanoid, nothing was practically
exploitable, but the query didn't enforce the tenancy boundary at the layer that actually reads
the ledger. Logged as MAJOR-2. The fix added the `communityId` filter directly, then went further:
today, [`trialBalance.ts`](../apps/api/src/domain/reporting/trialBalance.ts),
[`incomeStatement.ts`](../apps/api/src/domain/reporting/incomeStatement.ts), and
[`generalLedger.ts`](../apps/api/src/domain/reporting/generalLedger.ts) each carry the identical
predicate with the same trailing comment, `// MAJOR-2 guard`, at every place `journalLines` is
queried directly. A defect found once in one route is defended against regressing at three call
sites independently, rather than trusted to a single check upstream. The same review flagged a
sibling idempotency gap in the Stripe dues webhook (MAJOR-1: a duplicate `payment_intent.succeeded`
delivery could insert a second payment and a second journal entry, because `payments` had no unique
constraint on `stripe_payment_intent_id`): the earlier, cruder version of the problem that
[`CONCURRENCY-AND-IDEMPOTENCY.md`](./CONCURRENCY-AND-IDEMPOTENCY.md) describes today's
`processedStripeEvents` ledger table solving.

## 2026-04-17: the same defect class, twice more, caught before shipping the reporting tier

Phase 4's review
([`phase-4-review.md`](../docs/engineering/qa-history/phase-4-review.md), run with 948 tests
passing) found two more instances of the MAJOR-2 pattern, this time as `UPDATE` statements rather
than reads: the bank-reconciliation finalize handler updated `reconciliations` filtered only by
`id`, and the month-end-close checklist-step handler updated `closeChecklistItems` filtered only by
`closeId` and `step`. Neither included `communityId` in the `WHERE`. Both are nanoid-keyed rows,
so exploitability was again low, but both violated the same tenant-isolation invariant Phase 2 had
already named. Marked CRITICAL, both fixed in the same review cycle by adding the missing
predicate. Two more instances of the identical gap (a statement-line `SELECT` and a
reconciliation-match `SELECT`, both missing a direct `communityId` filter) were caught as
"Important" in the same pass. Five defects of the same shape, found across two separate review
cycles a day apart, is the strongest evidence in this codebase that "every write scoped by
`communityId`" was a rule the author held but a pattern the tooling never enforced structurally.
Each instance had to be caught by a human or an agent reading the query, not by a type system.

## 2026-04-18: a stale closure hides the active community from the dashboard

The April QA pass
([`qa-pass-2026-04.md`](../docs/engineering/qa-history/qa-pass-2026-04.md)) found the community
switcher in the dashboard sidebar permanently stuck on "Select community" instead of showing the
signed-in user's actual community. The cause was a `useState(communities[0]?.community)` call that
captured the initial, still-empty array on the component's first render; the real community list
arrived a moment later over the network, after the state had already been frozen. The fix split the
state into an explicit selection plus a computed fallback that re-derives from the live query result
instead of a value captured once at mount. The same pass separately found that the local dev seed
script's signup requests were missing an `Origin` header, which Better Auth's CSRF guard rejected
with a 403, and the script's own error handling treated any 403 response as "user already exists"
and silently continued, masking the real failure until someone thought to check why seeded accounts
weren't being created.

## 2026-05-06: two live-production bugs found by walking the production site, not staging

The first dated production bug hunt
([`production-bug-reports/e2e-production-bug-report-2026-05-06.md`](../docs/engineering/qa-history/production-bug-reports/e2e-production-bug-report-2026-05-06.md))
walked `gavelhouse.app` itself and found two code-fixable defects. First, every public marketing
page logged `[PostHog.js] PostHog was initialized without a token` to the console, because the
bootstrap script ran unconditionally regardless of whether `PUBLIC_POSTHOG_KEY` was actually set.
Second, and more serious: a Growth-trial community that opened a Scale-only report route directly
(trial balance, income statement, general ledger, balance sheet, or the audit pack) got the report
page's header and controls rendered, followed by the page silently firing report queries that came
back `403`: a tier gate enforced correctly by the sidebar and the API, but not by the route
component itself, so a blank page replaced the upgrade prompt a lower-tier user should have seen.
Both were fixed the same day: `buildPostHogBootstrapScript()` now returns an empty string when no
key is configured, and a `TierUpgradeGate` component wraps every Scale-only report route. Both
fixes were deployed as commit `3ad948c` and reverified live with an isolated Growth-tier QA account
before the report was closed.

## 2026-05-28: a test-environment shortcut that could have disabled every tier gate

A deep audit of `apps/api`
([`defect-inventory-api.md`](../docs/engineering/qa-history/defect-inventory-api.md)) found that
`getCommunityTier` in `domain/policy/access.ts` short-circuited to return the top `"portfolio"`
tier whenever `process.env["VITEST_WORKER_ID"]` was set: a convenience for letting unit tests
exercise Portfolio-tier code paths without seeding a real subscription. The finding was rated
CRITICAL because the check had no boundary beyond the environment variable's presence: a leaky
dev-server hot reload that imported test setup, a forgotten `VITEST_WORKER_ID` in a deployed
Worker's environment, or any other path that caused that variable to exist in production would
have silently disabled every tier gate in the product, including the per-community home and
board-seat limits. It was fixed the next day: commit `b75e844`, part of Wave D in the
fix-tracking log ([`goal-e2e-defect-hunt.md`](../docs/engineering/qa-history/goal-e2e-defect-hunt.md)),
by removing the shortcut entirely and re-wiring roughly 87 route unit tests across nine files to
mock the subscription/tier lookup directly instead of relying on the bypass. Reading
[`apps/api/src/domain/policy/access.ts`](../apps/api/src/domain/policy/access.ts) today confirms
the shortcut is gone, not just that a review once said it was fixed.

## 2026-05-28: a fiduciary record that changed state on page load, not on user action

The same audit wave's dashboard findings
([`defect-inventory-app.md`](../docs/engineering/qa-history/defect-inventory-app.md)) found that
the reserve-study page called `PATCH /finance/reserves/compliance` with
`compliance_acknowledged: true` from a `useEffect` that fired as soon as the page mounted and a
study existed: no click, no confirmation, nothing a board member actually did. A treasurer who
opened the page to look at reserve numbers would be recorded as having acknowledged state-statute
reserve compliance they never affirmatively agreed to, on a field that exists specifically to prove
the board reviewed the number. Fixed the same day (Wave C, commit `bc1f4ba`): the page now requires
an explicit checkbox plus an "Acknowledge" button before the mutation fires, with a success toast on
completion. The same fix wave replaced a related pattern in the dues-batch flow (a
`Promise.all` fan-out of N separate assessment-creation writes with no rollback on partial
failure) with one transactional `POST /finance/assessments/batch` endpoint.

## 2026-05-28: the reviewer catches an authorization gap the bug fix itself introduced

Fixing the `Promise.all` fan-out above (Wave C) meant writing a new batch-create endpoint, and the
mandatory reviewer pass on that same worktree
([`goal-e2e-defect-hunt.md`](../docs/engineering/qa-history/goal-e2e-defect-hunt.md)) caught a
BLOCKER in the replacement: the new batch endpoint skipped the unit-belongs-to-community ownership
check that the original single-assessment-create endpoint enforced. `assessments.unitId` is a
nullable foreign key with no community predicate of its own, so without that check a caller could
submit unit IDs from a different community into their own batch request: an IDOR opened in the
process of fixing an unrelated transaction-safety bug. The check was added before the transaction
began, a rollback test that had been asserting on the wrong condition was rewritten to actually fail
inside the transaction callback, and a dedicated IDOR regression test was added. This is the
concrete instance behind the claim in the root [`README.md`](../README.md#built-with-ai-agents)
that the reviewer gate found real defects rather than rubber-stamping finished work.

## 2026-05-29: a `wrangler.toml` default that made local development indistinguishable from prod

The first live end-to-end Playwright walk against the running local stack
([`e2e-live-walk-findings.md`](../docs/engineering/qa-history/e2e-live-walk-findings.md)) found
every browser-originated API call from `localhost:3060` and `localhost:3061` to `localhost:8060`
blocked by CORS: signup, login, and every authenticated route were unreachable through a browser
in local dev. The root cause: `apps/api/wrangler.toml`'s default `[vars]` block set
`SENTRY_ENVIRONMENT = "production"`, and `buildAllowedOrigins()` checked that variable before
`APP_URL`, so it returned only the two `gavelhouse.app` origins regardless of what `.dev.vars` set
locally. `.dev.vars` overrode `APP_URL` and `BETTER_AUTH_URL` for local use but nobody had also
overridden `SENTRY_ENVIRONMENT`, so the production origin allow-list applied unchanged to a laptop.
Fixed by pinning `--var SENTRY_ENVIRONMENT:development` on the API's `dev` script and repairing the
drifted local `.dev.vars` file: a machine-independent, committable fix rather than a one-off local
workaround. Confirmed as local-dev-only: production CORS was never affected, because the deploy
path never runs the `dev` script and `wrangler.toml` hard-sets the production value for real
deploys.

## 2026-05-31: test fixtures that broke because the calendar kept moving

A session close-out pass
([`goal-e2e-defect-hunt.md`](../docs/engineering/qa-history/goal-e2e-defect-hunt.md)) ran the full
`pnpm run verify` gate and hit six failing tests that were not caused by anything in that session's
diff: confirmed identical at the prior commit, `bf146c1`. All six were "date-bomb" fixtures: five
tests signed a lead-magnet download URL with a fixed 30-day expiry anchored to `2026-05-01`, and one
hardcoded a subscription's `trialEndsAt` as the literal string `2026-05-31`, both of which quietly
expired as soon as the real calendar caught up to the date baked into the fixture. Fixed by
re-anchoring all three fixtures to `Date.now()` at test-run time instead of a fixed calendar date,
in commit `28310c7`. The same close-out session also hit an unrelated deploy failure: the API
deploy for that commit failed at preflight with a Cloudflare authentication error, because the
cached `wrangler` OAuth token had expired and there was no `CLOUDFLARE_API_TOKEN` fallback
configured. It required an interactive `wrangler login` re-auth by the operator to clear, a
concrete instance of the gap [`DEPLOY-PIPELINE.md`](./DEPLOY-PIPELINE.md) documents: the pipeline
verifies the *code* that gets deployed, but nothing in it can complete a deploy on its own if the
credentials it depends on have simply expired. The failure was judged functionally harmless because
the diff between the deployed commit and `HEAD` was test-files-only, so the live Worker bundle was
byte-identical regardless: only the `BUILD_COMMIT` metadata embedded in health checks was stale
until the next successful deploy.

## What isn't dated here

Several sources behind this file don't carry a date at all:
[`recon-01-dashboard-app.md`](../docs/engineering/qa-history/recon-01-dashboard-app.md),
[`recon-02-marketing-web.md`](../docs/engineering/qa-history/recon-02-marketing-web.md), and
[`recon-03-api.md`](../docs/engineering/qa-history/recon-03-api.md) have no date header and are not
referenced above for that reason, even though the defects they found are real and several are
referenced secondhand through the dated reviews that fixed them. Where a review document credited a
fix to a source document with no date of its own, this file cites the dated document that did the
verifying, not the undated one that first found it.
