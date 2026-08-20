/**
 * Stress / fuzz tests for portfolio domain modules (rollup + membership).
 * Uses a hand-rolled mulberry32 PRNG — no extra npm deps.
 * DB calls are mocked using the same chain-resolving pattern from the existing
 * rollup.test.ts.
 */

import { describe, it, expect, vi } from "vitest";
import {
  getCommunityRollup,
  getBatchCommunityRollup,
  type CommunityRollup,
} from "../../src/domain/portfolio/rollup.js";
import {
  requirePortfolioOwner,
  PortfolioForbiddenError,
} from "../../src/domain/portfolio/membership.js";
import type { Db } from "../../src/db/client.js";

// ---------------------------------------------------------------------------
// Mulberry32 PRNG
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// Chain-resolving mock (copied from rollup.test.ts pattern)
// ---------------------------------------------------------------------------
type SelectChain = {
  from: () => SelectChain;
  where: () => SelectChain;
  leftJoin: () => SelectChain;
  orderBy: () => SelectChain;
  groupBy: () => SelectChain;
  limit: () => Promise<unknown[]>;
  then: (resolve: (v: unknown[]) => unknown) => Promise<unknown>;
};

function chainResolving(value: unknown[]): SelectChain {
  const chain: SelectChain = {
    from: () => chain,
    where: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    limit: () => Promise.resolve(value),
    then: (resolve) => Promise.resolve(value).then(resolve),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Helper: build a mock Db for getCommunityRollup (per-community, 5 queries)
// ---------------------------------------------------------------------------
function makeSingleDb(opts: {
  community: { id: string; name: string; state: string | null } | null;
  studyMeta: {
    id: string;
    annualBudgetCents: number | null;
    annualReserveContributionCents: number | null;
  } | null;
  components: { currentReserveCents: number; replacementCostCents: number } | null;
  overdueTotal: number;
  lastClose: { periodYear: number; periodMonth: number } | null;
}): Db {
  const sel = vi.fn();
  sel.mockReturnValueOnce(chainResolving(opts.community ? [opts.community] : []));
  sel.mockReturnValueOnce(chainResolving(opts.studyMeta ? [opts.studyMeta] : []));
  if (opts.studyMeta) {
    sel.mockReturnValueOnce(
      chainResolving(opts.components ? [opts.components] : []),
    );
  }
  sel.mockReturnValueOnce(chainResolving([{ totalCents: opts.overdueTotal }]));
  sel.mockReturnValueOnce(chainResolving(opts.lastClose ? [opts.lastClose] : []));
  return { select: sel } as unknown as Db;
}

// ---------------------------------------------------------------------------
// Helper: build a mock Db for getBatchCommunityRollup (4–5 batch queries)
// ---------------------------------------------------------------------------
function makeBatchDb(opts: {
  communities: Array<{ id: string; name: string; state: string | null }>;
  studies: Array<{
    communityId: string;
    id: string;
    annualBudgetCents: number | null;
    annualReserveContributionCents: number | null;
  }>;
  components: Array<{
    studyId: string;
    currentReserveCents: number;
    replacementCostCents: number;
  }>;
  overdueRows: Array<{ communityId: string; totalCents: number }>;
  lastCloseRows: Array<{
    communityId: string;
    periodYear: number;
    periodMonth: number;
  }>;
}): Db {
  const sel = vi.fn();
  sel.mockReturnValueOnce(chainResolving(opts.communities));
  sel.mockReturnValueOnce(chainResolving(opts.studies));
  if (opts.studies.length > 0) {
    sel.mockReturnValueOnce(chainResolving(opts.components));
  }
  sel.mockReturnValueOnce(chainResolving(opts.overdueRows));
  sel.mockReturnValueOnce(chainResolving(opts.lastCloseRows));
  return { select: sel } as unknown as Db;
}

// ---------------------------------------------------------------------------
// rollup invariants — getCommunityRollup
// ---------------------------------------------------------------------------

describe("getCommunityRollup – stress invariants", () => {
  /**
   * Invariant A: reservePctFunded is null when replacementCostCents === 0 or
   * no study. Divide-by-zero guard.
   */
  it("A – reservePctFunded is null when replacementCostCents is 0 (divide-by-zero guard)", async () => {
    const db = makeSingleDb({
      community: { id: "c1", name: "N", state: null },
      studyMeta: { id: "s1", annualBudgetCents: null, annualReserveContributionCents: null },
      components: { currentReserveCents: 50_000, replacementCostCents: 0 },
      overdueTotal: 0,
      lastClose: null,
    });
    const result = await getCommunityRollup(db, "c1");
    expect(result.reservePctFunded).toBeNull();
    expect(Number.isNaN(result.reservePctFunded ?? 0)).toBe(false);
  });

  /**
   * Invariant B: fannieMaeCompliant is null when annualBudgetCents is 0 or null
   * (another divide-by-zero: allocation% = contribution / budget).
   */
  it("B – fannieMaeCompliant is null when annualBudgetCents is 0", async () => {
    const db = makeSingleDb({
      community: { id: "c2", name: "N", state: null },
      studyMeta: {
        id: "s2",
        annualBudgetCents: 0,
        annualReserveContributionCents: 500_000,
      },
      components: null,
      overdueTotal: 0,
      lastClose: null,
    });
    const result = await getCommunityRollup(db, "c2");
    expect(result.fannieMaeCompliant).toBeNull();
    expect(result.reservePctFunded).toBeNull();
  });

  /**
   * Invariant C: fannieMaeCompliant is null when annualBudgetCents is null.
   */
  it("C – fannieMaeCompliant is null when annualBudgetCents is null", async () => {
    const db = makeSingleDb({
      community: { id: "c3", name: "N", state: null },
      studyMeta: {
        id: "s3",
        annualBudgetCents: null,
        annualReserveContributionCents: 500_000,
      },
      components: null,
      overdueTotal: 0,
      lastClose: null,
    });
    const result = await getCommunityRollup(db, "c3");
    expect(result.fannieMaeCompliant).toBeNull();
  });

  /**
   * Invariant D: fannieMaeCompliant derivation — exactly at 15% boundary.
   * 15% → true; just below → false.
   */
  it("D – fannieMaeCompliant is true at exactly 15% allocation and false below", async () => {
    // exactly 15%
    const db15 = makeSingleDb({
      community: { id: "c4", name: "N", state: null },
      studyMeta: {
        id: "s4",
        annualBudgetCents: 10_000_000,
        annualReserveContributionCents: 1_500_000,
      },
      components: null,
      overdueTotal: 0,
      lastClose: null,
    });
    const r15 = await getCommunityRollup(db15, "c4");
    expect(r15.fannieMaeCompliant).toBe(true);

    // just below 15% (14.99%)
    const dbBelow = makeSingleDb({
      community: { id: "c5", name: "N", state: null },
      studyMeta: {
        id: "s5",
        annualBudgetCents: 10_000_000,
        annualReserveContributionCents: 1_499_999,
      },
      components: null,
      overdueTotal: 0,
      lastClose: null,
    });
    const rBelow = await getCommunityRollup(dbBelow, "c5");
    expect(rBelow.fannieMaeCompliant).toBe(false);
  });

  /**
   * Invariant E: no field is NaN for many randomised valid study inputs.
   */
  it("E – no NaN in rollup output for randomised study component values", async () => {
    const rng = mulberry32(0xdeadbeef);

    for (let trial = 0; trial < 200; trial++) {
      const currentReserve = Math.floor(rng() * 5_000_000);
      const replacementCost = Math.floor(rng() * 5_000_000) + 1; // >0
      const annualBudget = Math.floor(rng() * 10_000_000) + 1;
      const annualContrib = Math.floor(rng() * annualBudget);

      const db = makeSingleDb({
        community: { id: "c", name: "N", state: "CA" },
        studyMeta: {
          id: "s",
          annualBudgetCents: annualBudget,
          annualReserveContributionCents: annualContrib,
        },
        components: { currentReserveCents: currentReserve, replacementCostCents: replacementCost },
        overdueTotal: Math.floor(rng() * 100_000),
        lastClose: null,
      });

      const result = await getCommunityRollup(db, "c");

      expect(Number.isNaN(result.reservePctFunded ?? 0)).toBe(false);
      expect(Number.isNaN(result.overdueAssessmentsCents)).toBe(false);
      // fannieMaeCompliant is boolean | null, never NaN
      expect(result.fannieMaeCompliant === null || typeof result.fannieMaeCompliant === "boolean").toBe(true);
    }
  });

  /**
   * Invariant F: lastCloseMonth format is always YYYY-MM (zero-padded) for
   * all valid month values 1–12.
   */
  it("F – lastCloseMonth is zero-padded YYYY-MM for every month 1–12", async () => {
    for (let month = 1; month <= 12; month++) {
      const db = makeSingleDb({
        community: { id: "c", name: "N", state: null },
        studyMeta: null,
        components: null,
        overdueTotal: 0,
        lastClose: { periodYear: 2024, periodMonth: month },
      });
      const result = await getCommunityRollup(db, "c");
      expect(result.lastCloseMonth).toBe(
        `2024-${String(month).padStart(2, "0")}`,
      );
    }
  });

  /**
   * Invariant G: throws for missing community.
   */
  it("G – throws with descriptive message when community not found", async () => {
    const db = makeSingleDb({
      community: null,
      studyMeta: null,
      components: null,
      overdueTotal: 0,
      lastClose: null,
    });
    await expect(getCommunityRollup(db, "missing-id")).rejects.toThrow(
      "Community not found: missing-id",
    );
  });
});

// ---------------------------------------------------------------------------
// rollup invariants — getBatchCommunityRollup
// ---------------------------------------------------------------------------

describe("getBatchCommunityRollup – stress invariants", () => {
  /**
   * Invariant A: output length always equals input communityIds length.
   */
  it("A – output length always equals input communityIds length", async () => {
    const rng = mulberry32(0xabcdef);
    for (let n = 0; n <= 10; n++) {
      const ids = Array.from({ length: n }, (_, i) => `comm-${i}`);
      const comms = ids.map((id) => ({ id, name: `Name-${id}`, state: null }));
      const db = makeBatchDb({
        communities: comms,
        studies: [],
        components: [],
        overdueRows: [],
        lastCloseRows: [],
      });
      const result = await getBatchCommunityRollup(db, ids);
      expect(result).toHaveLength(n);
      void rng; // suppress unused
    }
  });

  /**
   * Invariant B: output is in the same order as the input communityIds
   * (even when the mock returns communities in a different order).
   */
  it("B – output order always matches input communityIds order", async () => {
    const ids = ["comm-3", "comm-1", "comm-2"];
    const db = makeBatchDb({
      // Deliberately return in different order
      communities: [
        { id: "comm-1", name: "One", state: null },
        { id: "comm-2", name: "Two", state: null },
        { id: "comm-3", name: "Three", state: null },
      ],
      studies: [],
      components: [],
      overdueRows: [],
      lastCloseRows: [],
    });
    const result = await getBatchCommunityRollup(db, ids);
    expect(result.map((r) => r.communityId)).toEqual(ids);
  });

  /**
   * Invariant C: empty input returns empty output without calling the DB.
   */
  it("C – empty communityIds returns [] without touching the DB", async () => {
    const sel = vi.fn();
    const db = { select: sel } as unknown as Db;
    const result = await getBatchCommunityRollup(db, []);
    expect(result).toHaveLength(0);
    expect(sel).not.toHaveBeenCalled();
  });

  /**
   * Invariant D: overdueAssessmentsCents defaults to 0 when community has no
   * row in the overdue result set.
   */
  it("D – overdueAssessmentsCents defaults to 0 for community absent from overdueRows", async () => {
    const db = makeBatchDb({
      communities: [{ id: "c1", name: "C1", state: null }],
      studies: [],
      components: [],
      overdueRows: [], // no entry for c1
      lastCloseRows: [],
    });
    const [result] = await getBatchCommunityRollup(db, ["c1"]);
    expect(result!.overdueAssessmentsCents).toBe(0);
  });

  /**
   * Invariant E: reservePctFunded is null when replacementCostCents is 0
   * (batch path divide-by-zero guard).
   */
  it("E – batch reservePctFunded is null when replacementCostCents is 0", async () => {
    const db = makeBatchDb({
      communities: [{ id: "c1", name: "C1", state: null }],
      studies: [
        {
          communityId: "c1",
          id: "s1",
          annualBudgetCents: null,
          annualReserveContributionCents: null,
        },
      ],
      components: [
        { studyId: "s1", currentReserveCents: 50_000, replacementCostCents: 0 },
      ],
      overdueRows: [],
      lastCloseRows: [],
    });
    const [result] = await getBatchCommunityRollup(db, ["c1"]);
    expect(result!.reservePctFunded).toBeNull();
  });

  /**
   * Invariant F: fannieMaeCompliant is null when annualBudgetCents is 0 in
   * the batch path (another divide-by-zero guard).
   */
  it("F – batch fannieMaeCompliant is null when annualBudgetCents is 0", async () => {
    const db = makeBatchDb({
      communities: [{ id: "c1", name: "C1", state: null }],
      studies: [
        {
          communityId: "c1",
          id: "s1",
          annualBudgetCents: 0,
          annualReserveContributionCents: 1_000_000,
        },
      ],
      components: [],
      overdueRows: [],
      lastCloseRows: [],
    });
    const [result] = await getBatchCommunityRollup(db, ["c1"]);
    expect(result!.fannieMaeCompliant).toBeNull();
  });

  /**
   * Invariant G: per-community and batch paths produce identical results
   * for the same underlying data (aggregation equivalence).
   *
   * We drive both paths with matching mocks for each of N communities and
   * assert field-by-field equality.
   */
  it("G – getCommunityRollup and getBatchCommunityRollup agree for matching data", async () => {
    const rng = mulberry32(0x12345678);
    const N = 5;

    type StudySpec = {
      currentReserveCents: number;
      replacementCostCents: number;
      annualBudgetCents: number | null;
      annualReserveContributionCents: number | null;
    };
    const specs: Array<{
      id: string;
      name: string;
      state: string | null;
      study: StudySpec | null;
      overdue: number;
      lastClose: { periodYear: number; periodMonth: number } | null;
    }> = [];

    for (let i = 0; i < N; i++) {
      const hasStudy = rng() > 0.3;
      const hasBudget = rng() > 0.4;
      const replacementCost = Math.floor(rng() * 1_000_000) + 1;
      specs.push({
        id: `comm-${i}`,
        name: `Community ${i}`,
        state: rng() > 0.5 ? "CA" : null,
        study: hasStudy
          ? {
              currentReserveCents: Math.floor(rng() * replacementCost),
              replacementCostCents: replacementCost,
              annualBudgetCents: hasBudget
                ? Math.floor(rng() * 10_000_000) + 1
                : null,
              annualReserveContributionCents: hasBudget
                ? Math.floor(rng() * 1_000_000)
                : null,
            }
          : null,
        overdue: Math.floor(rng() * 50_000),
        lastClose:
          rng() > 0.5
            ? {
                periodYear: 2024,
                periodMonth: Math.floor(rng() * 12) + 1,
              }
            : null,
      });
    }

    // Run per-community path for each spec
    const perCommunityResults: CommunityRollup[] = [];
    for (const spec of specs) {
      const db = makeSingleDb({
        community: { id: spec.id, name: spec.name, state: spec.state },
        studyMeta: spec.study
          ? {
              id: `study-${spec.id}`,
              annualBudgetCents: spec.study.annualBudgetCents,
              annualReserveContributionCents:
                spec.study.annualReserveContributionCents,
            }
          : null,
        components: spec.study
          ? {
              currentReserveCents: spec.study.currentReserveCents,
              replacementCostCents: spec.study.replacementCostCents,
            }
          : null,
        overdueTotal: spec.overdue,
        lastClose: spec.lastClose,
      });
      perCommunityResults.push(await getCommunityRollup(db, spec.id));
    }

    // Run batch path
    const batchDb = makeBatchDb({
      communities: specs.map((s) => ({ id: s.id, name: s.name, state: s.state })),
      studies: specs
        .filter((s) => s.study !== null)
        .map((s) => ({
          communityId: s.id,
          id: `study-${s.id}`,
          annualBudgetCents: s.study!.annualBudgetCents,
          annualReserveContributionCents: s.study!.annualReserveContributionCents,
        })),
      components: specs
        .filter((s) => s.study !== null)
        .map((s) => ({
          studyId: `study-${s.id}`,
          currentReserveCents: s.study!.currentReserveCents,
          replacementCostCents: s.study!.replacementCostCents,
        })),
      overdueRows: specs.map((s) => ({
        communityId: s.id,
        totalCents: s.overdue,
      })),
      lastCloseRows: specs
        .filter((s) => s.lastClose !== null)
        .map((s) => ({
          communityId: s.id,
          periodYear: s.lastClose!.periodYear,
          periodMonth: s.lastClose!.periodMonth,
        })),
    });

    const batchResults = await getBatchCommunityRollup(
      batchDb,
      specs.map((s) => s.id),
    );

    expect(batchResults).toHaveLength(N);
    for (let i = 0; i < N; i++) {
      expect(batchResults[i]).toEqual(perCommunityResults[i]);
    }
  });

  /**
   * Invariant H: batch path — when a community has multiple lastClose entries
   * (unsorted), the one with the highest year/month wins.
   *
   * BUG: The batch implementation relies on the DB returning rows in DESC order
   * (by year then month). When the mock returns rows in ascending order (as a DB
   * might under certain query-planner decisions), the first-wins deduplication
   * logic picks the OLDEST close rather than the newest.
   *
   * Source: apps/api/src/domain/portfolio/rollup.ts lines 249–263
   * Reproducing input: lastCloseRows = [
   *   { communityId: "c1", periodYear: 2024, periodMonth: 1 },  // older
   *   { communityId: "c1", periodYear: 2024, periodMonth: 6 },  // newer
   * ]  (ascending — simulating a DB that doesn't guarantee DESC sort)
   * Expected: lastCloseMonth = "2024-06"
   * Actual: lastCloseMonth = "2024-01" (picks first encountered, which is oldest)
   */
  it(
    "H – batch lastCloseMonth picks the most-recent close even when rows arrive in ascending order",
    async () => {
      const db = makeBatchDb({
        communities: [{ id: "c1", name: "C1", state: null }],
        studies: [],
        components: [],
        overdueRows: [],
        // ascending — oldest first (simulates non-guaranteed sort)
        lastCloseRows: [
          { communityId: "c1", periodYear: 2024, periodMonth: 1 },
          { communityId: "c1", periodYear: 2024, periodMonth: 6 },
        ],
      });
      const [result] = await getBatchCommunityRollup(db, ["c1"]);
      // Should pick 2024-06 (most recent), not 2024-01
      expect(result!.lastCloseMonth).toBe("2024-06");
    },
  );
});

// ---------------------------------------------------------------------------
// requirePortfolioOwner stress tests
// ---------------------------------------------------------------------------

function makePortfolioDb(opts: {
  row: { ownerUserId: string } | null;
}): Db {
  const sel = vi.fn();
  sel.mockReturnValue(chainResolving(opts.row ? [opts.row] : []));
  return { select: sel } as unknown as Db;
}

describe("requirePortfolioOwner – stress invariants", () => {
  /**
   * Invariant A: resolves without throwing when userId matches ownerUserId.
   */
  it("A – resolves for matching owner", async () => {
    const db = makePortfolioDb({ row: { ownerUserId: "user-1" } });
    await expect(
      requirePortfolioOwner(db, "portfolio-1", "user-1"),
    ).resolves.toBeUndefined();
  });

  /**
   * Invariant B: throws PortfolioForbiddenError when userId !== ownerUserId.
   */
  it("B – throws PortfolioForbiddenError for non-owner userId", async () => {
    const db = makePortfolioDb({ row: { ownerUserId: "user-1" } });
    await expect(
      requirePortfolioOwner(db, "portfolio-1", "user-2"),
    ).rejects.toThrow(PortfolioForbiddenError);
  });

  /**
   * Invariant C: throws PortfolioForbiddenError when portfolio not found (no row).
   */
  it("C – throws PortfolioForbiddenError when portfolio row does not exist", async () => {
    const db = makePortfolioDb({ row: null });
    await expect(
      requirePortfolioOwner(db, "missing-portfolio", "user-1"),
    ).rejects.toThrow(PortfolioForbiddenError);
  });

  /**
   * Invariant D: PortfolioForbiddenError always has status=403.
   */
  it("D – PortfolioForbiddenError.status is always 403", async () => {
    const db = makePortfolioDb({ row: { ownerUserId: "owner" } });
    try {
      await requirePortfolioOwner(db, "p", "not-owner");
    } catch (err) {
      expect(err).toBeInstanceOf(PortfolioForbiddenError);
      expect((err as PortfolioForbiddenError).status).toBe(403);
    }
  });

  /**
   * Invariant E: adversarial userId values (empty string, undefined cast,
   * prototype strings) are all rejected when ownerUserId is a real user.
   */
  it("E – adversarial userId values are all rejected", async () => {
    const adversarial = [
      "",
      " ",
      "undefined",
      "null",
      "0",
      "__proto__",
      "constructor",
    ];
    for (const badId of adversarial) {
      const db = makePortfolioDb({ row: { ownerUserId: "real-user" } });
      await expect(
        requirePortfolioOwner(db, "p1", badId),
      ).rejects.toThrow(PortfolioForbiddenError);
    }
  });

  /**
   * Invariant F: stress — randomised user/owner pairs; ownership accepted iff
   * userId === ownerUserId.
   */
  it("F – ownership accepted iff userId strictly equals ownerUserId", async () => {
    const rng = mulberry32(0x77665544);
    const users = ["alice", "bob", "carol", "dave", "eve"];
    for (let trial = 0; trial < 500; trial++) {
      const owner = users[Math.floor(rng() * users.length)]!;
      const requester = users[Math.floor(rng() * users.length)]!;
      const db = makePortfolioDb({ row: { ownerUserId: owner } });

      if (owner === requester) {
        await expect(
          requirePortfolioOwner(db, "p", requester),
        ).resolves.toBeUndefined();
      } else {
        await expect(
          requirePortfolioOwner(db, "p", requester),
        ).rejects.toThrow(PortfolioForbiddenError);
      }
    }
  });
});
