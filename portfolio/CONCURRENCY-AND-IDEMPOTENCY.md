# Three concurrency problems, three different tools

Three pieces of concurrency handling in this codebase are worth looking at
together, not because they're related in the code, but because they show
the same author picking a different-weight tool for each problem rather than
reaching for one pattern everywhere.

## (a) Stripe webhook idempotency

[`apps/api/src/routes/billing/dues-webhook.ts`](../apps/api/src/routes/billing/dues-webhook.ts)
handles Stripe events that Stripe can and will redeliver: the same
`payment_intent.succeeded` event can arrive twice. The base guard is a
ledger table, [`processedStripeEvents`](../apps/api/src/db/schema/billing.ts),
with `eventId` as the primary key:

```ts
export const processedStripeEvents = pgTable("processed_stripe_events", {
  eventId: text("event_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Every handler branch (`payment_intent.succeeded`, `payment_intent.payment_failed`,
`charge.refunded`, `payment_intent.canceled`) opens with the same shape:
insert the event ID with `.onConflictDoNothing().returning(...)`, and if
`inserted.length === 0`, the event was already processed: short-circuit
inside the same transaction. `onConflictDoNothing` on a primary key is the
conflict primitive doing the actual dedup: two concurrent deliveries racing
to insert the same `eventId` can't both succeed, and the loser's `returning`
comes back empty rather than throwing, so the short-circuit is a normal
control-flow branch, not an exception handler.

That alone isn't sufficient for the `payment_intent.succeeded` path, and the
code says so directly:

```ts
// Idempotency guard — same pattern as payment_failed / charge.refunded /
// payment_intent.canceled below. The earlier `existingPayment.journalEntryId`
// check alone could not stop a CONCURRENT redelivery: under READ COMMITTED
// two in-flight deliveries both read journalEntryId === null and both post
// a journal entry, double-counting the payment. The processed-events PK
// insert serializes them — the second delivery blocks on the first's
// uncommitted row, then sees the conflict and short-circuits.
```

The subtler race this closes: a plain existence check (read `payments` for a
row with this `stripePaymentIntentId`, see if `journalEntryId` is already
set) is a read-then-write, and under Postgres's default `READ COMMITTED`
isolation two concurrent transactions can both read "not yet posted" before
either commits. The `processedStripeEvents` insert is what actually
serializes them: the second transaction's insert blocks on the first
transaction's uncommitted row until it commits or rolls back, at which point
the second sees the conflict and bails, instead of both transactions posting
a duplicate journal entry for the same payment.

The same handler also takes `acquireXactLock(tx, assessmentLockKey(assessmentId))`
as its first statement, before the idempotency insert: a second, coarser
lock scoped to the assessment rather than the event. This is what serializes
the webhook against the _other_ write path for the same assessment: the
dues-payment reservation flow that creates the pending Stripe PaymentIntent
in the first place. Two different code paths write to the same
assessment's payment ledger; the event-ID dedup alone only protects against
redelivery of the _same_ event, not against this handler racing a concurrent
request on the _reservation_ side of the same assessment.

## (b) The KV-backed rate limiter's documented race

[`apps/api/src/lib/rateLimiter.ts`](../apps/api/src/lib/rateLimiter.ts)
is the opposite case: cheap, best-effort protection where the author chose
not to reach for a heavier primitive, and wrote out exactly why in a comment
block above the function rather than leaving the gap silent:

```ts
 * CONCURRENCY NOTE — KV TOCTOU bounded overshoot
 *
 * Cloudflare KV is eventually consistent and does not provide atomic
 * increment primitives. This function therefore has a read-modify-write
 * race: two concurrent requests can both read the same counter value,
 * both pass the `>= maxRequests` check, and both write `current + 1`.
 *
 * Worst-case overshoot: under a burst of C concurrent requests that all
 * arrive within the same KV read-latency window (~20–50 ms), up to C
 * requests may be allowed past the limit before any write is visible to
 * the other reads.  In practice, with `maxRequests = 5` and normal
 * Hyperdrive/KV latencies, the realistic overshoot is ≤ 2× the limit
 * during pathological concurrency (e.g., a DoS burst from one IP).
 *
 * A true atomic fix requires a Durable Object counter.  This repo does
 * not yet have a Durable Object binding; introducing one is deferred to
 * a dedicated infrastructure wave.  The current implementation is
 * intentionally left as-is for the KV path, with this comment
 * documenting the bounded overshoot, so the behaviour is explicit rather
 * than silently broken.
```

The implementation matches the comment exactly: `checkRateLimit` does a
plain `get`, compares `current >= opts.maxRequests`, then `put`s
`current + 1`, with no compare-and-swap or lock between the read and the
write:

```ts
const raw = await store.get(key);
const current = raw !== null ? Number(raw) : 0;

if (current >= opts.maxRequests) {
  return { allowed: false, remaining: 0 };
}

const next = current + 1;
await store.put(key, String(next), { expirationTtl: opts.windowSeconds });
```

The reasoning for deferring a Durable Object is stated as a scope decision,
not a technical impossibility: the repo doesn't have a Durable Object
binding yet, and adding one is "a dedicated infrastructure wave", a
proportionality call, not an oversight. Rate limiting on an auth/invite
endpoint failing open by up to roughly 2x under a concurrent burst is a
degraded defense, not a correctness bug the way double-posting a payment
would be; the cost of getting it exactly right (introducing a whole new
Cloudflare primitive) was judged not worth paying for that risk level. The
comment also notes the in-memory fallback used in local dev and tests has no
such race, because it's single-threaded: the eventual-consistency problem
is specific to KV, not to the rate-limiting logic itself.

## (c) A different-weight tool per problem

Line up the three primitives against what they protect:

- **Postgres advisory lock** (`pg_advisory_xact_lock`, in
  [`apps/api/src/domain/policy/locks.ts`](../apps/api/src/domain/policy/locks.ts)):
  transaction-scoped, strongly consistent, used where a race would corrupt
  financial data: board-seat caps, home caps, the per-assessment payment
  ledger, and the month-end close completion sequence.
- **Postgres unique-constraint conflict** (`onConflictDoNothing` against
  `processedStripeEvents.eventId`): a lighter primitive than an advisory
  lock, used specifically for message-level dedup where the question is
  "have I seen this exact event before," not "is this resource internally
  consistent."
- **KV read-modify-write with a documented bounded race**: the cheapest
  option, used for rate limiting, where the acceptable failure mode is
  "occasionally let a few extra requests through during a burst," not
  "silently corrupt a ledger."

None of the three is a generic "add a lock" reflex applied everywhere. Each
matches the actual cost of getting it wrong for that specific resource, and
in the one case where the chosen tool has a known gap, the gap is written
down with a quantified worst case rather than discovered later during an
incident.
