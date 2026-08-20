import { sql, type SQL } from "drizzle-orm";

/**
 * Minimal structural type for anything that can run a raw SQL statement — both
 * the top-level Drizzle client and a transaction handle satisfy this. Kept
 * local so the helper does not couple to a specific Drizzle generic.
 */
export interface SqlExecutor {
  execute(query: SQL): Promise<unknown>;
}

/**
 * Acquire a transaction-scoped Postgres advisory lock keyed on an arbitrary
 * string. The lock is held until the surrounding transaction commits or rolls
 * back, serializing every holder of the same key.
 *
 * MUST be called as the first write inside a `db.transaction(...)`. Outside a
 * transaction `pg_advisory_xact_lock` would acquire and release within the same
 * implicit single-statement transaction, providing no protection across the
 * subsequent count-then-insert. The key is bound as a parameter and hashed to a
 * 32-bit lock id via `hashtext`; hash collisions only cause two unrelated keys
 * to share a lock (extra serialization), never a missed lock.
 */
export async function acquireXactLock(
  tx: SqlExecutor,
  key: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`,
  );
}

/**
 * INVARIANT: a single transaction must acquire AT MOST ONE of these locks.
 * Every current caller takes exactly one (seat OR home OR assessment), so no
 * lock-ordering deadlock is possible. If a future transaction ever needs two of
 * them, acquire them in a fixed global order (seat < home < assessment) across
 * every call site, or it can deadlock against a sibling taking them in reverse.
 */

/** Lock namespace for the per-community board-user (seat) cap. */
export const seatLockKey = (communityId: string): string =>
  `seat:${communityId}`;

/**
 * Lock namespace for the per-community home cap. The cap counts the `units`
 * table (one row per home), so this serializes all `units` writers for the
 * community even though the key is named "home".
 */
export const homeLockKey = (communityId: string): string =>
  `home:${communityId}`;

/** Lock namespace for the per-assessment dues payment ledger. */
export const assessmentLockKey = (assessmentId: string): string =>
  `assessment:${assessmentId}`;

/**
 * Lock namespace for completing a single month-end close. Serializes the
 * status-recheck → audit-pack-build → R2-upload → status-flip sequence so two
 * concurrent /complete calls cannot both build and upload an audit pack
 * (orphaning one R2 object) or both emit `close_completed`.
 */
export const closeLockKey = (closeId: string): string => `close:${closeId}`;
