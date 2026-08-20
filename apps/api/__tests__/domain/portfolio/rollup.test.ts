import { describe, it, expect, vi } from "vitest";
import {
  getCommunityRollup,
  getBatchCommunityRollup,
} from "../../../src/domain/portfolio/rollup.js";
import type { Db } from "../../../src/db/client.js";

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

function makeDb(options: {
  community: { id: string; name: string; state: string | null } | null;
  study: {
    id?: string;
    currentReserveCents: number;
    replacementCostCents: number;
    annualBudgetCents?: number | null;
    annualReserveContributionCents?: number | null;
  } | null;
  overdueAmountCents: number;
  lastClose: { periodYear: number; periodMonth: number } | null;
}): Db {
  const selectMock = vi.fn();

  // Call order: community, reserve study metadata, component totals (if study),
  // overdue assessments, last close.
  selectMock.mockReturnValueOnce(
    chainResolving(options.community ? [options.community] : []),
  );
  selectMock.mockReturnValueOnce(
    chainResolving(
      options.study
        ? [
            {
              id: options.study.id ?? "study-1",
              annualBudgetCents: options.study.annualBudgetCents ?? null,
              annualReserveContributionCents:
                options.study.annualReserveContributionCents ?? null,
            },
          ]
        : [],
    ),
  );
  if (options.study) {
    selectMock.mockReturnValueOnce(
      chainResolving([
        {
          currentReserveCents: options.study.currentReserveCents,
          replacementCostCents: options.study.replacementCostCents,
        },
      ]),
    );
  }
  selectMock.mockReturnValueOnce(
    chainResolving([{ totalCents: options.overdueAmountCents }]),
  );
  selectMock.mockReturnValueOnce(
    chainResolving(options.lastClose ? [options.lastClose] : []),
  );

  return { select: selectMock } as unknown as Db;
}

describe("getCommunityRollup", () => {
  it("returns correct rollup when reserve study exists", async () => {
    const db = makeDb({
      community: { id: "comm-1", name: "Sunrise HOA", state: "CA" },
      study: { currentReserveCents: 15000, replacementCostCents: 100000 },
      overdueAmountCents: 500,
      lastClose: { periodYear: 2024, periodMonth: 3 },
    });

    const result = await getCommunityRollup(db, "comm-1");

    expect(result.communityId).toBe("comm-1");
    expect(result.name).toBe("Sunrise HOA");
    expect(result.state).toBe("CA");
    expect(result.reservePctFunded).toBe(15);
    expect(result.fannieMaeCompliant).toBeNull();
    expect(result.fannieMaeComplianceBasis).toBe(
      "annual_budget_allocation_unavailable",
    );
    expect(result.overdueAssessmentsCents).toBe(500);
    expect(result.lastCloseMonth).toBe("2024-03");
  });

  it("returns null for reservePctFunded and fannieMaeCompliant when no reserve study", async () => {
    const db = makeDb({
      community: { id: "comm-2", name: "Harbor Condos", state: "FL" },
      study: null,
      overdueAmountCents: 0,
      lastClose: null,
    });

    const result = await getCommunityRollup(db, "comm-2");

    expect(result.reservePctFunded).toBeNull();
    expect(result.fannieMaeCompliant).toBeNull();
    expect(result.lastCloseMonth).toBeNull();
  });

  it("does not mark Fannie Mae compliance when annual budget allocation is unavailable", async () => {
    const db = makeDb({
      community: { id: "comm-3", name: "Lakeview", state: "TX" },
      study: { currentReserveCents: 1000, replacementCostCents: 100000 },
      overdueAmountCents: 0,
      lastClose: null,
    });

    const result = await getCommunityRollup(db, "comm-3");

    expect(result.reservePctFunded).toBe(1);
    expect(result.fannieMaeCompliant).toBeNull();
    expect(result.fannieMaeComplianceBasis).toBe(
      "annual_budget_allocation_unavailable",
    );
  });

  it("computes Fannie Mae compliance from annual budget allocation", async () => {
    const db = makeDb({
      community: { id: "comm-8", name: "Cedar Place", state: "NC" },
      study: {
        currentReserveCents: 1000,
        replacementCostCents: 100000,
        annualBudgetCents: 12000000,
        annualReserveContributionCents: 1800000,
      },
      overdueAmountCents: 0,
      lastClose: null,
    });

    const result = await getCommunityRollup(db, "comm-8");

    expect(result.reservePctFunded).toBe(1);
    expect(result.fannieMaeCompliant).toBe(true);
    expect(result.fannieMaeComplianceBasis).toBe("annual_budget_allocation");
  });

  it("sums overdue assessments correctly when non-zero", async () => {
    const db = makeDb({
      community: { id: "comm-4", name: "Oak Park", state: "AZ" },
      study: { currentReserveCents: 20000, replacementCostCents: 100000 },
      overdueAmountCents: 3750,
      lastClose: null,
    });

    const result = await getCommunityRollup(db, "comm-4");

    expect(result.overdueAssessmentsCents).toBe(3750);
  });

  it("formats lastCloseMonth correctly with zero-padded month", async () => {
    const db = makeDb({
      community: { id: "comm-5", name: "Maple Grove", state: "WA" },
      study: null,
      overdueAmountCents: 0,
      lastClose: { periodYear: 2025, periodMonth: 1 },
    });

    const result = await getCommunityRollup(db, "comm-5");

    expect(result.lastCloseMonth).toBe("2025-01");
  });

  it("handles null state gracefully", async () => {
    const db = makeDb({
      community: { id: "comm-6", name: "Brookside", state: null },
      study: null,
      overdueAmountCents: 0,
      lastClose: null,
    });

    const result = await getCommunityRollup(db, "comm-6");

    expect(result.state).toBeNull();
  });

  it("throws when community is not found", async () => {
    const db = makeDb({
      community: null,
      study: null,
      overdueAmountCents: 0,
      lastClose: null,
    });

    await expect(getCommunityRollup(db, "nonexistent")).rejects.toThrow();
  });

  it("defaults overdueAssessmentsCents to 0 when overdue query returns no rows", async () => {
    // Overrides the overdue row mock to return no rows, exercising the ?? 0 branch
    const selectMock = vi.fn();

    // community
    selectMock.mockReturnValueOnce(
      chainResolving([{ id: "comm-7", name: "Elm Court", state: "OR" }]),
    );

    // study — no rows
    selectMock.mockReturnValueOnce(chainResolving([]));

    // overdue — no rows (undefined overdueRow)
    selectMock.mockReturnValueOnce(chainResolving([]));

    // lastClose — no rows
    selectMock.mockReturnValueOnce(chainResolving([]));

    const db = { select: selectMock } as unknown as Db;

    const result = await getCommunityRollup(db, "comm-7");

    expect(result.overdueAssessmentsCents).toBe(0);
    expect(result.reservePctFunded).toBeNull();
  });
});

/**
 * Helper to build a mock Db for getBatchCommunityRollup.
 * The batch function issues exactly 5 queries regardless of community count:
 *   1. communities (inArray)
 *   2. reserveStudies (inArray)
 *   3. reserveComponents (inArray studyIds) — skipped when no studies
 *   4. assessments grouped by communityId (overdue totals)
 *   5. monthEndCloses ordered DESC (last close per community)
 */
function makeBatchDb(options: {
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
  const selectMock = vi.fn();

  // 1. communities
  selectMock.mockReturnValueOnce(chainResolving(options.communities));

  // 2. reserve studies
  selectMock.mockReturnValueOnce(chainResolving(options.studies));

  // 3. components — only if there are studies
  if (options.studies.length > 0) {
    selectMock.mockReturnValueOnce(chainResolving(options.components));
  }

  // 4. overdue assessments
  selectMock.mockReturnValueOnce(chainResolving(options.overdueRows));

  // 5. last closes
  selectMock.mockReturnValueOnce(chainResolving(options.lastCloseRows));

  return { select: selectMock } as unknown as Db;
}

describe("getBatchCommunityRollup", () => {
  it("returns empty array for empty input without querying the DB", async () => {
    const selectMock = vi.fn();
    const db = { select: selectMock } as unknown as Db;

    const result = await getBatchCommunityRollup(db, []);

    expect(result).toHaveLength(0);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("returns correct rollup for a single community with a reserve study", async () => {
    const db = makeBatchDb({
      communities: [{ id: "comm-1", name: "Sunrise HOA", state: "CA" }],
      studies: [
        {
          communityId: "comm-1",
          id: "study-1",
          annualBudgetCents: null,
          annualReserveContributionCents: null,
        },
      ],
      components: [
        {
          studyId: "study-1",
          currentReserveCents: 15000,
          replacementCostCents: 100000,
        },
      ],
      overdueRows: [{ communityId: "comm-1", totalCents: 500 }],
      lastCloseRows: [
        { communityId: "comm-1", periodYear: 2024, periodMonth: 3 },
      ],
    });

    const result = await getBatchCommunityRollup(db, ["comm-1"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      communityId: "comm-1",
      name: "Sunrise HOA",
      state: "CA",
      reservePctFunded: 15,
      fannieMaeCompliant: null,
      fannieMaeComplianceBasis: "annual_budget_allocation_unavailable",
      overdueAssessmentsCents: 500,
      lastCloseMonth: "2024-03",
    });
  });

  it("returns correct rollup for multiple communities — aggregation matches per-community math", async () => {
    const db = makeBatchDb({
      communities: [
        { id: "comm-A", name: "Alpha HOA", state: "TX" },
        { id: "comm-B", name: "Beta Condos", state: "FL" },
      ],
      studies: [
        {
          communityId: "comm-A",
          id: "study-A",
          annualBudgetCents: 20000000,
          annualReserveContributionCents: 3000000,
        },
        {
          communityId: "comm-B",
          id: "study-B",
          annualBudgetCents: null,
          annualReserveContributionCents: null,
        },
      ],
      components: [
        {
          studyId: "study-A",
          currentReserveCents: 50000,
          replacementCostCents: 200000,
        },
        {
          studyId: "study-B",
          currentReserveCents: 10000,
          replacementCostCents: 80000,
        },
      ],
      overdueRows: [
        { communityId: "comm-A", totalCents: 1200 },
        { communityId: "comm-B", totalCents: 0 },
      ],
      lastCloseRows: [
        { communityId: "comm-A", periodYear: 2025, periodMonth: 1 },
        { communityId: "comm-B", periodYear: 2024, periodMonth: 12 },
      ],
    });

    const result = await getBatchCommunityRollup(db, ["comm-A", "comm-B"]);

    expect(result).toHaveLength(2);

    const a = result[0];
    const b = result[1];

    // comm-A: 50000/200000 = 25%, annualBudget 20000000, contribution 3000000 → 15% → Fannie Mae compliant
    expect(a.communityId).toBe("comm-A");
    expect(a.reservePctFunded).toBe(25);
    expect(a.fannieMaeCompliant).toBe(true);
    expect(a.fannieMaeComplianceBasis).toBe("annual_budget_allocation");
    expect(a.overdueAssessmentsCents).toBe(1200);
    expect(a.lastCloseMonth).toBe("2025-01");

    // comm-B: 10000/80000 = 12.5% ≈ 13%, no budget allocation → fannieMaeCompliant=null
    expect(b.communityId).toBe("comm-B");
    expect(b.reservePctFunded).toBe(13);
    expect(b.fannieMaeCompliant).toBeNull();
    expect(b.fannieMaeComplianceBasis).toBe(
      "annual_budget_allocation_unavailable",
    );
    expect(b.overdueAssessmentsCents).toBe(0);
    expect(b.lastCloseMonth).toBe("2024-12");
  });

  it("returns null fields for community with no study, no overdue, no last close", async () => {
    const db = makeBatchDb({
      communities: [{ id: "comm-bare", name: "Bare Community", state: null }],
      studies: [],
      components: [],
      overdueRows: [],
      lastCloseRows: [],
    });

    const result = await getBatchCommunityRollup(db, ["comm-bare"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      communityId: "comm-bare",
      reservePctFunded: null,
      fannieMaeCompliant: null,
      fannieMaeComplianceBasis: null,
      overdueAssessmentsCents: 0,
      lastCloseMonth: null,
    });
  });

  it("preserves the input communityIds order in the output", async () => {
    const db = makeBatchDb({
      communities: [
        // DB may return in different order than input
        { id: "comm-2", name: "Second", state: "WA" },
        { id: "comm-1", name: "First", state: "OR" },
      ],
      studies: [],
      components: [],
      overdueRows: [],
      lastCloseRows: [],
    });

    const result = await getBatchCommunityRollup(db, ["comm-1", "comm-2"]);

    expect(result[0].communityId).toBe("comm-1");
    expect(result[1].communityId).toBe("comm-2");
  });

  it("throws when a requested communityId is not found in the DB", async () => {
    const db = makeBatchDb({
      communities: [],
      studies: [],
      components: [],
      overdueRows: [],
      lastCloseRows: [],
    });

    await expect(
      getBatchCommunityRollup(db, ["nonexistent-comm"]),
    ).rejects.toThrow("Community not found: nonexistent-comm");
  });
});
