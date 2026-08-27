# Security

Gavelhouse held real HOA reserve and operating fund balances, took Stripe payments for HOA dues
and subscription billing, and stored homeowner PII (name, email, phone, unit, move-in date). The
documentation standard shared across this author's published repositories treats a security
document as required for any product touching PII, payments, or financial data in this category,
and treats its absence as "a failure, not a stylistic gap." This document consolidates the
security-relevant material that [`ARCHITECTURE.md`](./ARCHITECTURE.md) and
[`AUDIT-LOGGING.md`](./AUDIT-LOGGING.md) already describe piecemeal, verifies it against the
current source, and adds what neither covers: authentication, the payment surface, secrets
handling, and an explicit list of what was never protected.

> [!IMPORTANT]
> Every claim below describes what the code in this tree does, verified by reading the code
> itself.

## Contents

- [Scope: what this product handled](#scope-what-this-product-handled)
- [Multi-tenancy and authorization](#multi-tenancy-and-authorization)
- [Tenant-isolation defects](#tenant-isolation-defects)
- [Authentication and sessions](#authentication-and-sessions)
- [CSRF and the dashboard/API boundary](#csrf-and-the-dashboardapi-boundary)
- [Audit logging](#audit-logging)
- [Payments](#payments)
- [Secrets handling](#secrets-handling)
- [What is not protected](#what-is-not-protected)
- [Further reading](#further-reading)

## Scope: what this product handled

The `homeowners` table
([`apps/api/src/db/schema/dues.ts:47-67`](../apps/api/src/db/schema/dues.ts)) carries first name,
last name, email, phone, move-in date, and a Stripe customer ID per homeowner: none of it
field-level encrypted at the application layer; the only protections are Postgres access control
and the tenancy and role gates described below. The `subscriptions` and `processedStripeEvents`
tables hold Stripe subscription and event IDs but never raw card data (see
[Payments](#payments)). The accounting core (`journalEntries`, `journalLines`, `accounts`) holds
the community's real financial ledger, with reserve and operating funds tagged by `fundType`: see
[`ACCOUNTING-ENGINE.md`](./ACCOUNTING-ENGINE.md) for the commingling invariant itself, which is an
accounting property, not a security one.

## Multi-tenancy and authorization

[`ARCHITECTURE.md`](./ARCHITECTURE.md#multi-tenancy-and-authorization) names three gates that
answer different questions, and this section verifies each against the source rather than
restating the summary.

**Tenancy.** Every tenant-scoped table carries a `communityId` column, and the convention is that
every query filters on it, enforced by review, not by Postgres row-level security. This is the
repo's central invariant: `git grep -c communityId` returns 58 hits in
[`apps/api/src/routes/finance/dues.ts`](../apps/api/src/routes/finance/dues.ts) and 41 in
[`apps/api/src/routes/monthEndClose/closes.ts`](../apps/api/src/routes/monthEndClose/closes.ts)
alone: a convention applied densely, not an occasional afterthought. It was also violated
repeatedly during development; see the next section.

**Role.** [`apps/api/src/domain/policy/access.ts`](../apps/api/src/domain/policy/access.ts)
defines `requireCapability`, `getCommunityMembership`, and related helpers, resolving a caller's
`communityMembers` row and checking it against `ROLE_PERMISSIONS`
([`tiers.ts:76-119`](../packages/shared/src/billing/tiers.ts)): five roles (`owner`,
`admin`, `treasurer`, `secretary`, `viewer`) mapped to eleven capabilities such as `finance:write`
and `governance:write`. In practice most route files don't call the shared `access.ts` helpers for
their write check; they define a local `WRITE_ROLES` array or a local `requireMembership` function
instead: [`journal.ts:29,72`](../apps/api/src/routes/finance/journal.ts) and
[`violations.ts:57-69`](../apps/api/src/routes/governance/violations.ts) are two of several.
Phase 2's review flagged this pattern by name, "the `secretary` role is
silently blocked on all write routes with no comment explaining the intent"
([`phase-2-review.md:58-61`](../docs/engineering/qa-history/phase-2-review.md)), and it is still
true today: role enforcement is correct at every checked call site, but it is duplicated
per-route-file rather than centralized, so a new route can reimplement the check incorrectly with
nothing to catch it structurally.

**Tier.** [`apps/api/src/domain/tier/requireTier.ts`](../apps/api/src/domain/tier/requireTier.ts)
and `requireFeatureTier`/`enforceFeatureTier` in `access.ts` gate features and the per-community
seat and home-unit limits attached to each pricing band
([`apps/api/src/domain/policy/access.ts:154-280`](../apps/api/src/domain/policy/access.ts)).

**Portfolio rollup.** A `portfolios` row groups multiple communities for a management operator.
Access to the rollup requires membership in every community being rolled up: an additional
constraint layered on top of the per-community checks, not a bypass of them
([`ARCHITECTURE.md:233-236`](./ARCHITECTURE.md)).

## Tenant-isolation defects

The `communityId` predicate was missing from a write or read at least six separate times across
two review cycles a day apart (2026-04-16 and 2026-04-17), each caught and fixed in the review
cycle that found it, and none reaching production:

| # | Finding | ID | Lines |
| --- | --- | --- | --- |
| 1 | `journalLines` read filtered by `entryId` only | [MAJOR-2][p2] | 31-35 |
| 2 | Reconciliation-finalize `UPDATE` filtered by `id` only | [C-1][p4] | 28-34 |
| 3 | Close-checklist-step `UPDATE` filtered by `closeId`+`step` only | [C-2][p4] | 36-42 |
| 4 | Statement-line `SELECT` missing a direct filter | [I-2][p4] | 56-62 |
| 5 | Reconciliation-match `SELECT` missing a direct filter | [I-3][p4] | 64-70 |
| 6 | Month-end-close-complete `UPDATE` filtered by `id` only | [I-4][p4] | 72-78 |

[p2]: ../docs/engineering/qa-history/phase-2-review.md
[p4]: ../docs/engineering/qa-history/phase-4-review.md

Finding I-4 is the one worth flagging by name: `phase-4-review.md` labels it "Same class as
C-1/C-2" directly, which is why it belongs in this table.

All six are confirmed present in current source with the missing predicate added: for example
[`reconciliations.ts:67,92,102`](../apps/api/src/routes/bank/reconciliations.ts) now filters
`reconciliations`, `bankStatementLines`, and `reconciliationMatches` directly by `communityId`,
and the reporting layer carries the fix as a standing comment:
[`trialBalance.ts:33`](../apps/api/src/domain/reporting/trialBalance.ts),
[`generalLedger.ts:30`](../apps/api/src/domain/reporting/generalLedger.ts), and
[`incomeStatement.ts:54`](../apps/api/src/domain/reporting/incomeStatement.ts) each carry
`// MAJOR-2 guard` at the exact line that closes finding #1.

> [!NOTE]
> This was recorded as "found five times" until 2026-08-18. Reading [`phase-4-review.md`][p4] in
> full shows a sixth: finding I-4 is explicitly labeled "Same class as C-1/C-2" in that document
> and belongs in the same count. The root [`README.md`](../README.md) and
> [`ENGINEERING-LOG.md`][elog] both now count all six.

[elog]: ./ENGINEERING-LOG.md#2026-04-17-the-same-defect-class-five-more-times-caught-before-shipping-the-reporting-tier

A related but distinct finding belongs in the same family: Phase 1's review found
`POST /billing/checkout` and `POST /billing/portal` checked authentication but never verified the
caller belonged to the `communityId` in the request body: any signed-in user who knew or guessed
another community's ID could open a Stripe billing portal for it
([`phase-1-review.md:24-45`](../docs/engineering/qa-history/phase-1-review.md), fixed the same
review cycle, 2026-04-16). It is a missing membership check rather than a missing row predicate, so
it is not counted in the table above, but it is the same invariant (a caller must be a member of
the community whose data or billing state they are touching), violated a seventh time.

The pattern across all seven: nanoid-keyed rows made each individual instance low-risk in
practice (an attacker would need to guess a globally unique random ID), but none of them was
caught by a type system or a structural check: every one required a human or an agent reading the
query. That is also why the pattern still relies on convention today, per
[Multi-tenancy and authorization](#multi-tenancy-and-authorization) above: no row-level security
was ever added, only more instances of the same manual check.

A test-environment shortcut carried the same class of risk at the tier layer, not the row layer.
`getCommunityTier` in `domain/policy/access.ts` returned the top `"portfolio"` tier whenever
`process.env["VITEST_WORKER_ID"]` was set, with no boundary beyond that variable's presence: a
leaked test-setup import or a stray environment variable in a deployed Worker would have silently
disabled every tier gate, including the per-community home and board-seat limits. The finding is
credited to `defect-inventory-api.md`, which carries no date header of its own; the tracker that
cites it as produced that day
([`goal-e2e-defect-hunt.md:52`](../docs/engineering/qa-history/goal-e2e-defect-hunt.md)) is dated
2026-05-28. It was fixed the next day (commit `b75e844`, Wave D,
[`goal-e2e-defect-hunt.md:139`](../docs/engineering/qa-history/goal-e2e-defect-hunt.md)). Reading
[`apps/api/src/domain/policy/access.ts:32-114`](../apps/api/src/domain/policy/access.ts) today
confirms no environment-variable branch exists anywhere in `getCommunityTier` or
`getCommunityTierResult`: the shortcut is gone, not just documented as fixed.

## Authentication and sessions

Better Auth 1.6.3 ([`apps/api/package.json:27`](../apps/api/package.json)), configured in
[`apps/api/src/lib/auth.ts`](../apps/api/src/lib/auth.ts):

- **Email/password**, minimum length 8, plus **Google OAuth** when
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set: conditionally omitted from the provider list
  otherwise ([`auth.ts:70-84,160-163`](../apps/api/src/lib/auth.ts)).
- **Email verification** is sent on sign-up
  ([`auth.ts:175-213`](../apps/api/src/lib/auth.ts)), but the config does not set
  `requireEmailVerification`, so Better Auth's default applies and sign-in is not blocked pending
  verification.
- **Cross-subdomain cookies** are enabled only when `APP_URL` contains the production brand domain
  (`buildAdvancedOptions`, [`auth.ts:43-55`](../apps/api/src/lib/auth.ts)), so the dashboard
  (`my.gavelhouse.app`) and API (`api.gavelhouse.app`) can share a session cookie in production
  without local dev or a misconfigured deploy inheriting the same scope. Phase 1's review confirmed
  this is dedicated-tested for both the production and localhost branches
  ([`phase-1-review.md:113`](../docs/engineering/qa-history/phase-1-review.md)). Cookie flags
  themselves (`httpOnly`, `secure`, `sameSite`) are not overridden in this file, so whatever Better
  Auth 1.6.3 defaults to is what shipped: this document does not restate those defaults as a repo
  claim, since they live in a dependency, not in this tree.
- **Rate limiting** on `sign-in/email`, `sign-up/email`, and `forget-password`: 5 attempts per
  15-minute window, checked independently by IP (`cf-connecting-ip`, never the spoofable
  `x-forwarded-for`) and by email extracted from the request body
  ([`apps/api/src/routes/auth.ts:8-84`](../apps/api/src/routes/auth.ts)). The limiter itself is
  KV-backed with a documented, bounded race under concurrent bursts: covered in
  [`CONCURRENCY-AND-IDEMPOTENCY.md`][kvrace] rather than repeated here.
- **A second, separate auth scheme** exists for homeowners who are not board members: an
  opaque, 21-character nanoid token (`customAlphabet`, 62-character alphabet,
  [`apps/api/src/lib/nanoid.ts`](../apps/api/src/lib/nanoid.ts)) stored in `ownerPortalSessions`
  with an expiry, sent as `x-owner-token` or a `token` query parameter and checked against the
  database on every request
  ([`ownerPortal.ts:82-110`](../apps/api/src/routes/governance/ownerPortal.ts)). This path is
  deliberately not a Better Auth session (homeowners never get a platform account), and it is
  scoped to a single community per token by design (`sess.communityId` is set on the request
  context and used downstream). `TESTING.md` names this path's weak spot directly: the
  token-email delivery step "was never exercised end-to-end locally"
  ([`TESTING.md:164-165`](./TESTING.md)).
- **Turnstile** guards public marketing forms, not authenticated routes, and fails open outside
  production (so local dev works without a key) and fails closed in production when the secret is
  unset, reporting the misconfiguration to Sentry once per Worker instance rather than silently
  degrading ([`apps/api/src/lib/turnstile.ts:27-62`](../apps/api/src/lib/turnstile.ts)).

## CSRF and the dashboard/API boundary

There is no repo-authored CSRF middleware: Better Auth 1.6.3 ships an origin-check step for
state-changing requests, validated against `trustedOrigins`, and this repo supplies that list via
`buildTrustedOrigins` ([`apps/api/src/lib/auth.ts:57-68`](../apps/api/src/lib/auth.ts)): the
configured `APP_URL`, plus `localhost:3060`/`3061` only when `APP_URL` or `BETTER_AUTH_URL`
doesn't reference the production brand domain. This document does not cite the dependency's
internal implementation, it is not committed to this tree (`node_modules/` is gitignored,
[`.gitignore:2`](../.gitignore)), but the mechanism's existence is corroborated by a real
incident: the April QA pass found the local dev seed script's signup requests missing an `Origin`
header, which "Better Auth's CSRF guard rejected... with a 403"
([`ENGINEERING-LOG.md:73-77`](./ENGINEERING-LOG.md)), and a masked failure mode alongside it: the
seed script treated any 403 as "user already exists" and silently continued.

Above that, every request passes through, in order
([`apps/api/src/index.ts:47-150`](../apps/api/src/index.ts)):

1. **CORS**: origin checked against `buildAllowedOrigins`, which fails closed to the two
   production origins when `SENTRY_ENVIRONMENT === "production"`, regardless of what other env
   bindings say ([`index.ts:49-75`](../apps/api/src/index.ts)). `credentials: true` is set, so this
   allowlist is the actual boundary controlling which origins can send authenticated,
   cookie-bearing requests, not a cosmetic header.
2. **Security response headers**: HSTS (`max-age=31536000; includeSubDomains; preload`),
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a
   `Permissions-Policy` blocking camera/microphone/geolocation
   ([`index.ts:99-115`](../apps/api/src/index.ts)). A comment at the same location states plainly
   that **no `Content-Security-Policy` header exists today**, and documents the constraint any
   future CSP would need to satisfy (allow `crm.ventoralabs.com` for the feedback widget) so the
   gap isn't rediscovered by breaking the widget.
3. **Shutdown gate**: every route except `/health` returns 410 when `GAVELHOUSE_SHUTDOWN` is set,
   which it is in this snapshot's checked-in `wrangler.toml`
   ([`apps/api/src/lib/shutdown.ts`](../apps/api/src/lib/shutdown.ts)).
4. **Per-router session check**: 28 route files call
   `auth.api.getSession({ headers: c.req.raw.headers })` and return 401 on no session before doing
   anything else, rather than relying on one global auth middleware. The audit middleware described
   next sits in front of six of those route groups.

## Audit logging

Fully covered in [`AUDIT-LOGGING.md`](./AUDIT-LOGGING.md); summarized here rather than duplicated.
A single Hono middleware wraps the finance, governance, owner, bank, close, and portfolio route
groups and infers `entityType`, `action`, `entityId`, and `communityId` from the request/response
instead of a per-route call, so a new mutating endpoint under those prefixes is audited without
anyone remembering to add a call. The model's real limits, as that document states them directly:
reads are never audited (only `POST`/`PATCH`/`PUT`/`DELETE`), there is no before/after diff despite
the `diffJson` column existing, the entity-type inference is a string match against URL shape that
can silently drift, and a bulk-create endpoint collapses to a single recorded ID. Audit-insert
failures are swallowed and reported to Sentry rather than blocking the response, so an audit-log
outage degrades to missing rows, never to a broken product.

## Payments

Two independent Stripe surfaces, both webhook-verified the same way:

- **Subscription billing**: `POST /billing/webhook`
  ([`apps/api/src/routes/billing.ts:711-726`](../apps/api/src/routes/billing.ts)) handles
  `checkout.session.completed` and subscription lifecycle events for the pricing tiers.
- **HOA dues collection**: `POST /billing/dues-webhook`
  ([`dues-webhook.ts:22-36`](../apps/api/src/routes/billing/dues-webhook.ts)) handles
  `payment_intent.succeeded`/`.payment_failed`/`.canceled` and `charge.refunded` for individual
  homeowner assessment payments.

Both call `stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET)` against the
raw text body (never the parsed JSON) before any database write, and both return 400 on a
missing or invalid signature without touching the database. Phase 1's review confirmed this
pattern directly: "the raw body (`c.req.text()`) is used rather than the parsed JSON, which is
the correct pattern for HMAC verification"
([`phase-1-review.md:115`](../docs/engineering/qa-history/phase-1-review.md)).

**Idempotency.** Both webhooks share one ledger table, `processedStripeEvents`
([`billing.ts:16-21`](../apps/api/src/db/schema/billing.ts), `eventId` primary key).
Every handler branch inserts the event ID with `.onConflictDoNothing()` inside the same
transaction as its other writes; an empty `returning()` means the event was already processed and
the handler short-circuits. This is not the first version of this guard: Phase 2's review found
the dues webhook had **no** idempotency protection at all (a duplicate `payment_intent.succeeded`
delivery could double-post a payment and a journal entry,
[`phase-2-review.md:25-29`](../docs/engineering/qa-history/phase-2-review.md), MAJOR-1) and Phase
1's review flagged the same gap on the subscription webhook as an accepted, tracked risk rather
than a blocker
([`phase-1-review.md:83-87`](../docs/engineering/qa-history/phase-1-review.md), m-2). The
`processedStripeEvents` table is the fix for both, and the reasoning for why a simple
existence-check wasn't sufficient (a read-then-write race under `READ COMMITTED` isolation that
the primary-key conflict, not the check, actually serializes) is documented in
[`CONCURRENCY-AND-IDEMPOTENCY.md`][stripeidem].
The dues webhook additionally takes a per-assessment advisory lock before the idempotency insert,
closing a second race against the *other* write path for the same assessment (the payment
reservation flow), also detailed there.

**Card data custody.** The owner-portal dues-payment flow (`POST /owner/dues/pay`) creates a
Stripe-hosted Checkout Session in `mode: "payment"`
([`ownerPortal.ts:485-499`](../apps/api/src/routes/governance/ownerPortal.ts)) and returns
`checkoutUrl` to the client; the homeowner enters card details on Stripe's own hosted page,
never Gavelhouse's. Subscription checkout works the same way:
`stripe.checkout.sessions.create` returning a `url`
([`billing.ts:612-624`](../apps/api/src/routes/billing.ts)). A third, separate
endpoint, `POST /finance/dues/pay`, creates a Stripe PaymentIntent directly and returns a
`clientSecret`
([`apps/api/src/routes/finance/dues.ts:639-648`](../apps/api/src/routes/finance/dues.ts)), which is
the pattern for an embedded Stripe Elements form, but no component under
[`apps/app/src/`](../apps/app/src/) was found consuming that `clientSecret`. This document does not
claim that path has a working, verified UI; it is listed as open below rather than assumed safe.

## Secrets handling

[`.env.example`](../.env.example) (86 lines) documents every environment variable the three apps
read, with every value left blank or set to a placeholder: `STRIPE_SECRET_KEY=` with a comment
showing the expected shape (`sk_live_...` or `sk_test_...`), never a real key. The file's own header
states the rule: "NEVER commit a .env file with real secrets"
([`.env.example:1-5`](../.env.example)). `.env`, `.env.*`, and `apps/api/.dev.vars` are all
gitignored, with `.env.example` explicitly un-ignored so the template stays tracked
([`.gitignore:17-19`](../.gitignore)). Runtime secrets for the deployed Worker were set with
`wrangler secret put`, never committed to `wrangler.toml`: the checked-in `[vars]` blocks in
[`apps/api/wrangler.toml`](../apps/api/wrangler.toml) hold only non-secret configuration
(`SENTRY_ENVIRONMENT`, feature flags, a `POSTHOG_KEY` placeholder literally named
`REPLACE_WITH_POSTHOG_PROJECT_KEY`) and comments pointing at the `wrangler secret put` commands for
everything sensitive.

Several code paths **fail closed** rather than silently degrade when a required secret is missing
in production specifically: Turnstile verification (above), the signup-verification email sender
(`RESEND_API_KEY` unset reports to Sentry instead of dropping silently,
[`auth.ts:190-201`](../apps/api/src/lib/auth.ts)), and the CAN-SPAM postal address used in nurture
email footers, which throws rather than shipping a placeholder address
(`COMPANY_POSTAL_ADDRESS`, documented in the repo's `CLAUDE.md`).

A pattern-based scan of every tracked `.ts`, `.tsx`, `.toml`, and `.env*` file in
`apps/`, `packages/`, `scripts/`, `docs/`, and `portfolio/` for live-looking secret formats
(`sk_live_`, long `whsec_`/`re_` values, AWS-style keys, PEM private key headers, credentialed
Postgres URLs) found no real secret literal, only local-dev defaults such as
`postgres://postgres:postgres@127.0.0.1:55460/boardstack_dev` in
[`apps/api/scripts/seed-dev.ts:21`](../apps/api/scripts/seed-dev.ts) and
[`scripts/lib/bootstrap.ts:94`](../scripts/lib/bootstrap.ts), and template values such as
`sk_test_...` in [`apps/api/.dev.vars.example:22-23`](../apps/api/.dev.vars.example). `pk_live_`
and `phc_`-prefixed values, where present, are Stripe's and PostHog's publishable/public keys by
design and are not findings.

## What is not protected

Stated plainly, not implied:

- **No row-level security in Postgres.** Tenancy is enforced entirely by application-layer query
  predicates, verified by review. See [Tenant-isolation defects](#tenant-isolation-defects) for
  how many times that convention was the only thing standing between a request and another
  community's data.
- **No Content-Security-Policy header.** Explicitly absent, explicitly commented as absent, in
  [`apps/api/src/index.ts:109-115`](../apps/api/src/index.ts).
- **Violation-evidence photo retrieval has no confirmed access path in this tree.** Uploads to
  `GOVERNANCE_BUCKET` are authenticated and membership-checked
  ([`violations.ts:395-424`](../apps/api/src/routes/governance/violations.ts)), but no route in
  this codebase reads a photo back out of that bucket: the dashboard's `EvidenceList` component
  only renders the stored filename
  ([`_app.governance.violations.tsx:229-246`](../apps/app/src/routes/_app.governance.violations.tsx)).
  Whatever the read-side access control was meant to be, it isn't verifiable from this tree. The
  audit-pack bucket, by contrast, has a fully gated retrieval route: session, membership, role,
  tier, and a `communityId`-scoped lookup all before the R2 `get`
  ([`closes.ts:441-470`](../apps/api/src/routes/monthEndClose/closes.ts)), so this is not a
  blanket claim about R2 usage, only about this one path.
- **The KV rate limiter has a documented, bounded race** under concurrent bursts: up to
  roughly 2x overshoot on `maxRequests = 5`, a deliberate proportionality call rather than an
  oversight. Detailed in
  [`CONCURRENCY-AND-IDEMPOTENCY.md`][kvrace].
- **No field-level encryption of homeowner PII.** Names, email, and phone in the `homeowners`
  table are plain columns, protected only by the tenancy and role gates above and whatever
  encryption-at-rest the hosting Postgres provider applies outside this tree.
- **Sign-in is not blocked on unverified email**, per
  [Authentication and sessions](#authentication-and-sessions) above:
  `requireEmailVerification` is never set.
- **`/finance/dues/pay`'s client-secret flow has no confirmed consuming UI**: see
  [Payments](#payments). It may be dead code, an in-progress feature, or wired through a path this
  review didn't find; it is not claimed safe either way.
- **Homeowner CSV import has no deduplication** and **the owner-portal invite email's
  token-delivery step was never exercised end-to-end locally**: both named directly in
  [`TESTING.md`](./TESTING.md#what-this-doesnt-cover) rather than left for a reader to find here
  independently.

## Further reading

- [`ARCHITECTURE.md`](./ARCHITECTURE.md): the full request lifecycle and data model this document
  draws its tenancy and authorization claims from.
- [`AUDIT-LOGGING.md`](./AUDIT-LOGGING.md): the audit middleware in full.
- [`CONCURRENCY-AND-IDEMPOTENCY.md`](./CONCURRENCY-AND-IDEMPOTENCY.md): the three concurrency
  primitives referenced above, including both documented races.
- [`ENGINEERING-LOG.md`](./ENGINEERING-LOG.md): the dated incident record this document draws the
  tenant-isolation and tier-bypass history from.
- [`TESTING.md`](./TESTING.md): the release-readiness process that found the defects listed
  above, and the items it names as never fully verified.
- [`docs/engineering/qa-history/`](../docs/engineering/qa-history/): every source document cited
  above, unedited.

[kvrace]: ./CONCURRENCY-AND-IDEMPOTENCY.md#b-the-kv-backed-rate-limiters-documented-race
[stripeidem]: ./CONCURRENCY-AND-IDEMPOTENCY.md#a-stripe-webhook-idempotency
