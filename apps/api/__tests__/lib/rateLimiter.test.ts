import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../../src/lib/rateLimiter.js";

/**
 * Each test uses a unique namespace (via a counter) to avoid state leakage
 * from the module-level in-memory store.
 */
let nsCounter = 0;
function uniqueNs(): string {
  return `test-ns-${++nsCounter}`;
}

describe("checkRateLimit", () => {
  describe("with in-memory fallback (kv = undefined)", () => {
    it("allows the first request and returns correct remaining count", async () => {
      const result = await checkRateLimit({
        kv: undefined,
        namespace: uniqueNs(),
        identifier: "user-1",
        maxRequests: 3,
        windowSeconds: 60,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it("tracks multiple requests and decrements remaining", async () => {
      const opts = {
        kv: undefined as undefined,
        namespace: uniqueNs(),
        identifier: "user-decrement",
        maxRequests: 3,
        windowSeconds: 60,
      };

      const r1 = await checkRateLimit(opts);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = await checkRateLimit(opts);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = await checkRateLimit(opts);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    it("blocks the request when maxRequests is exceeded", async () => {
      const opts = {
        kv: undefined as undefined,
        namespace: uniqueNs(),
        identifier: "user-block",
        maxRequests: 2,
        windowSeconds: 60,
      };

      await checkRateLimit(opts); // 1st
      await checkRateLimit(opts); // 2nd (hits max)

      const blocked = await checkRateLimit(opts); // 3rd — should be blocked
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it("uses separate counters for different namespaces", async () => {
      const ns1 = uniqueNs();
      const ns2 = uniqueNs();
      const base = {
        kv: undefined as undefined,
        identifier: "user-x",
        maxRequests: 1,
        windowSeconds: 60,
      };

      const r1 = await checkRateLimit({ ...base, namespace: ns1 });
      expect(r1.allowed).toBe(true);

      // Same identifier but different namespace — counter is fresh
      const r2 = await checkRateLimit({ ...base, namespace: ns2 });
      expect(r2.allowed).toBe(true);
    });

    it("uses separate counters for different identifiers in the same namespace", async () => {
      const ns = uniqueNs();
      const base = {
        kv: undefined as undefined,
        namespace: ns,
        maxRequests: 1,
        windowSeconds: 60,
      };

      await checkRateLimit({ ...base, identifier: "user-alpha" }); // hits limit for user-alpha

      const r = await checkRateLimit({ ...base, identifier: "user-beta" }); // different identifier
      expect(r.allowed).toBe(true);
    });
  });

  describe("with a KV-backed store", () => {
    function makeKvStore(initial: Record<string, string> = {}) {
      const store: Record<string, string> = { ...initial };
      return {
        async get(key: string): Promise<string | null> {
          return store[key] ?? null;
        },
        async put(
          key: string,
          value: string,
          _options: { expirationTtl: number },
        ): Promise<void> {
          store[key] = value;
        },
      };
    }

    it("allows the first request when KV is empty", async () => {
      const kv = makeKvStore();
      const result = await checkRateLimit({
        kv,
        namespace: "auth",
        identifier: "ip-1",
        maxRequests: 5,
        windowSeconds: 900,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("blocks requests when counter equals maxRequests", async () => {
      // Pre-seed KV with a counter already at max
      const kv = makeKvStore({ "rate:auth:ip-at-limit": "5" });
      const result = await checkRateLimit({
        kv,
        namespace: "auth",
        identifier: "ip-at-limit",
        maxRequests: 5,
        windowSeconds: 900,
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("increments counter on each allowed request", async () => {
      const kv = makeKvStore({ "rate:auth:ip-2": "3" });
      const result = await checkRateLimit({
        kv,
        namespace: "auth",
        identifier: "ip-2",
        maxRequests: 5,
        windowSeconds: 900,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1); // was 3, now 4, remaining = 5 - 4
    });

    it("allows request when counter is exactly one below max", async () => {
      const kv = makeKvStore({ "rate:auth:ip-edge": "4" });
      const result = await checkRateLimit({
        kv,
        namespace: "auth",
        identifier: "ip-edge",
        maxRequests: 5,
        windowSeconds: 900,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });

  describe("in-memory store expiry (expired entry)", () => {
    it("treats expired entries as zero count and allows the request", async () => {
      const realNow = Date.now;
      const baseTime = 1_700_000_000_000;
      let mockNow = baseTime;
      Date.now = () => mockNow;

      try {
        const opts = {
          kv: undefined as undefined,
          namespace: uniqueNs(),
          identifier: "user-expiry",
          maxRequests: 1,
          windowSeconds: 10, // 10-second window
        };

        // First request — sets counter to 1 with resetAt = baseTime + 10_000
        const r1 = await checkRateLimit(opts);
        expect(r1.allowed).toBe(true);

        // Second request at the same "time" — should be blocked (counter = 1 = max)
        const r2 = await checkRateLimit(opts);
        expect(r2.allowed).toBe(false);

        // Advance time past the window — entry should be expired and treated as 0
        mockNow = baseTime + 11_000;

        const r3 = await checkRateLimit(opts);
        expect(r3.allowed).toBe(true); // counter reset because entry expired
      } finally {
        Date.now = realNow;
      }
    });
  });
});
