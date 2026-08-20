/**
 * Role-handoff report domain logic.
 * Assembles all data for a board role transition into a single PDF.
 */
import { eq, and, inArray, isNotNull, desc } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { boardTransitions } from "../../db/schema/governance.js";
import { meetings } from "../../db/schema/governance.js";
import { archRequests } from "../../db/schema/governance.js";
import { violations } from "../../db/schema/governance.js";
import { reconciliations } from "../../db/schema/bankRec.js";
import {
  reserveStudies,
  reserveComponents,
} from "../../db/schema/reserveStudy.js";
import { user } from "../../db/schema/auth.js";
import { trialBalance } from "./trialBalance.js";
import { buildPdf, type PdfRow } from "../exports/pdf.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function buildRoleHandoffReport(
  db: Db,
  communityId: string,
  transitionId: string,
): Promise<Uint8Array> {
  // Fetch the transition record with from/to user info
  const [transition] = await db
    .select({
      id: boardTransitions.id,
      role: boardTransitions.role,
      status: boardTransitions.status,
      pendingItems: boardTransitions.pendingItems,
      fromUserId: boardTransitions.fromUserId,
      toUserId: boardTransitions.toUserId,
    })
    .from(boardTransitions)
    .where(
      and(
        eq(boardTransitions.id, transitionId),
        eq(boardTransitions.communityId, communityId),
      ),
    )
    .limit(1);

  if (!transition) {
    throw new Error(`Transition ${transitionId} not found`);
  }

  if (transition.role !== "treasurer" && transition.role !== "secretary") {
    throw new Error(
      "Role handoff reports are supported only for treasurer and secretary roles.",
    );
  }

  // Fetch from user name
  let fromUserName = "N/A";
  if (transition.fromUserId) {
    const [fromUser] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, transition.fromUserId))
      .limit(1);
    if (fromUser) fromUserName = fromUser.name;
  }

  // Fetch to user name
  let toUserName = "N/A";
  if (transition.toUserId) {
    const [toUser] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, transition.toUserId))
      .limit(1);
    if (toUser) toUserName = toUser.name;
  }

  // Section 1: Transition metadata rows (shared for all roles)
  const pendingItemsList =
    transition.pendingItems && transition.pendingItems.length > 0
      ? transition.pendingItems.join(";")
      : "None";

  const metadataRows: PdfRow[] = [
    { field: "=== SECTION 1: TRANSITION METADATA ===", value: "" },
    { field: "Role", value: transition.role },
    { field: "From", value: fromUserName },
    { field: "To", value: toUserName },
    { field: "Status", value: transition.status },
    { field: "Pending Items", value: pendingItemsList },
  ];

  const roleRows: PdfRow[] = await buildRoleSpecificRows(
    db,
    communityId,
    transition.role,
  );

  const allRows: PdfRow[] = [...metadataRows, ...roleRows];

  return buildPdf({
    title: `Role Handoff Report — ${transition.role.charAt(0).toUpperCase() + transition.role.slice(1)}`,
    subtitle: `Transition ID: ${transitionId} | Generated: ${today()}`,
    columns: [
      { header: "Field", key: "field" },
      { header: "Value", key: "value" },
    ],
    rows: allRows,
  });
}

async function buildRoleSpecificRows(
  db: Db,
  communityId: string,
  role: string,
): Promise<PdfRow[]> {
  if (role === "treasurer") {
    return buildTreasurerRows(db, communityId);
  }
  if (role === "secretary") {
    return buildSecretaryRows(db, communityId);
  }
  return [];
}

async function buildTreasurerRows(
  db: Db,
  communityId: string,
): Promise<PdfRow[]> {
  const rows: PdfRow[] = [];

  // Section 2: Trial balance as of today
  rows.push({
    field: "=== SECTION 2: TRIAL BALANCE (AS OF TODAY) ===",
    value: "",
  });
  const asOf = today();
  const tbRows = await trialBalance(db, communityId, asOf);
  if (tbRows.length === 0) {
    rows.push({ field: "No accounts", value: "" });
  } else {
    for (const row of tbRows) {
      rows.push({
        field: `${row.accountCode} ${row.accountName} (${row.fundType})`,
        value: `Dr: $${(row.debitCents / 100).toFixed(2)} / Cr: $${(row.creditCents / 100).toFixed(2)}`,
      });
    }
  }

  // Section 3: Reserve study summary
  rows.push({ field: "=== SECTION 3: RESERVE STUDY SUMMARY ===", value: "" });
  const [study] = await db
    .select({
      id: reserveStudies.id,
      effectiveDate: reserveStudies.effectiveDate,
    })
    .from(reserveStudies)
    .where(eq(reserveStudies.communityId, communityId))
    .limit(1);

  if (!study) {
    rows.push({ field: "Reserve Study", value: "No reserve study on file" });
  } else {
    rows.push({ field: "Effective Date", value: study.effectiveDate });
    const components = await db
      .select({
        name: reserveComponents.name,
        replacementCostCents: reserveComponents.replacementCostCents,
        currentReserveCents: reserveComponents.currentReserveCents,
      })
      .from(reserveComponents)
      .where(eq(reserveComponents.studyId, study.id));

    const totalTarget = components.reduce(
      (sum, c) => sum + c.replacementCostCents,
      0,
    );
    const totalCurrent = components.reduce(
      (sum, c) => sum + c.currentReserveCents,
      0,
    );
    const fundedPercent =
      totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
    const reserveFundedTargetMet = fundedPercent >= 15 ? "Yes" : "No";

    rows.push({
      field: "Total Replacement Cost",
      value: `$${(totalTarget / 100).toFixed(2)}`,
    });
    rows.push({
      field: "Current Reserve Balance",
      value: `$${(totalCurrent / 100).toFixed(2)}`,
    });
    rows.push({ field: "Funded %", value: `${fundedPercent}%` });
    rows.push({
      field: "Reserve Funded >= 15% Target",
      value: reserveFundedTargetMet,
    });
  }

  // Section 4: Open bank reconciliations
  rows.push({
    field: "=== SECTION 4: OPEN BANK RECONCILIATIONS ===",
    value: "",
  });
  const openRecs = await db
    .select({
      id: reconciliations.id,
      statementId: reconciliations.statementId,
    })
    .from(reconciliations)
    .where(
      and(
        eq(reconciliations.communityId, communityId),
        eq(reconciliations.status, "open"),
      ),
    );

  if (openRecs.length === 0) {
    rows.push({ field: "Open Reconciliations", value: "None" });
  } else {
    for (const rec of openRecs) {
      rows.push({
        field: `Reconciliation ${rec.id}`,
        value: `Statement: ${rec.statementId}`,
      });
    }
  }

  return rows;
}

async function buildSecretaryRows(
  db: Db,
  communityId: string,
): Promise<PdfRow[]> {
  const rows: PdfRow[] = [];

  // Section 2: Last 3 finalized meetings with minutes
  rows.push({
    field: "=== SECTION 2: LAST 3 FINALIZED MEETINGS ===",
    value: "",
  });
  const finalizedMeetings = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      scheduledAt: meetings.scheduledAt,
      minutesText: meetings.minutesText,
      minutesFinalizedAt: meetings.minutesFinalizedAt,
    })
    .from(meetings)
    .where(
      and(
        eq(meetings.communityId, communityId),
        isNotNull(meetings.minutesFinalizedAt),
      ),
    )
    .orderBy(desc(meetings.scheduledAt))
    .limit(3);

  if (finalizedMeetings.length === 0) {
    rows.push({ field: "Finalized Meetings", value: "None" });
  } else {
    for (const meeting of finalizedMeetings) {
      const scheduledDate = meeting.scheduledAt
        ? meeting.scheduledAt.toISOString().slice(0, 10)
        : "Unknown";
      rows.push({ field: `Meeting: ${meeting.title}`, value: scheduledDate });
      if (meeting.minutesText) {
        const truncated =
          meeting.minutesText.length > 500
            ? meeting.minutesText.slice(0, 499) + "…"
            : meeting.minutesText;
        rows.push({ field: "Minutes", value: truncated });
      } else {
        rows.push({ field: "Minutes", value: "No minutes text" });
      }
    }
  }

  // Section 3: Open architectural requests
  rows.push({
    field: "=== SECTION 3: OPEN ARCHITECTURAL REQUESTS ===",
    value: "",
  });
  const openArchReqs = await db
    .select({
      id: archRequests.id,
      requestType: archRequests.requestType,
      description: archRequests.description,
      status: archRequests.status,
    })
    .from(archRequests)
    .where(
      and(
        eq(archRequests.communityId, communityId),
        inArray(archRequests.status, ["pending", "approved"]),
      ),
    );

  if (openArchReqs.length === 0) {
    rows.push({ field: "Open Arch Requests", value: "None" });
  } else {
    for (const req of openArchReqs) {
      rows.push({
        field: `${req.requestType} (${req.status})`,
        value: req.description,
      });
    }
  }

  // Section 4: Open violations
  rows.push({ field: "=== SECTION 4: OPEN VIOLATIONS ===", value: "" });
  const openViolations = await db
    .select({
      id: violations.id,
      title: violations.title,
      description: violations.description,
      status: violations.status,
    })
    .from(violations)
    .where(
      and(
        eq(violations.communityId, communityId),
        inArray(violations.status, ["open", "notified"]),
      ),
    );

  if (openViolations.length === 0) {
    rows.push({ field: "Open Violations", value: "None" });
  } else {
    for (const v of openViolations) {
      rows.push({
        field: `${v.title} (${v.status})`,
        value: v.description,
      });
    }
  }

  return rows;
}
