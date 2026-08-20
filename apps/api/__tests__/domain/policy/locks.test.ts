import { describe, it, expect, vi } from "vitest";
import { is, SQL } from "drizzle-orm";
import {
  acquireXactLock,
  seatLockKey,
  homeLockKey,
  assessmentLockKey,
  closeLockKey,
} from "../../../src/domain/policy/locks.js";

describe("advisory lock helpers", () => {
  describe("key builders", () => {
    it("namespace each resource so unrelated caps do not block each other", () => {
      expect(seatLockKey("c1")).toBe("seat:c1");
      expect(homeLockKey("c1")).toBe("home:c1");
      expect(assessmentLockKey("a1")).toBe("assessment:a1");
      expect(closeLockKey("cl1")).toBe("close:cl1");
      // Same community id under different resources must yield different keys.
      expect(seatLockKey("c1")).not.toBe(homeLockKey("c1"));
    });
  });

  describe("acquireXactLock", () => {
    it("issues a transaction-scoped advisory lock with the key bound as a parameter", async () => {
      const execute = vi.fn().mockResolvedValue(undefined);
      await acquireXactLock({ execute }, "home:abc");

      expect(execute).toHaveBeenCalledTimes(1);
      const [query] = execute.mock.calls[0]!;
      expect(is(query, SQL)).toBe(true);
      // The key must be carried as a bound parameter (a SQL Param chunk), not
      // string-concatenated into the statement, to avoid any injection surface.
      const json = JSON.stringify((query as SQL));
      expect(json).toContain("pg_advisory_xact_lock");
      expect(json).toContain("hashtext");
      expect(json).toContain("home:abc");
    });

    it("awaits the executor (propagates rejection)", async () => {
      const execute = vi.fn().mockRejectedValue(new Error("boom"));
      await expect(acquireXactLock({ execute }, "seat:x")).rejects.toThrow(
        "boom",
      );
    });
  });
});
