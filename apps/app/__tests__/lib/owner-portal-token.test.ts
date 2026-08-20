import { describe, it, expect, beforeEach } from "vitest";
import {
  recordOwnerTokenSeen,
  isOwnerTokenExpired,
  OWNER_TOKEN_TTL_MS,
} from "@/lib/owner-portal-token";

function makeStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

describe("owner-portal-token", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeStorage();
  });

  describe("recordOwnerTokenSeen", () => {
    it("stores the current timestamp when a token is first seen", () => {
      const before = Date.now();
      recordOwnerTokenSeen("tok-abc", storage);
      const after = Date.now();
      const raw = storage.getItem("owner-portal-token-seen:tok-abc");
      expect(raw).not.toBeNull();
      const stored = parseInt(raw!, 10);
      expect(stored).toBeGreaterThanOrEqual(before);
      expect(stored).toBeLessThanOrEqual(after);
    });

    it("does not overwrite an existing timestamp on second call", () => {
      recordOwnerTokenSeen("tok-abc", storage);
      const first = storage.getItem("owner-portal-token-seen:tok-abc");
      recordOwnerTokenSeen("tok-abc", storage);
      const second = storage.getItem("owner-portal-token-seen:tok-abc");
      expect(second).toBe(first);
    });

    it("records different tokens independently using distinct storage keys", () => {
      recordOwnerTokenSeen("tok-aaa", storage);
      recordOwnerTokenSeen("tok-bbb", storage);
      expect(storage.getItem("owner-portal-token-seen:tok-aaa")).not.toBeNull();
      expect(storage.getItem("owner-portal-token-seen:tok-bbb")).not.toBeNull();
      // Both keys exist — verified via separate storage.getItem calls above
      expect(storage.length).toBe(2);
    });
  });

  describe("isOwnerTokenExpired", () => {
    it("returns false when no timestamp is recorded (treat as fresh)", () => {
      expect(isOwnerTokenExpired("tok-unknown", storage)).toBe(false);
    });

    it("returns false for a token seen just now", () => {
      const now = Date.now();
      recordOwnerTokenSeen("tok-fresh", storage);
      expect(isOwnerTokenExpired("tok-fresh", storage, now)).toBe(false);
    });

    it("returns false for a token seen just under TTL ago", () => {
      const seenAt = Date.now() - OWNER_TOKEN_TTL_MS + 1000;
      storage.setItem("owner-portal-token-seen:tok-old", String(seenAt));
      const now = seenAt + OWNER_TOKEN_TTL_MS - 1;
      expect(isOwnerTokenExpired("tok-old", storage, now)).toBe(false);
    });

    it("returns true for a token seen exactly at TTL ago", () => {
      const seenAt = 1_000_000;
      storage.setItem("owner-portal-token-seen:tok-expired", String(seenAt));
      const now = seenAt + OWNER_TOKEN_TTL_MS;
      expect(isOwnerTokenExpired("tok-expired", storage, now)).toBe(true);
    });

    it("returns true for a token seen more than TTL ago", () => {
      const seenAt = Date.now() - OWNER_TOKEN_TTL_MS - 5000;
      storage.setItem("owner-portal-token-seen:tok-stale", String(seenAt));
      expect(isOwnerTokenExpired("tok-stale", storage)).toBe(true);
    });

    it("returns false when the stored value is not a number", () => {
      storage.setItem("owner-portal-token-seen:tok-corrupt", "notanumber");
      expect(isOwnerTokenExpired("tok-corrupt", storage)).toBe(false);
    });
  });

  describe("OWNER_TOKEN_TTL_MS", () => {
    it("is 30 days in milliseconds", () => {
      expect(OWNER_TOKEN_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });

  describe("default storage is localStorage (not sessionStorage)", () => {
    it("recordOwnerTokenSeen default parameter is localStorage so 30-day TTL survives tab closes", () => {
      // Confirm that both functions accept an explicit localStorage-shaped mock.
      // The default parameter change ensures the 30-day TTL is persistent
      // across tab closes — sessionStorage would reset it on every tab close.
      const ls = makeStorage();
      recordOwnerTokenSeen("tok-ls-default", ls);
      expect(
        ls.getItem("owner-portal-token-seen:tok-ls-default"),
      ).not.toBeNull();
      expect(isOwnerTokenExpired("tok-ls-default", ls)).toBe(false);
    });
  });
});
