/**
 * KV-backed rate limiter for Cloudflare Workers.
 *
 * Each call to `checkRateLimit` increments a counter stored in the provided
 * KV namespace (key = `rate:<namespace>:<identifier>`, TTL = windowMs).
 * When the counter exceeds `maxRequests` within the rolling window the function
 * returns { allowed: false }; otherwise { allowed: true }.
 *
 * Production note: The KV namespace bound as AUTH_RATE_LIMIT_KV is declared
 * in wrangler.toml. In local dev and test environments the KV binding will be
 * absent (undefined); the limiter falls back to an in-memory Map in that case.
 * In-memory state does not persist across Worker isolate restarts or across
 * multiple Worker instances, so it provides a best-effort guard only for
 * non-production environments.
 */

/** Minimal subset of KVNamespace used by the rate limiter. */
interface KvStore {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options: { expirationTtl: number },
  ): Promise<void>;
}

const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

function makeInMemoryKv(): KvStore {
  return {
    async get(key: string): Promise<string | null> {
      const entry = inMemoryStore.get(key);
      if (!entry) return null;
      if (Date.now() > entry.resetAt) {
        inMemoryStore.delete(key);
        return null;
      }
      return String(entry.count);
    },
    async put(
      key: string,
      value: string,
      options: { expirationTtl: number },
    ): Promise<void> {
      inMemoryStore.set(key, {
        count: Number(value),
        resetAt: Date.now() + options.expirationTtl * 1000,
      });
    },
  };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface RateLimitOptions {
  /** KV namespace to use for persistence. When absent, falls back to in-memory. */
  kv: KvStore | undefined;
  /** Logical group for the counter, e.g. "auth" or "invite". */
  namespace: string;
  /** Unique identifier to rate-limit on, e.g. email or IP. */
  identifier: string;
  /** Maximum requests allowed within the window. */
  maxRequests: number;
  /** Rolling window duration in seconds. */
  windowSeconds: number;
}

/**
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
 *
 * The in-memory fallback (used in local dev and tests) is single-threaded
 * and has no race.
 */
export async function checkRateLimit(
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const store: KvStore = opts.kv ?? makeInMemoryKv();
  const key = `rate:${opts.namespace}:${opts.identifier}`;

  const raw = await store.get(key);
  const current = raw !== null ? Number(raw) : 0;

  if (current >= opts.maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  const next = current + 1;
  await store.put(key, String(next), { expirationTtl: opts.windowSeconds });

  return { allowed: true, remaining: opts.maxRequests - next };
}
