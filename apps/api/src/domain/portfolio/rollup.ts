import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { communities } from "../../db/schema/tenancy.js";
import {
  reserveStudies,
  reserveComponents,
} from "../../db/schema/reserveStudy.js";
import { assessments } from "../../db/schema/dues.js";
import { monthEndCloses } from "../../db/schema/monthEndClose.js";
import type { Db } from "../../db/client.js";

export type CommunityRollup = {
  communityId: string;
  name: string;
  state: string | null;
  reservePctFunded: number | null;
  fannieMaeCompliant: boolean | null;
  fannieMaeComplianceBasis:
    | "annual_budget_allocation"
    | "annual_budget_allocation_unavailable"
    | null;
  overdueAssessmentsCents: number;
  lastCloseMonth: string | null;
};

export async function getCommunityRollup(
  db: Db,
  communityId: string,
): Promise<CommunityRollup> {
  const [community] = await db
    .select({
      id: communities.id,
      name: communities.name,
      state: communities.state,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  if (!community) {
    throw new Error(`Community not found: ${communityId}`);
  }

  const [studyMeta] = await db
    .select({
      id: reserveStudies.id,
      annualBudgetCents: reserveStudies.annualBudgetCents,
      annualReserveContributionCents:
        reserveStudies.annualReserveContributionCents,
    })
    .from(reserveStudies)
    .where(eq(reserveStudies.communityId, communityId))
    .limit(1);

  const [study] = studyMeta
    ? await db
        .select({
          currentReserveCents:
            sql<number>`coalesce(sum(${reserveComponents.currentReserveCents}), 0)`.mapWith(
              Number,
            ),
          replacementCostCents:
            sql<number>`coalesce(sum(${reserveComponents.replacementCostCents}), 0)`.mapWith(
              Number,
            ),
        })
        .from(reserveComponents)
        .where(eq(reserveComponents.studyId, studyMeta.id))
        .limit(1)
    : [];

  const hasStudy = study !== undefined && study.replacementCostCents > 0;

  const reservePctFunded = hasStudy
    ? Math.round((study.currentReserveCents / study.replacementCostCents) * 100)
    : null;

  const allocationPercent =
    studyMeta?.annualBudgetCents != null &&
    studyMeta.annualBudgetCents > 0 &&
    studyMeta.annualReserveContributionCents != null
      ? (studyMeta.annualReserveContributionCents /
          studyMeta.annualBudgetCents) *
        100
      : null;

  const fannieMaeCompliant =
    allocationPercent !== null ? allocationPercent >= 15 : null;
  const fannieMaeComplianceBasis =
    allocationPercent !== null
      ? "annual_budget_allocation"
      : studyMeta
        ? "annual_budget_allocation_unavailable"
        : null;

  const [overdueRow] = await db
    .select({
      totalCents:
        sql<number>`coalesce(sum(${assessments.amountCents}), 0)`.mapWith(
          Number,
        ),
    })
    .from(assessments)
    .where(
      and(
        eq(assessments.communityId, communityId),
        eq(assessments.status, "past_due"),
      ),
    )
    .limit(1);

  const overdueAssessmentsCents = overdueRow?.totalCents ?? 0;

  const [lastClose] = await db
    .select({
      periodYear: monthEndCloses.periodYear,
      periodMonth: monthEndCloses.periodMonth,
    })
    .from(monthEndCloses)
    .where(
      and(
        eq(monthEndCloses.communityId, communityId),
        eq(monthEndCloses.status, "complete"),
      ),
    )
    .orderBy(desc(monthEndCloses.periodYear), desc(monthEndCloses.periodMonth))
    .limit(1);

  const lastCloseMonth = lastClose
    ? `${lastClose.periodYear}-${String(lastClose.periodMonth).padStart(2, "0")}`
    : null;

  return {
    communityId,
    name: community.name,
    state: community.state,
    reservePctFunded,
    fannieMaeCompliant,
    fannieMaeComplianceBasis,
    overdueAssessmentsCents,
    lastCloseMonth,
  };
}

/**
 * Batch variant of getCommunityRollup — replaces the O(N) fan-out with a fixed
 * set of aggregating queries grouped by communityId. With N communities the
 * per-community path issues 5 queries each (N×5 total); this path issues 4
 * queries regardless of how many communities are in the portfolio.
 */
export async function getBatchCommunityRollup(
  db: Db,
  communityIds: string[],
): Promise<CommunityRollup[]> {
  if (communityIds.length === 0) return [];

  // 1. Community metadata
  const communityRows = await db
    .select({
      id: communities.id,
      name: communities.name,
      state: communities.state,
    })
    .from(communities)
    .where(inArray(communities.id, communityIds));

  const communityMap = new Map(communityRows.map((c) => [c.id, c]));

  // 2. Reserve study metadata per community (one study per community)
  const studyRows = await db
    .select({
      communityId: reserveStudies.communityId,
      id: reserveStudies.id,
      annualBudgetCents: reserveStudies.annualBudgetCents,
      annualReserveContributionCents:
        reserveStudies.annualReserveContributionCents,
    })
    .from(reserveStudies)
    .where(inArray(reserveStudies.communityId, communityIds));

  // Deduplicate to one study per community (first one wins, consistent with
  // the per-community implementation which uses .limit(1)).
  const studyByCommunity = new Map<string, (typeof studyRows)[number]>();
  for (const row of studyRows) {
    if (!studyByCommunity.has(row.communityId)) {
      studyByCommunity.set(row.communityId, row);
    }
  }

  // 3. Component aggregates grouped by studyId
  const studyIds = [...studyByCommunity.values()].map((s) => s.id);
  const componentRows =
    studyIds.length > 0
      ? await db
          .select({
            studyId: reserveComponents.studyId,
            currentReserveCents:
              sql<number>`coalesce(sum(${reserveComponents.currentReserveCents}), 0)`.mapWith(
                Number,
              ),
            replacementCostCents:
              sql<number>`coalesce(sum(${reserveComponents.replacementCostCents}), 0)`.mapWith(
                Number,
              ),
          })
          .from(reserveComponents)
          .where(inArray(reserveComponents.studyId, studyIds))
          .groupBy(reserveComponents.studyId)
      : [];

  const componentsByStudy = new Map(componentRows.map((r) => [r.studyId, r]));

  // 4. Overdue assessments aggregated by communityId
  const overdueRows = await db
    .select({
      communityId: assessments.communityId,
      totalCents:
        sql<number>`coalesce(sum(${assessments.amountCents}), 0)`.mapWith(
          Number,
        ),
    })
    .from(assessments)
    .where(
      and(
        inArray(assessments.communityId, communityIds),
        eq(assessments.status, "past_due"),
      ),
    )
    .groupBy(assessments.communityId);

  const overdueByComm = new Map(
    overdueRows.map((r) => [r.communityId, r.totalCents]),
  );

  // 5. Last completed month-end close per community — use a window function
  // to pick the most-recent row per community without issuing N queries.
  const lastCloseRows = await db
    .select({
      communityId: monthEndCloses.communityId,
      periodYear: monthEndCloses.periodYear,
      periodMonth: monthEndCloses.periodMonth,
    })
    .from(monthEndCloses)
    .where(
      and(
        inArray(monthEndCloses.communityId, communityIds),
        eq(monthEndCloses.status, "complete"),
      ),
    )
    .orderBy(desc(monthEndCloses.periodYear), desc(monthEndCloses.periodMonth));

  // Keep only the latest close per community. Compare period values explicitly
  // rather than trusting DB row arrival order, so the result is correct even if
  // the query planner returns rows in an unexpected order.
  const lastCloseByComm = new Map<
    string,
    { periodYear: number; periodMonth: number }
  >();
  for (const row of lastCloseRows) {
    const existing = lastCloseByComm.get(row.communityId);
    const isLater =
      !existing ||
      row.periodYear > existing.periodYear ||
      (row.periodYear === existing.periodYear &&
        row.periodMonth > existing.periodMonth);
    if (isLater) {
      lastCloseByComm.set(row.communityId, {
        periodYear: row.periodYear,
        periodMonth: row.periodMonth,
      });
    }
  }

  // Assemble results in the same order as the input communityIds.
  return communityIds.map((communityId) => {
    const community = communityMap.get(communityId);
    if (!community) {
      throw new Error(`Community not found: ${communityId}`);
    }

    const studyMeta = studyByCommunity.get(communityId);
    const components = studyMeta
      ? componentsByStudy.get(studyMeta.id)
      : undefined;
    const hasStudy =
      components !== undefined && components.replacementCostCents > 0;

    const reservePctFunded = hasStudy
      ? Math.round(
          (components.currentReserveCents / components.replacementCostCents) *
            100,
        )
      : null;

    const allocationPercent =
      studyMeta?.annualBudgetCents != null &&
      studyMeta.annualBudgetCents > 0 &&
      studyMeta.annualReserveContributionCents != null
        ? (studyMeta.annualReserveContributionCents /
            studyMeta.annualBudgetCents) *
          100
        : null;

    const fannieMaeCompliant =
      allocationPercent !== null ? allocationPercent >= 15 : null;
    const fannieMaeComplianceBasis =
      allocationPercent !== null
        ? "annual_budget_allocation"
        : studyMeta
          ? "annual_budget_allocation_unavailable"
          : null;

    const overdueAssessmentsCents = overdueByComm.get(communityId) ?? 0;

    const lastClose = lastCloseByComm.get(communityId);
    const lastCloseMonth = lastClose
      ? `${lastClose.periodYear}-${String(lastClose.periodMonth).padStart(2, "0")}`
      : null;

    return {
      communityId,
      name: community.name,
      state: community.state,
      reservePctFunded,
      fannieMaeCompliant,
      fannieMaeComplianceBasis:
        fannieMaeComplianceBasis as CommunityRollup["fannieMaeComplianceBasis"],
      overdueAssessmentsCents,
      lastCloseMonth,
    };
  });
}
