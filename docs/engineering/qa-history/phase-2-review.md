# Phase 2 Code Review -- True Fund Accounting

**Reviewer:** Code Review Agent
**Date:** 2026-04-16
**Scope:** B1-B7 subsystems merged to `master` since Phase 1 (`d0703e5`)

---

## Verdict: APPROVED WITH MINOR FIXES

The core accounting invariants are correctly implemented and the architecture is sound. There are no critical security holes, but three major issues require fixes before Phase 3 begins. Six minor issues are noted.

---

## Per-Finding List

### CRITICAL

_None._

---

### MAJOR

**[MAJOR-1] Webhook idempotency: duplicate `payment_intent.succeeded` creates a second payment record**

- File: `apps/api/src/routes/billing/dues-webhook.ts`, lines 106-120
- The webhook inserts a new row into `payments` and calls `postEntry` on every `payment_intent.succeeded` event. Stripe guarantees at-least-once delivery, so a retry or duplicate webhook will insert a second payment row and a second journal entry for the same `PaymentIntent`. The `payments` table has no unique constraint on `stripe_payment_intent_id`.
- Fix: Add a `uniqueIndex` on `payments.stripe_payment_intent_id` (non-null values only -- Postgres allows multiple NULLs in a partial unique index). Before inserting, check whether a payment row for this `pi.id` already exists; if so, return `{ received: true }` immediately. A migration is required.

**[MAJOR-2] `GET /finance/journal` -- `journalLines` fetched without a `communityId` filter**

- File: `apps/api/src/routes/finance/journal.ts`, lines 124-143 (the `Promise.all` block)
- The outer `journalEntries` query is correctly filtered by `communityId`. However, the inner `journalLines` query filters only by `entryId`. An `entryId` is a nanoid that is globally unique in practice, so exploitation is unlikely, but the filter is architecturally incorrect and does not enforce the tenancy boundary at the DB layer. The same pattern applies in `GET /finance/journal/:entryId` (lines 197-201).
- Fix: Add `.where(and(eq(journalLines.entryId, entry.id), eq(journalLines.communityId, communityId)))` once `communityId` is added to `journalLines`, OR accept the risk and add a code comment explicitly acknowledging that `entryId` global uniqueness is the sole safeguard. The cleaner fix is to add `communityId` to `journal_lines` via migration and filter on it.

**[MAJOR-3] `POST /finance/assessments` -- activation flip uses bare `update` (silently no-ops if row absent)**

- File: `apps/api/src/routes/finance/dues.ts`, lines 255-263
- The activation flip for `dueBatchConfigured` is a bare `UPDATE ... WHERE communityId = ?`. If no `community_activation` row exists yet, the update silently succeeds with 0 rows affected and the flag is never set. The reserves route (`reserves.ts` lines 104-127) correctly handles this with an upsert (select → update-or-insert). The dues route does not.
- Fix: Mirror the upsert pattern from `reserves.ts`: check whether an activation row exists; if yes, update; if no, insert. Alternatively, ensure `community_activation` is always pre-seeded when a community is created (enforced in the communities route).

---

### MINOR

**[MINOR-1] `fannieMaeCompliant` and `allocationPercent` are always `null`**

- File: `apps/api/src/routes/finance/reserves.ts`, lines 80-81 and 143-144
- Both fields are returned as `null as boolean | null` and `null as number | null` in the summary payload but are never computed. The Fannie Mae 15% allocation threshold is documented in the compliance module. If these fields are surfaced in the dashboard they will always display as unknown.
- Fix: Compute `fannieMaeCompliant` as `allocationPercent >= 15` when `allocationPercent` is available, and compute `allocationPercent` from the reserve balance as a percent of total projected need (which is already calculated as `percentFunded`). Or document explicitly that these are deferred to a future phase and remove the fields from the response to avoid misleading callers.

**[MINOR-2] `assessment.status` update in `payment_intent.succeeded` is not scoped to `communityId`**

- File: `apps/api/src/routes/billing/dues-webhook.ts`, line 117-120
- The final `UPDATE assessments SET status = 'paid'` filters only by `assessments.id`. The `payment_intent.payment_failed` branch (lines 130-138) correctly uses both `id` and `communityId`. Consistency fix: add `eq(assessments.communityId, communityId)` to the `payment_intent.succeeded` update at line 120.

**[MINOR-3] `viewer` role is not explicitly blocked by RBAC documentation, only implicitly**

- Files: `apps/api/src/routes/finance/accounts.ts:21`, `journal.ts:23`, `dues.ts:32`, `reserves.ts:28`
- `WRITE_ROLES = ["owner", "admin", "treasurer"]` correctly excludes `viewer` and `secretary`. The pattern is consistent. However, the `secretary` role is silently blocked on all write routes with no comment explaining the intent. If secretary-role write access is intended in a future phase, the current behavior will surprise developers. Add a one-line comment: `// secretary and viewer are read-only`.

**[MINOR-4] CSV importer does not handle quoted fields**

- File: `apps/api/src/domain/accounting/reserveStudyImport.ts`, line 164
- The CSV parser splits on bare commas (`line.split(",")`) without handling RFC 4180 quoted fields (e.g., `"Roof, Flat",25,5,150000,50000`). A component name containing a comma will corrupt the parse. Real reserve study exports from tools like ReserveAdvisor or Association Reserves commonly contain commas in component names.
- Fix: Replace the naive split with a minimal quoted-field-aware parser, or integrate a lightweight CSV library such as `csv-parse` (browser-safe subset).

**[MINOR-5] `seedDefaultChartOfAccounts` is called on every `GET /finance/accounts` -- no locking**

- File: `apps/api/src/routes/finance/accounts.ts`, lines 52-53
- The seed function checks for existing accounts first (line 108-112 of `seed.ts`) and no-ops if any exist. However, two concurrent `GET /finance/accounts` requests for the same new community will both see zero accounts and both attempt to insert the full default set. The `uniqueIndex` on `(communityId, code)` will cause the second concurrent insert to fail with a `23505` duplicate key error, which will surface as an unhandled 500 to the client.
- Fix: Wrap the seed check-and-insert in a Postgres `INSERT ... ON CONFLICT DO NOTHING` for each row, or use `DO NOTHING` on the unique index, so concurrent seeds are safe. The current transaction does not protect against TOCTOU across connections.

**[MINOR-6] `OR` frequency migration numbering gap: 0003 contains both audit log and journal tables**

- File: `apps/api/migrations/0003_low_mathemanic.sql`
- The audit events table and journal tables are co-located in a single migration. This is not a bug, but it means the audit log's append-only Postgres rules (`no_update_audit_events`, `no_delete_audit_events`) live in the same file as the double-entry ledger tables. A future rollback of journal tables would inadvertently also remove the audit rules. Consider splitting into separate migrations if rollback granularity matters.

---

## Migration Integrity

Migration files `0000-0005` account for:

| File | Content |
|------|---------|
| 0000 | Auth tables, tenancy, subscriptions, `community_activation` |
| 0001 | `ALTER TABLE communities ALTER COLUMN state DROP NOT NULL` |
| 0002 | `accounts` table + `fund_type` / `account_type` enums |
| 0003 | `journal_entries`, `journal_lines`, `audit_events` + append-only Postgres rules |
| 0004 | `reserve_studies`, `reserve_components` |
| 0005 | `assessments`, `homeowners`, `payments`, `unit_ownerships`, `units` + enums |

All 6 expected migrations are present. Migration 0003 correctly contains:

```sql
CREATE RULE no_update_audit_events AS ON UPDATE TO "audit_events" DO INSTEAD NOTHING;
CREATE RULE no_delete_audit_events AS ON DELETE TO "audit_events" DO INSTEAD NOTHING;
```

Migration 0005 creates all 5 dues-related tables (`assessments`, `homeowners`, `payments`, `unit_ownerships`, `units`). Both checks pass.

---

## Focus Area Findings Summary

### 1. Commingling invariant (B2) -- PASS

`postEntry.ts` correctly computes per-fund debits and credits independently and throws `CommingleError` when either fund fails to balance. The invariant fires even when the overall entry balances across both funds (e.g., op-debit=1000, res-credit=1000 correctly throws). `fundType` is sourced from the DB account row, not from the caller. Test coverage in `postEntry.test.ts` is thorough with 9 test cases covering all edge conditions.

### 2. Fund type consistency -- PASS

All three payment paths (manual journal via `/finance/journal`, direct-pay via `/finance/dues/pay`, and Stripe webhook via `/billing/dues-webhook`) derive `fundType` from the account loaded from the DB. No hardcoded fund type values are present. The account lookup in `postEntry` enforces `communityId` scoping, ensuring accounts from another community cannot be used to bypass the fund tagging.

### 3. Tenancy isolation -- MOSTLY PASS (see MAJOR-2)

Every primary entity table query is scoped by `communityId`:
- `accounts` -- scoped in all reads and writes
- `journalEntries` -- scoped in all reads and writes
- `journalLines` -- **not scoped on read** (see MAJOR-2)
- `reserveStudies` -- scoped
- `assessments` -- scoped
- `homeowners` -- scoped
- `units` -- scoped
- `auditEvents` -- `communityId` is required on insert; no direct read endpoint exposed

### 4. Auth + RBAC -- PASS

All finance routes have auth middleware returning 401 for unauthenticated requests. Write roles (`owner`, `admin`, `treasurer`) are consistently enforced on all state-mutating routes. `GET` (read) routes allow any authenticated community member. No route skips the membership check.

### 5. Stripe webhook safety -- MOSTLY PASS (see MAJOR-1, MINOR-2)

Signature verification with `constructEventAsync` occurs before any DB writes. `STRIPE_WEBHOOK_SECRET` is used from env. No DB writes happen on signature failure. Idempotency on repeated delivery is not handled (MAJOR-1). The `payment_intent.succeeded` status update is missing the `communityId` filter (MINOR-2).

### 6. Audit log coverage -- PASS WITH NOTED GAP

The `createAuditMiddleware` is registered at `app.use("/finance/*", ...)` in `index.ts` (line 61), which correctly covers all finance routes. `POST /billing/dues-webhook` is outside `/finance/` and is therefore not audited. This is an **expected and acceptable gap** -- webhook events are identifiable via Stripe's own dashboard and the `payments` table records the `stripePaymentIntentId`. No exemption comment exists in code; consider adding one at the registration point in `index.ts` for future developer clarity.

### 7. Activation flag flips -- MOSTLY PASS (see MAJOR-3)

B3: `reservePopulated` is correctly flipped in `buildSummary` using a proper upsert (check → update or insert). It fires on every `GET /finance/reserves/summary` call when a study exists, not just on `PUT /finance/reserves/study`. This is intentional and correct.

B5: `dueBatchConfigured` flip in `POST /finance/assessments` uses a bare `UPDATE` that silently no-ops if no activation row exists (MAJOR-3).

### 8. Migration integrity -- PASS

All 6 migrations present, correctly ordered, audit-log append-only rules confirmed in 0003, all 5 dues tables confirmed in 0005.

### 9. DRY / code quality -- PASS WITH NOTES

No material duplication between `dues.ts` and `dues-webhook.ts`. Both use account code lookup by `fundType` (`4000`/`4100` for revenue, `1000`/`1500` for cash). The lookup logic is duplicated verbatim across the two files (roughly 20 lines each). This is not a blocking issue at current scale but is a candidate for extraction into a shared helper `lookupFundAccounts(db, communityId, fundType)`. No `any` types were found. No untyped fields detected.

---

## What Was Done Well

- The commingling invariant in `postEntry.ts` is clean, readable, and correctly structured. The error message is informative and includes per-fund totals.
- The `CommingleError` class as a typed discriminant for 422 vs 400 responses in the route layer is a good pattern.
- Fund type is derived entirely from the DB account -- there is no trusted caller input for this field, which is the correct design.
- The `createAuditMiddleware` correctly uses a fire-and-void pattern (`void insertAuditEvent(...)`) so audit failures never block the response.
- The audit log schema enforces append-only at the database rule level (`no_update_audit_events`, `no_delete_audit_events`), not just at the application layer -- this is the right approach.
- The `patchAccountBody` correctly prevents `fundType` and `accountType` mutation after account creation, enforced both at the Zod schema level and with an explicit runtime check.
- State compliance data covers all 50 states + DC with per-state classifications (mandate/disclosure/permissive/silent) and correct 2025 Fannie Mae LL-2026-03 language on the 15% threshold.
- Test coverage is comprehensive for the domain layer. `postEntry.test.ts` tests 9 cases including the fund isolation edge case. `dues-webhook.test.ts` tests 8 cases including both event types and all error/missing-metadata paths.
- The `requireWriteMembership` / `requireReadMembership` helper pattern in `dues.ts` eliminates the inline membership check boilerplate found in the earlier routes.
- The reserve study importer handles both CSV and JSON formats with per-row error accumulation and partial success (207 Multi-Status). Dollar-to-cents conversion is handled transparently for CSV.
