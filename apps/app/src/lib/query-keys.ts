/**
 * Fast, non-cryptographic token hash for use in query cache keys.
 *
 * The token itself is never used as a cache key — tokens are opaque secrets
 * and must not be exposed in devtools or logs. A 16-hex-char hash provides
 * sufficient collision resistance for cache key purposes while keeping the
 * token private. Different tokens produce different hashes; the same token
 * always produces the same hash within a session.
 */
export function hashTokenForKey(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 16);
}

/**
 * Centralized TanStack Query key factories.
 *
 * Using factory functions instead of inline arrays prevents cache-miss bugs
 * caused by key typos and makes it easy to grep all invalidation sites.
 *
 * Only keys that are used by mutations and their invalidations are included
 * here — those are the sites where a mismatch actually causes a cache bug.
 */
export const qk = {
  communities: {
    /** ["communities"] — community list for the signed-in user. */
    list: (): readonly string[] => ["communities"],
  },
  activation: {
    /** ["activation", communityId] — onboarding checklist for a community. */
    current: (communityId: string): readonly [string, string] => [
      "activation",
      communityId,
    ],
  },
  finance: {
    /** ["finance", "accounts", communityId] */
    accounts: (communityId: string): readonly [string, string, string] => [
      "finance",
      "accounts",
      communityId,
    ],
    /** ["finance", "assessments", communityId] */
    dues: (communityId: string): readonly [string, string, string] => [
      "finance",
      "assessments",
      communityId,
    ],
    /** ["finance", "homeowners", communityId] */
    homeowners: (communityId: string): readonly [string, string, string] => [
      "finance",
      "homeowners",
      communityId,
    ],
    /** ["finance", "reserves", "summary", communityId] */
    reserveSummary: (
      communityId: string,
    ): readonly [string, string, string, string] => [
      "finance",
      "reserves",
      "summary",
      communityId,
    ],
    /** ["finance", "journal", communityId] */
    journal: (communityId: string): readonly [string, string, string] => [
      "finance",
      "journal",
      communityId,
    ],
  },
  bank: {
    /** ["bank-statements", communityId] — statement list; read + invalidated on import. */
    statements: (communityId: string): readonly [string, string] => [
      "bank-statements",
      communityId,
    ],
    /**
     * ["reconciliation", reconciliationId, communityId] — a single reconciliation;
     * read by the reconcile route and invalidated by ReconcileGrid mutations.
     */
    reconciliation: (
      reconciliationId: string | undefined,
      communityId: string,
    ): readonly [string, string | undefined, string] => [
      "reconciliation",
      reconciliationId,
      communityId,
    ],
  },
  billing: {
    /** ["billing-status", communityId] */
    status: (communityId: string): readonly [string, string] => [
      "billing-status",
      communityId,
    ],
  },
  governance: {
    /**
     * ["governance-homeowners", communityId, search | undefined]
     * Include search so invalidating without search hits all search variants.
     */
    homeowners: (
      communityId: string,
      search?: string,
    ): readonly [string, string, string | undefined] => [
      "governance-homeowners",
      communityId,
      search,
    ],
    /** ["governance-arch-requests", communityId] */
    archRequests: (communityId: string): readonly [string, string] => [
      "governance-arch-requests",
      communityId,
    ],
    /** ["governance-transitions", communityId] — read + invalidated on acknowledge/complete. */
    transitions: (communityId: string): readonly [string, string] => [
      "governance-transitions",
      communityId,
    ],
    /** ["governance-meetings", communityId] — read + invalidated on every meeting/minutes mutation. */
    meetings: (communityId: string): readonly [string, string] => [
      "governance-meetings",
      communityId,
    ],
    /** ["governance-motions", meetingId] — motions for a meeting; invalidated on motion create/resolve. */
    motions: (meetingId: string): readonly [string, string] => [
      "governance-motions",
      meetingId,
    ],
    /** ["governance-motion-votes", motionId] — vote tally; read, setQueryData, and invalidated on vote. */
    motionVotes: (motionId: string): readonly [string, string] => [
      "governance-motion-votes",
      motionId,
    ],
    /** ["governance-violations", communityId] — read + invalidated on violation/event mutations. */
    violations: (communityId: string): readonly [string, string] => [
      "governance-violations",
      communityId,
    ],
    /** ["governance-violation-events", violationId] — event timeline; invalidated on event add. */
    violationEvents: (violationId: string): readonly [string, string] => [
      "governance-violation-events",
      violationId,
    ],
  },
  ownerPortal: {
    /**
     * ["owner-portal", tokenHash]
     *
     * The raw token is never stored in the cache key — it is an opaque secret.
     * A fast hash is used so devtools and logs never expose the token value.
     */
    me: (token: string): readonly [string, string] => [
      "owner-portal",
      hashTokenForKey(token),
    ],
    /** ["owner-portal-arch", tokenHash] */
    archRequests: (token: string): readonly [string, string] => [
      "owner-portal-arch",
      hashTokenForKey(token),
    ],
  },
} as const;
