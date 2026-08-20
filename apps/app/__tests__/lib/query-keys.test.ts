import { describe, it, expect } from "vitest";
import { qk, hashTokenForKey } from "@/lib/query-keys";

describe("query-keys", () => {
  describe("qk.communities", () => {
    it("list() returns a stable key", () => {
      expect(qk.communities.list()).toEqual(["communities"]);
    });
  });

  describe("qk.activation", () => {
    it("current(communityId) returns a stable key", () => {
      expect(qk.activation.current("comm-1")).toEqual(["activation", "comm-1"]);
    });

    it("current() is keyed by communityId so different IDs produce different keys", () => {
      expect(qk.activation.current("comm-1")).not.toEqual(
        qk.activation.current("comm-2"),
      );
    });
  });

  describe("qk.finance", () => {
    it("accounts(communityId) returns a stable key", () => {
      expect(qk.finance.accounts("comm-1")).toEqual([
        "finance",
        "accounts",
        "comm-1",
      ]);
    });

    it("dues(communityId) returns a stable key", () => {
      expect(qk.finance.dues("comm-1")).toEqual([
        "finance",
        "assessments",
        "comm-1",
      ]);
    });

    it("homeowners(communityId) returns a stable key", () => {
      expect(qk.finance.homeowners("comm-1")).toEqual([
        "finance",
        "homeowners",
        "comm-1",
      ]);
    });

    it("reserveSummary(communityId) returns a stable key", () => {
      expect(qk.finance.reserveSummary("comm-1")).toEqual([
        "finance",
        "reserves",
        "summary",
        "comm-1",
      ]);
    });

    it("journal(communityId) returns a stable key", () => {
      expect(qk.finance.journal("comm-1")).toEqual([
        "finance",
        "journal",
        "comm-1",
      ]);
    });
  });

  describe("qk.bank", () => {
    it("statements(communityId) returns a stable key", () => {
      expect(qk.bank.statements("comm-1")).toEqual([
        "bank-statements",
        "comm-1",
      ]);
    });

    it("reconciliation(reconciliationId, communityId) returns a stable key", () => {
      expect(qk.bank.reconciliation("rec-1", "comm-1")).toEqual([
        "reconciliation",
        "rec-1",
        "comm-1",
      ]);
    });

    it("reconciliation tolerates an undefined reconciliationId", () => {
      expect(qk.bank.reconciliation(undefined, "comm-1")).toEqual([
        "reconciliation",
        undefined,
        "comm-1",
      ]);
    });

    it("keys distinguish different ids", () => {
      expect(qk.bank.statements("a")).not.toEqual(qk.bank.statements("b"));
      expect(qk.bank.reconciliation("a", "c")).not.toEqual(
        qk.bank.reconciliation("b", "c"),
      );
    });
  });

  describe("qk.billing", () => {
    it("status(communityId) returns a stable key", () => {
      expect(qk.billing.status("comm-1")).toEqual(["billing-status", "comm-1"]);
    });
  });

  describe("qk.governance", () => {
    it("homeowners(communityId) returns a stable key without search", () => {
      expect(qk.governance.homeowners("comm-1")).toEqual([
        "governance-homeowners",
        "comm-1",
        undefined,
      ]);
    });

    it("homeowners(communityId, search) returns a stable key with search", () => {
      expect(qk.governance.homeowners("comm-1", "smith")).toEqual([
        "governance-homeowners",
        "comm-1",
        "smith",
      ]);
    });

    it("archRequests(communityId) returns a stable key", () => {
      expect(qk.governance.archRequests("comm-1")).toEqual([
        "governance-arch-requests",
        "comm-1",
      ]);
    });

    it("transitions(communityId) returns a stable key", () => {
      expect(qk.governance.transitions("comm-1")).toEqual([
        "governance-transitions",
        "comm-1",
      ]);
    });

    it("meetings(communityId) returns a stable key", () => {
      expect(qk.governance.meetings("comm-1")).toEqual([
        "governance-meetings",
        "comm-1",
      ]);
    });

    it("motions(meetingId) returns a stable key", () => {
      expect(qk.governance.motions("meeting-1")).toEqual([
        "governance-motions",
        "meeting-1",
      ]);
    });

    it("motionVotes(motionId) returns a stable key", () => {
      expect(qk.governance.motionVotes("motion-1")).toEqual([
        "governance-motion-votes",
        "motion-1",
      ]);
    });

    it("violations(communityId) returns a stable key", () => {
      expect(qk.governance.violations("comm-1")).toEqual([
        "governance-violations",
        "comm-1",
      ]);
    });

    it("violationEvents(violationId) returns a stable key", () => {
      expect(qk.governance.violationEvents("viol-1")).toEqual([
        "governance-violation-events",
        "viol-1",
      ]);
    });

    it("keys distinguish different ids", () => {
      expect(qk.governance.meetings("a")).not.toEqual(
        qk.governance.meetings("b"),
      );
      expect(qk.governance.violationEvents("a")).not.toEqual(
        qk.governance.violationEvents("b"),
      );
    });
  });

  describe("qk.ownerPortal", () => {
    it("me(token) returns a stable key with a hashed token (not the raw token)", () => {
      const key = qk.ownerPortal.me("tok-abc");
      expect(key[0]).toBe("owner-portal");
      // The raw token must NOT appear in the cache key
      expect(key[1]).not.toBe("tok-abc");
      // The hash must be deterministic
      expect(key).toEqual(qk.ownerPortal.me("tok-abc"));
    });

    it("archRequests(token) returns a stable key with a hashed token", () => {
      const key = qk.ownerPortal.archRequests("tok-abc");
      expect(key[0]).toBe("owner-portal-arch");
      expect(key[1]).not.toBe("tok-abc");
      expect(key).toEqual(qk.ownerPortal.archRequests("tok-abc"));
    });

    it("different tokens produce different cache keys", () => {
      const key1 = qk.ownerPortal.me("token-aaa");
      const key2 = qk.ownerPortal.me("token-bbb");
      expect(key1[1]).not.toBe(key2[1]);
    });

    it("same token always produces the same cache key", () => {
      const key1 = qk.ownerPortal.me("stable-token");
      const key2 = qk.ownerPortal.me("stable-token");
      expect(key1).toEqual(key2);
    });
  });
});

describe("hashTokenForKey", () => {
  it("returns a hex string", () => {
    const hash = hashTokenForKey("some-token");
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("returns at most 16 hex chars", () => {
    const hash = hashTokenForKey("some-token");
    expect(hash.length).toBeLessThanOrEqual(16);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashTokenForKey("token-A")).not.toBe(hashTokenForKey("token-B"));
  });

  it("is deterministic — same input produces same output", () => {
    expect(hashTokenForKey("fixed-token")).toBe(hashTokenForKey("fixed-token"));
  });
});
