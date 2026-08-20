import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { communities } from "../../db/schema/tenancy.js";
import {
  reserveStudies,
  reserveComponents,
} from "../../db/schema/reserveStudy.js";
import { reconciliations, bankStatements } from "../../db/schema/bankRec.js";
import { meetings } from "../../db/schema/governance.js";
import { auditEvents } from "../../db/schema/audit.js";
import { generalLedger } from "./generalLedger.js";
import { trialBalance } from "./trialBalance.js";
import { balanceSheet } from "./balanceSheet.js";
import { incomeStatement } from "./incomeStatement.js";
import { buildPdf } from "../exports/pdf.js";
import { writeCsv } from "../exports/csv.js";
import { buildZip, type ZipPart } from "../exports/zip.js";
import { STATE_RESERVE_REQUIREMENTS } from "@boardstack/shared";
import type { AuditPackQuery } from "@boardstack/shared";

// ── Helper: format cents as dollars string ──────────────────────────────────
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── GL PDF/CSV ───────────────────────────────────────────────────────────────
async function buildGlParts(
  db: Db,
  communityId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ZipPart[]> {
  const { rows } = await generalLedger(db, communityId, periodStart, periodEnd);

  const glPdf = await buildPdf({
    title: "General Ledger",
    subtitle: `Period: ${periodStart} – ${periodEnd}`,
    columns: [
      { header: "Date", key: "entryDate" },
      { header: "Memo", key: "memo" },
      { header: "Account", key: "accountCode" },
      { header: "Fund", key: "fundType" },
      { header: "Debit", key: "debitCents" },
      { header: "Credit", key: "creditCents" },
      { header: "Balance", key: "runningBalanceCents" },
    ],
    rows: rows.map((r) => ({
      entryDate: r.entryDate,
      memo: r.memo,
      accountCode: `${r.accountCode} ${r.accountName}`,
      fundType: r.fundType,
      debitCents: formatCents(r.debitCents),
      creditCents: formatCents(r.creditCents),
      runningBalanceCents: formatCents(r.runningBalanceCents),
    })),
  });

  const glCsv = writeCsv(
    [
      "Entry ID",
      "Date",
      "Memo",
      "Account Code",
      "Account Name",
      "Fund",
      "Debit Cents",
      "Credit Cents",
      "Running Balance Cents",
    ],
    rows.map((r) => [
      r.entryId,
      r.entryDate,
      r.memo,
      r.accountCode,
      r.accountName,
      r.fundType,
      r.debitCents,
      r.creditCents,
      r.runningBalanceCents,
    ]),
  );

  return [
    { name: "general-ledger.pdf", content: glPdf },
    { name: "general-ledger.csv", content: glCsv },
  ];
}

// ── Trial Balance PDF/CSV ────────────────────────────────────────────────────
async function buildTrialBalanceParts(
  db: Db,
  communityId: string,
  periodEnd: string,
): Promise<ZipPart[]> {
  const rows = await trialBalance(db, communityId, periodEnd);

  const tbPdf = await buildPdf({
    title: "Trial Balance",
    subtitle: `As of ${periodEnd}`,
    columns: [
      { header: "Code", key: "accountCode" },
      { header: "Account", key: "accountName" },
      { header: "Type", key: "accountType" },
      { header: "Fund", key: "fundType" },
      { header: "Debit", key: "debitCents" },
      { header: "Credit", key: "creditCents" },
    ],
    rows: rows.map((r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: r.accountType,
      fundType: r.fundType,
      debitCents: formatCents(r.debitCents),
      creditCents: formatCents(r.creditCents),
    })),
  });

  const tbCsv = writeCsv(
    [
      "Account ID",
      "Code",
      "Account Name",
      "Account Type",
      "Fund Type",
      "Debit Cents",
      "Credit Cents",
    ],
    rows.map((r) => [
      r.accountId,
      r.accountCode,
      r.accountName,
      r.accountType,
      r.fundType,
      r.debitCents,
      r.creditCents,
    ]),
  );

  return [
    { name: "trial-balance.pdf", content: tbPdf },
    { name: "trial-balance.csv", content: tbCsv },
  ];
}

// ── Balance Sheet PDF/CSV ────────────────────────────────────────────────────
async function buildBalanceSheetParts(
  db: Db,
  communityId: string,
  periodEnd: string,
): Promise<ZipPart[]> {
  const data = await balanceSheet(db, communityId, periodEnd);

  const flatRows = data.sections.flatMap((s) =>
    s.accounts.map((a) => ({
      fundType: s.fundType,
      accountType: s.accountType,
      accountCode: a.accountCode,
      accountName: a.accountName,
      balance: formatCents(a.balanceCents),
    })),
  );

  const bsPdf = await buildPdf({
    title: "Balance Sheet",
    subtitle: `As of ${data.asOf}`,
    columns: [
      { header: "Fund", key: "fundType" },
      { header: "Type", key: "accountType" },
      { header: "Code", key: "accountCode" },
      { header: "Account", key: "accountName" },
      { header: "Balance", key: "balance" },
    ],
    rows: flatRows,
  });

  const bsCsv = writeCsv(
    [
      "Fund Type",
      "Account Type",
      "Account Code",
      "Account Name",
      "Balance Cents",
    ],
    data.sections.flatMap((s) =>
      s.accounts.map((a) => [
        s.fundType,
        s.accountType,
        a.accountCode,
        a.accountName,
        a.balanceCents,
      ]),
    ),
  );

  return [
    { name: "balance-sheet.pdf", content: bsPdf },
    { name: "balance-sheet.csv", content: bsCsv },
  ];
}

// ── Income Statement PDF/CSV ─────────────────────────────────────────────────
async function buildIncomeStatementParts(
  db: Db,
  communityId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ZipPart[]> {
  const data = await incomeStatement(db, communityId, periodStart, periodEnd);

  const isPdf = await buildPdf({
    title: "Income Statement",
    subtitle: `Period: ${data.from} – ${data.to}`,
    columns: [
      { header: "Fund", key: "fundType" },
      { header: "Type", key: "accountType" },
      { header: "Code", key: "accountCode" },
      { header: "Account", key: "accountName" },
      { header: "Amount", key: "amount" },
    ],
    rows: data.lines.map((l) => ({
      fundType: l.fundType,
      accountType: l.accountType,
      accountCode: l.accountCode,
      accountName: l.accountName,
      amount: formatCents(l.amountCents),
    })),
  });

  const isCsv = writeCsv(
    [
      "Fund Type",
      "Account Type",
      "Account Code",
      "Account Name",
      "Amount Cents",
    ],
    data.lines.map((l) => [
      l.fundType,
      l.accountType,
      l.accountCode,
      l.accountName,
      l.amountCents,
    ]),
  );

  return [
    { name: "income-statement.pdf", content: isPdf },
    { name: "income-statement.csv", content: isCsv },
  ];
}

// ── Reserve Study Snapshot CSV ───────────────────────────────────────────────
async function buildReserveStudyCsv(
  db: Db,
  communityId: string,
): Promise<ZipPart> {
  const rows = await db
    .select({
      studyId: reserveStudies.id,
      effectiveDate: reserveStudies.effectiveDate,
      methodology: reserveStudies.methodology,
      notes: reserveStudies.notes,
      componentId: reserveComponents.id,
      componentName: reserveComponents.name,
      usefulLifeYears: reserveComponents.usefulLifeYears,
      remainingLifeYears: reserveComponents.remainingLifeYears,
      replacementCostCents: reserveComponents.replacementCostCents,
      currentReserveCents: reserveComponents.currentReserveCents,
    })
    .from(reserveStudies)
    .leftJoin(
      reserveComponents,
      eq(reserveComponents.studyId, reserveStudies.id),
    )
    .where(eq(reserveStudies.communityId, communityId));

  const csv = writeCsv(
    [
      "Study ID",
      "Effective Date",
      "Methodology",
      "Notes",
      "Component ID",
      "Component Name",
      "Useful Life (yrs)",
      "Remaining Life (yrs)",
      "Replacement Cost ($)",
      "Current Reserve ($)",
    ],
    rows.length === 0
      ? [["No data.", "", "", "", "", "", "", "", "", ""]]
      : rows.map((r) => [
          r.studyId,
          r.effectiveDate,
          r.methodology ?? "",
          r.notes ?? "",
          r.componentId ?? "",
          r.componentName ?? "",
          r.usefulLifeYears ?? "",
          r.remainingLifeYears ?? "",
          r.replacementCostCents != null ? r.replacementCostCents / 100 : "",
          r.currentReserveCents != null ? r.currentReserveCents / 100 : "",
        ]),
  );

  return { name: "reserve-study-snapshot.csv", content: csv };
}

// ── Bank Reconciliation PDFs ─────────────────────────────────────────────────
type ReconRow = {
  reconId: string;
  finalizedAt: Date;
  statementDate: string;
  beginningBalanceCents: number;
  endingBalanceCents: number;
};

async function buildReconParts(
  db: Db,
  communityId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ZipPart[]> {
  const rows = await db
    .select({
      reconId: reconciliations.id,
      finalizedAt: reconciliations.finalizedAt,
      statementDate: bankStatements.statementDate,
      beginningBalanceCents: bankStatements.beginningBalanceCents,
      endingBalanceCents: bankStatements.endingBalanceCents,
    })
    .from(reconciliations)
    .innerJoin(
      bankStatements,
      eq(bankStatements.id, reconciliations.statementId),
    )
    .where(
      and(
        eq(reconciliations.communityId, communityId),
        isNotNull(reconciliations.finalizedAt),
        gte(
          reconciliations.finalizedAt,
          new Date(`${periodStart}T00:00:00.000Z`),
        ),
        lte(
          reconciliations.finalizedAt,
          new Date(`${periodEnd}T23:59:59.999Z`),
        ),
      ),
    );

  const parts: ZipPart[] = [];
  for (const recon of rows as ReconRow[]) {
    const pdf = await buildPdf({
      title: `Bank Reconciliation`,
      subtitle: `Statement Date: ${recon.statementDate} | Finalized: ${recon.finalizedAt.toISOString().slice(0, 10)}`,
      columns: [
        { header: "Item", key: "item" },
        { header: "Amount", key: "amount" },
      ],
      rows: [
        {
          item: "Beginning Balance",
          amount: formatCents(recon.beginningBalanceCents),
        },
        {
          item: "Ending Balance",
          amount: formatCents(recon.endingBalanceCents),
        },
        { item: "Reconciliation ID", amount: recon.reconId },
      ],
    });
    parts.push({
      name: `bank-reconciliations/recon-${recon.reconId}.pdf`,
      content: pdf,
    });
  }

  return parts;
}

// ── Meeting Minutes PDFs ─────────────────────────────────────────────────────
type MeetingRow = {
  id: string;
  title: string;
  meetingType: string;
  scheduledAt: Date;
  minutesText: string | null;
  minutesFinalizedAt: Date | null;
};

async function buildMeetingParts(
  db: Db,
  communityId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ZipPart[]> {
  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      meetingType: meetings.meetingType,
      scheduledAt: meetings.scheduledAt,
      minutesText: meetings.minutesText,
      minutesFinalizedAt: meetings.minutesFinalizedAt,
    })
    .from(meetings)
    .where(
      and(
        eq(meetings.communityId, communityId),
        isNotNull(meetings.minutesFinalizedAt),
        gte(
          meetings.minutesFinalizedAt,
          new Date(`${periodStart}T00:00:00.000Z`),
        ),
        lte(
          meetings.minutesFinalizedAt,
          new Date(`${periodEnd}T23:59:59.999Z`),
        ),
      ),
    );

  const parts: ZipPart[] = [];
  for (const meeting of rows as MeetingRow[]) {
    const pdf = await buildPdf({
      title: `Meeting Minutes: ${meeting.title}`,
      subtitle: `Type: ${meeting.meetingType} | Scheduled: ${meeting.scheduledAt.toISOString().slice(0, 10)}`,
      columns: [{ header: "Minutes", key: "minutes" }],
      rows: meeting.minutesText
        ? [{ minutes: meeting.minutesText }]
        : [{ minutes: "No minutes recorded." }],
    });
    parts.push({ name: `meeting-minutes/${meeting.id}.pdf`, content: pdf });
  }

  return parts;
}

// ── Compliance Attestations PDF ──────────────────────────────────────────────
async function buildCompliancePdf(
  db: Db,
  communityId: string,
): Promise<ZipPart> {
  const [community] = await db
    .select({
      id: communities.id,
      state: communities.state,
      name: communities.name,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const stateCode = community?.state ?? null;
  const stateRule = stateCode ? STATE_RESERVE_REQUIREMENTS[stateCode] : null;

  let rows: Array<Record<string, string>>;

  if (!stateRule) {
    rows = [
      {
        requirement: "State",
        value: stateCode ?? "Unknown",
        status: "N/A",
        notes:
          "Compliance rules not loaded. Verify state requirements manually.",
      },
    ];
  } else {
    rows = [
      {
        requirement: "Reserve Study Required",
        value: stateRule.reserveStudyRequired ? "Yes" : "No",
        status: stateRule.reserveStudyRequired ? "REQUIRED" : "NOT REQUIRED",
        notes: stateRule.notes ?? "",
      },
      {
        requirement: "Reserve Study Frequency (years)",
        value:
          stateRule.reserveStudyFrequencyYears != null
            ? String(stateRule.reserveStudyFrequencyYears)
            : "Not specified",
        status: "INFO",
        notes: stateRule.statuteCitation ?? "",
      },
      {
        requirement: "Minimum Funding Percent",
        value:
          stateRule.minimumFundingPercent != null
            ? `${stateRule.minimumFundingPercent}%`
            : "No state minimum specified",
        status: "INFO",
        notes: "",
      },
      {
        requirement: "Commingling Prohibited",
        value: stateRule.commingleProhibited ? "Yes" : "No",
        status: stateRule.commingleProhibited
          ? "PROHIBITED"
          : "NOT EXPLICITLY PROHIBITED",
        notes:
          "Gavelhouse enforces operating/reserve fund separation at the DB layer.",
      },
    ];
  }

  const pdf = await buildPdf({
    title: "Compliance Attestations",
    subtitle: `Community: ${community?.name ?? communityId} | State: ${stateCode ?? "Unknown"}`,
    columns: [
      { header: "Requirement", key: "requirement" },
      { header: "Value", key: "value" },
      { header: "Status", key: "status" },
      { header: "Notes", key: "notes" },
    ],
    rows,
  });

  return { name: "compliance-attestations.pdf", content: pdf };
}

// ── Audit Trail CSV ──────────────────────────────────────────────────────────
async function buildAuditTrailCsv(
  db: Db,
  communityId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ZipPart> {
  const rows = await db
    .select({
      id: auditEvents.id,
      communityId: auditEvents.communityId,
      actorUserId: auditEvents.actorUserId,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      occurredAt: auditEvents.occurredAt,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.communityId, communityId),
        gte(auditEvents.occurredAt, new Date(periodStart)),
        lte(auditEvents.occurredAt, new Date(`${periodEnd}T23:59:59.999Z`)),
      ),
    )
    .orderBy(asc(auditEvents.occurredAt));

  const csv = writeCsv(
    [
      "Event ID",
      "Community ID",
      "Actor User ID",
      "Action",
      "Entity Type",
      "Entity ID",
      "Occurred At",
    ],
    rows.length === 0
      ? [["No data.", "", "", "", "", "", ""]]
      : rows.map((r) => [
          r.id,
          r.communityId,
          r.actorUserId ?? "",
          r.action,
          r.entityType,
          r.entityId,
          r.occurredAt.toISOString(),
        ]),
  );

  return { name: "audit-trail.csv", content: csv };
}

// ── README.txt ───────────────────────────────────────────────────────────────
function buildReadme(
  communityId: string,
  periodStart: string,
  periodEnd: string,
  parts: ZipPart[],
): ZipPart {
  const encoder = new TextEncoder();
  const lines: string[] = [
    "Gavelhouse Audit Pack",
    "=====================",
    "",
    `Community ID : ${communityId}`,
    `Period Start : ${periodStart}`,
    `Period End   : ${periodEnd}`,
    `Generated At : ${new Date().toISOString()}`,
    "",
    "Included Files",
    "--------------",
  ];

  for (const part of parts) {
    const sizeBytes =
      typeof part.content === "string"
        ? encoder.encode(part.content).length
        : part.content.length;
    lines.push(`  ${part.name} (${sizeBytes} bytes)`);
  }

  lines.push("");
  lines.push(
    "This archive was generated by Gavelhouse for audit and compliance purposes.",
  );

  return { name: "README.txt", content: lines.join("\n") };
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function buildAuditPack(
  db: Db,
  query: AuditPackQuery,
): Promise<ReadableStream<Uint8Array>> {
  const { communityId, periodStart, periodEnd } = query;

  // Build all parts sequentially to keep db query ordering deterministic
  // and to avoid overwhelming the connection pool.
  const compliancePdf = await buildCompliancePdf(db, communityId);
  const reserveCsv = await buildReserveStudyCsv(db, communityId);
  const reconParts = await buildReconParts(
    db,
    communityId,
    periodStart,
    periodEnd,
  );
  const meetingParts = await buildMeetingParts(
    db,
    communityId,
    periodStart,
    periodEnd,
  );
  const auditCsv = await buildAuditTrailCsv(
    db,
    communityId,
    periodStart,
    periodEnd,
  );

  // These use the domain query helpers (not raw db calls) — run in parallel
  const [glParts, tbParts, bsParts, isParts] = await Promise.all([
    buildGlParts(db, communityId, periodStart, periodEnd),
    buildTrialBalanceParts(db, communityId, periodEnd),
    buildBalanceSheetParts(db, communityId, periodEnd),
    buildIncomeStatementParts(db, communityId, periodStart, periodEnd),
  ]);

  const contentParts: ZipPart[] = [
    ...glParts,
    ...tbParts,
    ...bsParts,
    ...isParts,
    reserveCsv,
    ...reconParts,
    ...meetingParts,
    compliancePdf,
    auditCsv,
  ];

  const readme = buildReadme(communityId, periodStart, periodEnd, contentParts);
  const allParts = [...contentParts, readme];

  return buildZip(allParts);
}
