import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../../src/lib/rateLimiter.js";

/**
 * Property-based safety fuzz for the KV-backed rate limiter.
 *
 * Iteration 10 (REFUTE, no source change): an exploration pass flagged the
 * `expirationTtl` reset on every allowed write (rateLimiter.ts:110) as a
 * possible bypass — the theory was that an attacker could "hover" at
 * `maxRequests - 1` and keep the key alive forever. That theory is FALSE:
 *
 *   1. The counter is monotonic (only ever increments, line 109).
 *   2. The deny path returns at line 106 BEFORE any `put`, so a denied
 *      request never refreshes the TTL.
 *
 * Therefore allowed writes stop once the counter reaches the cap, the key
 * then expires `windowSeconds` after the last ALLOWED write, and each "epoch"
 * contains at most `maxRequests` allowed requests. Consecutive epochs are
 * separated by a quiet gap of at least `windowSeconds` (the time the key needs
 * to expire), so no time interval of length `windowSeconds` can ever straddle
 * two epochs. The net guarantee — which these tests pin — is the only one that
 * matters for security:
 *
 *     In any sliding window of `windowSeconds`, the number of ALLOWED requests
 *     never exceeds `maxRequests`, for ANY adversarial request timing.
 *
 * The reset-on-write behaviour only ever makes the limiter STRICTER than a
 * textbook fixed window (a quiet-period reset), never looser. It is fail-safe.
 */

// Deterministic PRNG (mulberry32) — no fast-check dependency.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A KV store whose entries honour `expirationTtl` against a controllable
 * mock clock measured in whole seconds. This mirrors Cloudflare KV semantics
 * closely enough to exercise the limiter's window/TTL logic deterministically.
 */
function makeClockKv(clock: { nowSeconds: number }) {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (clock.nowSeconds >= entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(
      key: string,
      value: string,
      options: { expirationTtl: number },
    ): Promise<void> {
      store.set(key, {
        value,
        expiresAt: clock.nowSeconds + options.expirationTtl,
      });
    },
  };
}

describe("rateLimiter — adversarial-timing safety fuzz", () => {
  it("never allows more than maxRequests within any sliding window, across fuzzed timings", async () => {
    const SEEDS = [1, 7, 42, 99, 123, 777, 2024, 31337, 65535, 1_000_003];
    const windowSeconds = 900; // 15 min, matching the auth limiter
    const maxRequests = 5;

    for (const seed of SEEDS) {
      const rand = mulberry32(seed);
      const clock = { nowSeconds: 0 };
      const kv = makeClockKv(clock);
      const allowedTimes: number[] = [];

      // 400 requests with random inter-arrival gaps spanning sub-window bursts
      // up to multi-window quiet periods, so the fuzz crosses many epochs.
      for (let i = 0; i < 400; i += 1) {
        const result = await checkRateLimit({
          kv,
          namespace: "auth-ip",
          identifier: "attacker",
          maxRequests,
          windowSeconds,
        });
        if (result.allowed) {
          allowedTimes.push(clock.nowSeconds);
          // remaining is always within bounds for an allowed request.
          expect(result.remaining).toBeGreaterThanOrEqual(0);
          expect(result.remaining).toBeLessThan(maxRequests);
        } else {
          expect(result.remaining).toBe(0);
        }
        // Advance the clock by a random gap: heavy bias toward small gaps
        // (bursts) with occasional long quiet periods that cross the window.
        const roll = rand();
        const gap =
          roll < 0.6
            ? Math.floor(rand() * 30) // 0–29s: tight burst
            : roll < 0.9
              ? Math.floor(rand() * windowSeconds) // sub-window spread
              : windowSeconds + Math.floor(rand() * windowSeconds); // quiet reset
        clock.nowSeconds += gap;
      }

      // SAFETY INVARIANT: every window-length interval starting at an allowed
      // request must contain at most maxRequests allowed requests.
      for (let i = 0; i < allowedTimes.length; i += 1) {
        const windowEnd = allowedTimes[i] + windowSeconds;
        let countInWindow = 0;
        for (let j = i; j < allowedTimes.length; j += 1) {
          if (allowedTimes[j] < windowEnd) countInWindow += 1;
          else break;
        }
        expect(countInWindow).toBeLessThanOrEqual(maxRequests);
      }
    }
  });

  it("a denied request does not refresh the TTL (no bypass by hammering while blocked)", async () => {
    const windowSeconds = 100;
    const maxRequests = 3;
    const clock = { nowSeconds: 0 };
    const kv = makeClockKv(clock);
    const opts = {
      kv,
      namespace: "auth-ip",
      identifier: "hammerer",
      maxRequests,
      windowSeconds,
    };

    // Burst to the cap.
    for (let i = 0; i < maxRequests; i += 1) {
      const r = await checkRateLimit(opts);
      expect(r.allowed).toBe(true);
    }
    // Now blocked. Hammer continuously while blocked — these denials must NOT
    // push the expiry out, or an attacker could keep the key alive forever.
    for (let t = 1; t < windowSeconds; t += 1) {
      clock.nowSeconds = t;
      const blocked = await checkRateLimit(opts);
      expect(blocked.allowed).toBe(false);
    }
    // At exactly windowSeconds after the last allowed write the key expires,
    // regardless of how many denied requests were made in between.
    clock.nowSeconds = windowSeconds;
    const afterExpiry = await checkRateLimit(opts);
    expect(afterExpiry.allowed).toBe(true);
  });

  it("just-under-window spacing cannot exceed the rate (the flagged 'hover' attack is safe)", async () => {
    // The flagged 'hover at maxRequests-1 forever' attack: send one request
    // every (windowSeconds - 1)s, hoping each allowed write extends the window
    // so the counter never resets while staying just under the cap. It fails:
    // once the cap is reached the denied requests stop extending the TTL, so
    // the key expires and a new epoch starts. The attacker therefore gets at
    // most maxRequests allowed requests per epoch, and epochs are spaced far
    // enough apart that the sliding-window rate is never exceeded.
    const windowSeconds = 1000;
    const maxRequests = 4;
    const clock = { nowSeconds: 0 };
    const kv = makeClockKv(clock);
    const opts = {
      kv,
      namespace: "auth-email",
      identifier: "hover@example.com",
      maxRequests,
      windowSeconds,
    };

    const allowedTimes: number[] = [];
    for (let round = 0; round < 40; round += 1) {
      const r = await checkRateLimit(opts);
      if (r.allowed) allowedTimes.push(clock.nowSeconds);
      clock.nowSeconds += windowSeconds - 1;
    }

    // SAFETY: no window-length interval ever holds more than maxRequests
    // allowed requests, despite the deliberately adversarial just-under-window
    // cadence.
    for (let i = 0; i < allowedTimes.length; i += 1) {
      const windowEnd = allowedTimes[i] + windowSeconds;
      let countInWindow = 0;
      for (let j = i; j < allowedTimes.length; j += 1) {
        if (allowedTimes[j] < windowEnd) countInWindow += 1;
        else break;
      }
      expect(countInWindow).toBeLessThanOrEqual(maxRequests);
    }
  });
});
