# API Defect Inventory

Read-only audit of `apps/api/src/{routes,lib,index.ts}`. All findings reference
`apps/api/src/...` paths relative to that root.

## Summary by severity

| Severity | Count |
| -------- | ----- |
| CRITICAL | 5 |
| HIGH     | 13 |
| MED      | 22 |
| LOW      | 4 |

## Top 5 CRITICAL / HIGH for orchestrator triage

1. **[CRITICAL] Tier enforcement disabled under Vitest**: `domain/policy/access.ts:38-40` short-circuits `getCommunityTier` to return `"portfolio"` whenever `process.env["VITEST_WORKER_ID"]` is set. Any code path that reaches the API with that env var (CI, leaky dev-server hot reload that imports test setup, or a forgotten `VITEST_WORKER_ID` in a Worker env) silently disables every tier gate including `assertHomeLimit`/`assertBoardUserLimit`. Replace with explicit DI: pass a tier resolver into routers, override only inside individual unit tests.
2. **[CRITICAL] Dues payment recorded across three non-atomic writes**: `routes/finance/dues.ts:560-593` calls `postEntry`, inserts the `payments` row, and updates the `assessments.status` as three separate top-level statements. A failure between any two leaves the books inconsistent (journal entry posted but assessment still `pending`, or payment row present without journal entry). Wrap all three writes in `db.transaction(...)`.
3. **[CRITICAL] Reserve study upsert deletes components without a transaction**: `routes/finance/reserves.ts:150-223` updates the parent study row, then `DELETE`s existing components, then re-inserts the new ones, with no `db.transaction(...)` wrapper. A connection drop between DELETE and INSERT destroys reserve-study data; the same pattern repeats in the CSV import at `routes/finance/reserves.ts:410-439`.
4. **[CRITICAL] Journal-create endpoint leaks raw error messages and mis-classifies errors**: `routes/finance/journal.ts:89-91` catches all non-`CommingleError` `Error` instances and returns `{ error: err.message }` with status `400`. Drizzle/Hyperdrive/Postgres errors (constraint names, table names, even SQL fragments) are returned to the client, and infra errors are surfaced as `400 Bad Request`. Replace with `captureException` + `buildInternalErrorBody(trackingId)` and a `500` status, following the same pattern used at the bottom of the same handler.
5. **[CRITICAL] Stripe dues webhook misses refunds and cancellations**: `routes/billing/dues-webhook.ts` handles only `payment_intent.succeeded` and `payment_intent.payment_failed`. A refund (`charge.refunded`, `charge.dispute.created`) or a manual cancel (`payment_intent.canceled`) leaves `assessments.status = "paid"` and the journal entry intact, while the homeowner is whole again. Add handlers (or at minimum an idempotent reversal journal entry) for `charge.refunded` and `payment_intent.canceled`.

---

## `apps/api/src/index.ts` and middleware

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| LOW | CORS allowlist hard-codes production origins only | `index.ts` (corsAllowList) | Localhost is allowed only when `SENTRY_ENVIRONMENT !== "production"`, but staging/preview workers running with `SENTRY_ENVIRONMENT="staging"` will allow localhost: fine for now, document the contract. | Move to env-driven allowlist; document expected `SENTRY_ENVIRONMENT` values. |

(No `src/middleware/` directory exists; the audit prompt referenced one: confirmed absent.)

## `routes/auth.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | Rate-limit body read can drift from handler | `auth.ts:35-50` | We `clone()` the request and parse JSON to extract `email` for rate-limit keying. Better Auth then re-reads the original body: works today, but anything that introduces a `c.req.json()` cache in Hono would break the cloned-read invariant. | Add a comment+test asserting the original body is still readable after the middleware. |
| MED | Forget-password rate-limit shares budget with sign-in | `auth.ts:9-13` | All three paths use the same `"auth-ip"` / `"auth-email"` KV namespace, so 5 forget-password attempts also consume the sign-in budget. Likely intentional but undocumented. | Either document or split namespaces per path. |

## `routes/communities.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | Invitation accept membership conflict re-thrown as 500 | invitation accept handler | Inside the transaction a `MEMBERSHIP_EXISTS` is thrown and caught outside, but if any other Drizzle error fires during the txn (e.g. FK violation) the outer `try/catch` returns the raw message via Hono default handler → 500 with stack. | Catch generic errors → `captureException` + 500 body via `buildInternalErrorBody`. |
| LOW | Invitation token length not validated | invitation create | Nanoid token length is fixed in the implementation but no Zod check on accept payload. | Add `z.string().length(32)` validation on accept. |

## `routes/communitiesUsage.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | Feature-probe queries swallow ALL errors | `communitiesUsage.ts:196-205` | The activation-progress probes use `try/catch` blocks that return `0`/`false` on ANY error, hiding real DB outages from observability. | Capture to Sentry with low-severity tag, still return safe default for UI. |
| MED | N+1 probes per request | usage handler | 5-7 separate `SELECT count(*)` round-trips per request. | Combine into a single SQL with `union all` or `count() filter (where ...)`. |

## `routes/finance/accounts.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | `POST /finance/accounts/seed` is effectively dead | `finance/accounts.ts:81` | Seeding also runs on `GET /finance/accounts` (line 55-57) so the dedicated `seed` endpoint is unreachable by any current client and is not in `apps/app/src/lib/api.ts`. | Remove the route or document a single seeding contract. |
| MED | PATCH silently no-ops on cross-community update | `finance/accounts.ts:247-252` | The `update().where(communityId=...)` returns nothing without 404, masking IDOR probes and confusing legitimate edits. | After `update().returning()` check `.length===0` and return 404. |
| LOW | Seed-on-read is non-idempotent under concurrency | `finance/accounts.ts:55-57` | If two requests hit the empty community simultaneously, both may attempt to seed. `onConflictDoNothing` on the unique key saves correctness, but worth verifying coverage of the unique constraint. | Add explicit `ON CONFLICT (community_id, code) DO NOTHING`. |

## `routes/finance/journal.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| CRITICAL | Raw error message leakage + wrong status code | `finance/journal.ts:89-91` | `if (err instanceof Error) return c.json({ error: err.message }, 400)`: leaks DB internals; surfaces 500s as 400s. | Capture to Sentry and return `buildInternalErrorBody(trackingId)` + 500. |
| HIGH | N+1 on journal-list lines fetch | `finance/journal.ts:146-170` | `Promise.all(rows.map(async (entry) => db.select().from(journalLines)...)))` issues one query per entry; default `limit=50` → 51 queries. | Single query: `select journal_lines.* join accounts where entry_id in (...)`, then group in app. |
| MED | List endpoint never enforces write role | `finance/journal.ts:102-122` | Membership check only: but listing all entries is correctly read-only. Treasurer-only listing may be desired since journal entries include reserve postings; product decision. | Confirm intentional; add role check if compliance review demands. |

## `routes/finance/reserves.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| CRITICAL | Study upsert: update→delete→insert not transactional | `finance/reserves.ts:150-223` | Three independent statements. Failure between them leaves orphaned or corrupted components. | Wrap entire upsert in `db.transaction(...)`. |
| CRITICAL | CSV import deletes existing components before insert without txn | `finance/reserves.ts:410-439` | Same pattern: DELETE first, INSERT after. Partial failure wipes data. | Wrap in `db.transaction(...)`. |
| MED | Partial CSV import returns 207 but reports `created` with success body | `finance/reserves.ts:410` | Mixed-success path can silently return non-empty `errors` without surfacing them in `application/json` body shape used by client. | Document the partial-success contract in shared schema; add tests. |

## `routes/finance/dues.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| CRITICAL | Pay/refund flow performs 3 writes without transaction | `finance/dues.ts:560-593` | `postEntry`, `payments.insert`, `assessments.update` are sequential; failure between them desyncs books. | Wrap in `db.transaction(...)`. |
| HIGH | Partial dues payments rejected | `finance/dues.ts:408` | Requires exact `data.amountCents === assessment.amountCents`. Real homeowners pay partial amounts; current path forces "all or none". | Allow partial; recompute `status = "partial"|"paid"` from sum of payments. |
| MED | GET `/finance/units` has no `.limit()` | `finance/dues.ts:96-112` | Unbounded read; with 500-unit Scale tier this can return ~500 rows but with no max guard. | Add pagination. |
| MED | Existing PI lookup ignores status | `finance/dues.ts:459-482` | Reuses any prior `stripePaymentIntentId` for the assessment even if the PI was canceled, leading to dead client_secret returned to UI. | Filter by `status in ('requires_payment_method','requires_action')`. |
| MED | Hard-coded fund→account-code mapping | `finance/dues.ts` (operating=4000/reserve=4100, cash=1000/1500) | If a board renames accounts the dues posting silently breaks; no fallback. | Look up by `accountType`+`fundType` instead of code. |

## `routes/billing.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| HIGH | Webhook throws on unknown `priceId` → Stripe retry storm | `billing.ts` (subscription.updated handler) | Throws inside the txn when a new price/tier rolls out before the API is redeployed; Stripe will retry the event indefinitely. | Catch unknown price → log + return 200 (acknowledge but skip), alert via Sentry. |
| MED | `start-trial` does not idempotency-key the Stripe customer create | `billing.ts` (start-trial) | Two concurrent calls could create two Stripe customers for one community. | Pass `idempotencyKey` of `community-${id}-customer`. |
| MED | Subscription tier mapped both from `priceId` and live `tier` column | `billing.ts` | Two sources of truth for tier. | Centralize in `priceIdToTier`. |

## `routes/billing/dues-webhook.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| CRITICAL | No handler for refunds / cancellations | `dues-webhook.ts` overall | `charge.refunded`, `payment_intent.canceled`, `charge.dispute.created` are silently `received:true`. Refund leaves assessment "paid" and journal entry intact. | Add idempotent reversal entry on refund; mark assessment `refunded`. |
| MED | `payment_intent.payment_failed` has no idempotency key | `dues-webhook.ts:163-181` | Stripe retries the failed event; we redundantly set `status = "past_due"`. Harmless today but if any side-effect (email) is added it will duplicate. | Track failed-event id in `processedStripeEvents` similar to succeeded path. |
| LOW | Memo includes only PI id, not assessment id | `dues-webhook.ts:107` | Audit-pack readability: minor. | Append `assessment ${assessmentId}` to memo. |

## `routes/billing/cancel.ts`

(Clean: Stripe call ordered before DB write; transaction not required because the DB row only stores cancel-pending flag.)

## `routes/activation.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | PATCH silently no-ops if row missing | `activation.ts:118-121` | If `communityActivation` row was never seeded (older communities), PATCH returns 200 but updates nothing. | Use `INSERT ... ON CONFLICT UPDATE` (upsert). |

## `routes/leadMagnet.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | In-memory rate limit is per-colo only | `leadMagnet.ts` | Each Cloudflare colo has its own memory; effective limit = N×per-IP across colos. | Move to KV with same pattern as `routes/auth.ts`. |
| LOW | No CAPTCHA backoff when Turnstile fails-open in dev | `leadMagnet.ts` | Dev bypass is intentional but worth a runtime warning. | Already done at module level via `warnedMissingSecretInProduction`; verify it also triggers on subscribe path. |

## `routes/downloads.ts`

(Clean: signed URL, slug whitelist, expiry check, content-type validated, R2 access scoped.)

## `routes/unsubscribe.ts`

(Clean: preserves `unsubscribedAt` for CAN-SPAM idempotency.)

## `routes/aiCsProxy.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| HIGH | Hardcoded WORKER_ORIGIN points to a personal workers.dev subdomain | `aiCsProxy.ts` (`WORKER_ORIGIN`) | The proxy URL `*.<account>.workers.dev` is bound to the founder's individual Cloudflare account. If that account is suspended/deleted/renamed, the AI-CS feature breaks in production. | Move to `env.AI_CS_WORKER_ORIGIN`, set in wrangler.toml/secret. |
| MED | HMAC signs only timestamp+nonce, not body | `aiCsProxy.ts` (signing) | Verify whether body hash is included in the signature; if not, an attacker who captures one valid request can swap the body within the 5min skew. | Include `sha256(body)` in the signed payload. (verify by re-reading) |

## `routes/aiSdrContext.ts`

(Clean: constant-time HMAC equal, 5min skew, nonce consumption.)

## `routes/feedback.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| LOW | No per-user rate limit | `feedback.ts` | Auth-gated only; a logged-in attacker can flood. | KV per-user limit, 10/hour. |

## `routes/governance/homeowners.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| HIGH | Home-limit race in import | `governance/homeowners.ts:199` | `assertHomeLimit(rowsToInsert.length)` runs **before** the transaction that inserts; two concurrent imports can each pass the check and jointly exceed the tier limit. | Move the check inside the transaction (lock row) or use a per-community advisory lock; alternatively re-check inside the txn. |
| MED | GET homeowners has no pagination | `governance/homeowners.ts:59-118` | Unbounded; Scale tier (500 homes) returns a 500-row payload every read. | Add `limit`+`offset` query params. |
| MED | LEFT JOIN dedup hides duplicate primary ownerships | `governance/homeowners.ts:107-116` | `Map<homeownerId, row>` keeps first row; if data has two `primary=true` ownerships the second is silently dropped without warning. | Enforce uniqueness at DB level via partial unique index; surface in audit. |
| MED | ilike search is unbounded on lastName | `governance/homeowners.ts:74` | `ilike(...%search%)` does a sequential scan on large communities. | Add a `WHERE active` covered index or `pg_trgm`. |

## `routes/governance/violations.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| HIGH | Unbounded upload size on photos | `governance/violations.ts:258` | `c.req.arrayBuffer()` consumes the entire body with no max-size check; DoS / R2 cost attack vector. | Reject when `content-length` > N MB before body read, then double-check post-decode size. |
| HIGH | File extension inferred from client content-type | `governance/violations.ts:273-280` | `ext = baseType.split("/")[1]` allows a `.exe` masquerading as `image/png` to be stored with `.png`. | Determine ext from magic bytes (file signature) instead of header. |
| MED | GET violations has no pagination | `governance/violations.ts:126` | Unbounded list. | Add pagination. |
| LOW | Photo URL signing logic not shared | `governance/violations.ts` | Each route reimplements signed URL helpers. | Extract to `lib/r2SignedUrl.ts`. |

## `routes/governance/archRequests.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| HIGH | Unbounded attachment upload size | `governance/archRequests.ts:232` | Same as violations: `arrayBuffer()` with no limit. | Same fix. |
| HIGH | `attachmentKeys` array updated read-modify-write outside txn | `governance/archRequests.ts:242-247` | Two concurrent uploads to the same request both read the current `[]`, append, then write: the second clobbers the first. | Replace with `attachmentKeys = array_append(attachmentKeys, $1)` via raw SQL, or use a normalized `attachments` table. |
| MED | No content-type allowlist on attachment upload | `governance/archRequests.ts` | Anything goes; PDF, image, ZIP, executable. | Allowlist PDF + common image types. |

## `routes/governance/meetings.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | Vote check-then-insert race | `governance/meetings.ts:226-265` | `SELECT existing vote` then `INSERT`: concurrent dual-tab vote creates two rows. | Rely on unique constraint `(meetingId, motionId, userId)` + `onConflictDoNothing()`. |
| MED | `movedByUserId` / `secondedByUserId` not validated as members | `governance/meetings.ts:187-188` | Caller can set arbitrary user IDs as movers/seconders. | Validate both are members of the community. |
| LOW | Motion text length unbounded | `governance/meetings.ts` (schema) | Could be very long; depends on shared Zod schema bounds. | Add max length in shared schema. |

## `routes/governance/ownerPortal.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | Token compared with `===` (not constant-time) | `governance/ownerPortal.ts` (token verify path) | Plain string equality enables timing attacks for token discovery. With nanoid(48) the search space is huge but the practice is still wrong. | Use a constant-time compare (already exists in `aiSdrContext.ts`). |
| MED | 30-day token TTL is long for unauthenticated access | `governance/ownerPortal.ts` | Owner portal is the only auth path for that homeowner; a stolen link is valid 30 days. | Document risk; consider 7-day default + rotating link button. |
| LOW | No rate limit on pay-dues / token-redeem | `governance/ownerPortal.ts` | A leaked link is enumerable for valid dues attempts at unbounded rate. | KV rate limit per token. |

## `routes/governance/boardTransitions.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | Acknowledge/complete have no idempotency | `governance/boardTransitions.ts:74-79, 118-123` | Re-acknowledging an already-acknowledged transition silently rewrites `updatedAt`. Not a correctness bug, but obscures audit history. | Reject if status already at target. |
| LOW | No tenancy guard on `:id` path before status check | `governance/boardTransitions.ts:49-53` | We fetch the transition row, then check membership against `transition.communityId`. Fine: but means we briefly leak existence of arbitrary IDs (404 vs 403). | Return uniform 404 for both not-found and not-authorized. |

## `routes/bank/statements.ts`

(Mostly clean: `MAX_CSV_BYTES` 10MB enforced, content-type required, txn wraps all inserts.)

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | Loop-style insert of statement lines inside txn | `bank/statements.ts:126-137` | One INSERT per line. For a 12-month statement with 200 lines this is 200 round-trips inside the transaction → holds locks longer. | Batch-insert via `db.insert(...).values([...])`. |

## `routes/bank/reconciliations.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | Matched-amount calculation uses `lines.find()` per match | `bank/reconciliations.ts:351-354` | O(matches × lines). Fine for small sets but worth a `Map`. | Build `Map<lineId, line>` once. |
| MED | No idempotency on duplicate match insert | `bank/reconciliations.ts:205-215` | Caller can POST the same `statementLineId+paymentId` twice and get two rows. | Unique constraint + `onConflictDoNothing()`. |
| LOW | Finalize lacks tier gate | `bank/reconciliations.ts:262-393` | Free-tier communities can finalize reconciliations; verify whether `bank-rec` belongs to a paid tier. | Wrap with `assertFeatureTier` if applicable. |

## `routes/monthEndClose/closes.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | Audit pack PUT to R2 not idempotent on retry | `monthEndClose/closes.ts:313-316` | If the `update()` to set `auditPackKey` fails after the PUT succeeds, the R2 object is orphaned and a retry uploads another copy. | Use deterministic key (e.g. `closeId/audit-pack.zip`) so retries overwrite. |
| MED | Audit pack uploaded before DB commit | `monthEndClose/closes.ts:303-333` | PUT first, then DB update: if DB update fails the orphaned blob remains. | Ordering is acceptable but pair with a cleanup job. |
| LOW | `collectStreamToUint8Array` buffers entire ZIP in memory | `monthEndClose/closes.ts:85-103` | Worker memory limit (~128MB) constrains pack size; large packs fail with OOM rather than a clean error. | Stream directly to R2 via `R2.put(stream)`. |

## `routes/portfolio/portfolios.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | `userHasPortfolioTier` ignores subscriptions with non-portfolio tier | `portfolio/portfolios.ts:26-54` | If user has multiple communities the loop returns true on first match: correct: but the comment "trialing or past_due" should be confirmed against Stripe normalized statuses. | Add unit test for past_due + portfolio. |
| MED | DELETE `/portfolio/:id` not transactional with link check | `portfolio/portfolios.ts:184-200` | Read link count, then delete. Concurrent link insertion races the delete. | `DELETE ... WHERE NOT EXISTS (SELECT 1 FROM portfolio_communities ...)`. |
| LOW | POST link does not verify community is not already in another portfolio | `portfolio/portfolios.ts:272-275` | Same community could be linked to two portfolios; depends on schema unique constraint. | Verify unique index exists on `communityId`. |

## `routes/portfolio/rollup.ts`

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| HIGH | N+1 / fan-out to `getCommunityRollup` per community | `portfolio/rollup.ts:51-58` | `Promise.all` over linked rows; each `getCommunityRollup` likely issues multiple SELECTs. With 50 communities this is dozens of queries plus parallel Hyperdrive load. | Build a single aggregating SQL with `GROUP BY communityId`; cache per request. |
| LOW | No max linked-community count | `portfolio/rollup.ts` | A malicious portfolio owner could link to many communities to fan out load. | Cap at 50 in the link endpoint. |

## `routes/reports/*` (all six)

All six follow the same pattern: session auth → `hasReportCapability` → `requireTier(scale)` → handler. Pattern is clean.

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| MED | `auditPack` route stream writes audit event AFTER stream is returned | `reports/auditPack.ts:60-74` | `await insertAuditEvent` runs before `c.body(stream)`, good: but the stream itself is built **before** the audit event, so a failure during audit insert kills the export. | Reorder: build stream lazily, audit-insert first. |
| MED | `roleHandoff` error string match is fragile | `reports/roleHandoff.ts:58-66` | Compares `error.message === "Role handoff reports are supported only..."` to detect a 422-class error. A copy edit in the domain layer breaks the route. | Throw a named error subclass (like `CommingleError`). |
| MED | `generalLedger` route does not validate `accountId` belongs to community | `reports/generalLedger.ts:51-62` | `accountId` from query goes straight to `generalLedger(db, communityId, ..., accountId)`. Likely the domain function filters by community, but the route does not double-check; if an attacker guesses an accountId from another tenant the domain layer is the only guard. | Pre-validate accountId ∈ community before invoking. |

## `lib/` audit

| Sev | Title | Location | What's wrong | Fix |
| --- | ----- | -------- | ------------ | --- |
| HIGH | KV rate limiter has read-modify-write TOCTOU | `lib/rateLimiter.ts:77-87` | `await store.get(key); ... await store.put(key, String(current+1))`: under burst load, two parallel calls both see `current=4` and write `5`, both allowed; effective limit can be 2× target. | Use atomic counter primitive (Durable Object) or accept 10-20% overshoot but document the bound. |
| MED | Lead magnet signature uses `===` (non-constant-time) | `lib/leadMagnetDownloads.ts:115` | `expected === input.signature` enables timing attack on signature discovery. Practical attack is hard but the standard says: use constant-time. | Use byte-by-byte XOR equal in constant time. |
| MED | Lead magnet TTL is 30 days | `lib/leadMagnetDownloads.ts:5` | A single signed URL is valid for a month. If an email forwards leak, anyone can re-download. | Shorter TTL (7 days) + per-download revocation table. |
| MED | `unsubscribeSequencerContact` swallows non-2xx response in caller | `lib/sequencer.ts:52-60` | `callSequencer` throws on non-OK; callers in `auth.ts`/`leadMagnet.ts` likely catch: confirm; if not caught, Better Auth `create.after` will fail user creation when Sequencer is down. | Wrap Sequencer enroll in `try/catch` at the call site (auth `create.after` hook). |
| MED | Stripe mock detection uses literal `"sk_test_DUMMY"` | `lib/stripe-client.ts:106, 169` | A real test-mode key starting with `sk_test_` would fall through to real Stripe: fine: but a typo in env (`sk_test_DUMMY1`) silently uses real client and bills nothing in tests. | Detect by `env.STRIPE_SECRET_KEY === MOCK_KEY` is correct; consider also `env.NODE_ENV !== "production"` guard. |
| MED | `captureEvent` PostHog payload missing `event.uuid` | `lib/observability.ts:87-95` | PostHog newer endpoints require a `uuid` for deduplication on retries: without it, retried events double-count. | Add `uuid: crypto.randomUUID()` to properties. |
| LOW | `initSentry` does not pass `tracesSampleRate` | `lib/observability.ts:18-26` | Tracing disabled by default unless wrapped by SDK defaults; intentional. | Document. |
| LOW | `verifyTurnstile` module-level warned-latch is global | `lib/turnstile.ts:13` | Across all Worker isolates the latch is per-instance; warning is reported on first request per isolate. Acceptable. | None. |

## Cross-cutting / wiring observations

- **Audit middleware mounted at `/finance/*`, `/governance/*`, `/owner/*`, `/bank/*`, `/close/*`, `/portfolio/*`**: verified mount in `index.ts`. Reports routes are NOT audit-mounted because they manually call `insertAuditEvent` (good: but means if a new report file forgets to call it, no audit row is created).
- **Hardcoded WORKER_ORIGIN** in `aiCsProxy.ts` is the most operationally fragile production wiring.
- **No `POST /finance/accounts/seed` client caller** exists in `apps/app/src/lib/api.ts`. Dead endpoint confirmed.
- **All routers except `bank/statements.ts`** lack request-body size limits. Statements got `MAX_CSV_BYTES`; violations and archRequests upload endpoints did not: and they accept binary blobs.
- **N+1 patterns** in `routes/finance/journal.ts` (lines per entry) and `routes/portfolio/rollup.ts` (rollup per community) are the two clearest cost bombs.
- **Transactionality regressions** cluster in three files: `routes/finance/reserves.ts`, `routes/finance/dues.ts`, and `routes/governance/archRequests.ts` (attachmentKeys race).
- **Constant-time HMAC compare** is correctly used in `aiSdrContext.ts` but NOT in `lib/leadMagnetDownloads.ts` or `routes/governance/ownerPortal.ts`.

## Suggested triage order

1. CRITICAL × 5 first: tier-bypass (`access.ts`), 3 transactionality fixes (`dues.ts`, `reserves.ts` ×2), error leakage (`journal.ts`), refund webhook (`dues-webhook.ts`).
2. HIGH × 13: rate-limiter TOCTOU, journal/rollup N+1, upload size limits, attachmentKeys race, partial payments, hardcoded AI-CS origin, home-limit race, billing unknown-priceId throw.
3. MED × 22: error-handling polish, missing pagination, idempotency-on-failed events, R2 orphan cleanup, constant-time compares, Stripe customer create idempotency.
4. LOW × 4: rate limits on feedback / owner portal token, CORS contract doc.
