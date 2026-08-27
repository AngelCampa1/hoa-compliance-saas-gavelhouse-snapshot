# Double-entry accounting

Gavelhouse's accounting layer is real double-entry bookkeeping (a journal
of debit/credit lines against a chart of accounts), not a transactions table
with a signed amount column. The reason it's built this way: HOA reserve
funds (money earmarked for roof replacements, repaving, and other capital
work) must stay separate from operating funds (day-to-day dues and
expenses). QuickBooks, the incumbent tool for most self-managed HOAs, has no
structural way to stop the two from commingling. Gavelhouse enforces the
separation in the schema and in the one function that writes to the ledger.

## Chart of accounts and the fund split

[`apps/api/src/db/schema/accounts.ts`](../apps/api/src/db/schema/accounts.ts)
defines an `accounts` table with two enums on every row: `accountType`
(`asset` / `liability` / `equity` / `revenue` / `expense`, the standard
five) and `fundType` (`operating` / `reserve`). Every account belongs to
exactly one fund. [`apps/api/src/domain/accounting/seed.ts`](../apps/api/src/domain/accounting/seed.ts)
seeds 14 default accounts per community (8 operating, 6 reserve) with
parallel pairs like `1000 Operating Checking` / `1500 Reserve Checking` and
`4000 Assessment Revenue — Operating` / `4100 Assessment Revenue — Reserve`.
`seedDefaultChartOfAccounts` is idempotent: it diffs against existing
account codes before inserting, and if a concurrent request wins the race to
seed first, the unique index on `(communityId, code)` throws Postgres
`23505`, which the function catches and treats as a no-op rather than a
failure.

## The single posting path

[`apps/api/src/domain/accounting/postEntry.ts`](../apps/api/src/domain/accounting/postEntry.ts)
is the only function in the application that writes to `journal_entries` /
`journal_lines`. Every dues payment, refund, and adjustment routes through
it. (The one other writer is
[`apps/api/scripts/seed-demo.ts`](../apps/api/scripts/seed-demo.ts), the
local demo-data script added when this repository was published. It inserts
via raw SQL rather than going through the API, so it re-implements the two
invariants below itself: every entry is emitted by a single helper that
writes the same amount to one debit and one credit line, and it throws before
insert if a line's fund does not match its account's.) It validates, in order: at least two lines; every `debitCents`/
`creditCents` value is a non-negative safe integer within Postgres `int32`
range (caught before insert, rather than surfacing as an unhandled overflow
error at the database); and each line has exactly one of debit or credit
greater than zero, never both, never neither.

The invariant that actually enforces fund separation is per-fund balancing,
not just double-entry balancing:

```ts
for (const line of resolvedLines) {
  if (line.fundType === "operating") {
    opDebit += line.debitCents;
    opCredit += line.creditCents;
  } else {
    resDebit += line.debitCents;
    resCredit += line.creditCents;
  }
}

const opBalanced = opDebit === opCredit;
const resBalanced = resDebit === resCredit;

if (!opBalanced || !resBalanced) {
  throw new CommingleError(
    `Operating and reserve funds must balance independently. Entry rejected to prevent commingling. ...`,
  );
}
```

A standard double-entry system only requires total debits to equal total
credits across the whole entry. This requires operating debits to equal
operating credits _and_ reserve debits to equal reserve credits,
independently. A journal entry that tries to move money between the two
funds without an explicit paired contra-entry on each side cannot balance
and gets rejected with a dedicated `CommingleError` before it reaches the
database. Each line's `fundType` is copied server-side from the account it
references rather than taken from client input, so the client can't lie
about which fund a line belongs to. Persistence runs inside `db.transaction`
when the caller supplies one (`postEntry` also accepts a plain client for
callers that already hold their own transaction).

## Four reports, all pure reads

[`apps/api/src/domain/reporting/`](../apps/api/src/domain/reporting/)
holds four report generators, each a read-only query over
`journal_lines`/`journal_entries`/`accounts`, none of them write anything.

- **Trial balance** ([`trialBalance.ts`](../apps/api/src/domain/reporting/trialBalance.ts))
  groups summed debits/credits by account and fund, as of a date, and is the
  shared base query the other three build on.
- **Balance sheet** ([`balanceSheet.ts`](../apps/api/src/domain/reporting/balanceSheet.ts))
  filters the trial balance to asset/liability/equity accounts, applies
  debit-normal vs. credit-normal balance math per account type, and computes
  `operatingNetCents` / `reserveNetCents` as two separate totals rather than
  one combined figure. The report itself keeps the funds visually apart.
- **Income statement** ([`incomeStatement.ts`](../apps/api/src/domain/reporting/incomeStatement.ts))
  runs its own revenue/expense query over a date range and produces
  operating and reserve net figures the same way.
- **General ledger** ([`generalLedger.ts`](../apps/api/src/domain/reporting/generalLedger.ts))
  is paginated and computes a running balance in application code over the
  current page only, the code comments this explicitly: "running balance
  is computed only over the current page; it does not reflect entries on
  preceding pages. Use offset=0 to get a full ledger run." It also orders by
  `journalLines.id` as a tiebreaker after entry date and entry ID, because
  the entry ID alone can't distinguish two lines of the same entry, and an
  unstable sort would make the running balance non-deterministic across
  identical requests.

The three reports that query `journal_lines` directly (trial balance,
income statement, and general ledger) each repeat the same tenant-isolation
condition (`eq(journalLines.communityId, communityId)` alongside the join
through `journalEntries.communityId`), and each instance is flagged in a
comment as a `MAJOR-2 guard`: the marker of a specific defect (a
cross-tenant data leak class) that was found, fixed, and then defended
against regressing at each call site independently instead of trusting one
check upstream. Balance sheet doesn't repeat the guard because it doesn't
query the tables directly: it calls `trialBalance` and reshapes the
result.

### The balance sheet's equity gap

The balance sheet supports `equity` accounts everywhere it matters (the
account-type union, the credit-normal balance math, the section grouping)
but the default chart of accounts in
[`domain/accounting/seed.ts`](../apps/api/src/domain/accounting/seed.ts)
seeds fourteen accounts across asset, liability, revenue, and expense, and
**no equity account at all**. Nothing creates a fund-balance or
retained-earnings account, and nothing closes revenue and expense into one at
period end.

The API layer papers over this correctly: `operatingNetCents` and
`reserveNetCents` are computed as `assets − liabilities − equity` per fund,
which is the fund's net position and the right figure for an HOA to publish.
The dashboard card
([`BalanceSheetCard.tsx`](../apps/app/src/components/reports/BalanceSheetCard.tsx))
does not render those two values. It renders a "Liabilities & Equity" stat
summed from every non-asset row, so with no equity account in the chart that
stat is liabilities only, and it never ties to the Assets stat beside it.

The underlying journal is still balanced: the trial balance shows it directly,
total debits equal total credits, per fund. What's wrong is the balance
sheet's presentation layer on top of a real modelling gap in the chart of
accounts, not the ledger itself. It's called out here, by file and line,
rather than left for a reader to find, because the screenshots in this repo
show it unretouched.

## Month-end close

[`apps/api/src/domain/monthEndClose/checklist.ts`](../apps/api/src/domain/monthEndClose/checklist.ts)
and the `monthEndCloses` / `closeChecklistItems` tables in
[`apps/api/src/db/schema/monthEndClose.ts`](../apps/api/src/db/schema/monthEndClose.ts)
implement a close as a small state machine: a `monthEndCloses` row has a
`closeStatusEnum` of only `open` or `complete`, one-way, no reopening.
`buildChecklistItems` creates five fixed steps per close (`reconcile_bank`,
`review_tb`, `post_adjustments`, `finalize_minutes`, `generate_pack`), and
`allCompleted` gates completion on every item being checked off (an empty
checklist is explicitly _not_ considered complete: `if (items.length === 0)
return false`).

Completing a close builds a ZIP audit pack from the ledger and uploads it to
R2 before flipping status. This is the one write path in the accounting
domain that isn't `postEntry`, and it has its own concurrency problem
(covered below) because "build the pack, upload it, flip the status" is
three separate operations with no single-statement atomicity.

## The advisory locks

[`apps/api/src/domain/policy/locks.ts`](../apps/api/src/domain/policy/locks.ts)
defines one primitive, `acquireXactLock`, wrapping Postgres
`pg_advisory_xact_lock(hashtext(key)::bigint)`: a lock scoped to the
current transaction, released automatically on commit or rollback, keyed by
hashing an arbitrary string to a lock ID. The docstring is explicit about
why it must be the first statement inside `db.transaction(...)`: called
outside a transaction, `pg_advisory_xact_lock` would acquire and release
within its own implicit single-statement transaction and protect nothing
across the subsequent read-then-write.

Four lock namespaces are defined, each closing a specific race:

- **`seatLockKey(communityId)`**: serializes concurrent board-member
  invites/accepts against the same community's board-seat cap, so two
  invites accepted at the same instant can't both pass a count check and
  push the community over its seat limit.
- **`homeLockKey(communityId)`**: the same pattern for the per-community
  home/unit cap; the comment in the source notes it actually serializes all
  writers to the `units` table for a community even though it's named
  "home."
- **`assessmentLockKey(assessmentId)`**: serializes the dues-payment
  reservation path against the Stripe webhook handler for the same
  assessment, closing an over-collection race (detailed in
  [`CONCURRENCY-AND-IDEMPOTENCY.md`](./CONCURRENCY-AND-IDEMPOTENCY.md)).
- **`closeLockKey(closeId)`**: serializes the month-end close completion
  sequence. A code comment in `locks.ts` states its exact purpose: it
  serializes the "status-recheck → audit-pack-build → R2-upload →
  status-flip sequence so two concurrent /complete calls cannot both build
  and upload an audit pack (orphaning one R2 object) or both emit
  `close_completed`." The route re-reads `status` _inside_ the lock before
  doing any work, so the losing concurrent caller sees `status === "complete"`
  and returns a 409 before it builds or uploads anything, not after.

A standing invariant is documented directly above the lock-key exports: any
single transaction may acquire at most one of these four locks. Every
current call site takes exactly one, so no lock-ordering deadlock is
possible today; the comment warns that a future transaction needing two
locks at once must acquire them in a fixed global order (seat, then home,
then assessment) everywhere, or it risks a classic deadlock between two
transactions taking the same two locks in reverse order.
