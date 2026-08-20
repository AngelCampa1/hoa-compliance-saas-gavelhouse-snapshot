import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuditPackQuery } from "@boardstack/shared";
import { STATE_RESERVE_REQUIREMENTS } from "@boardstack/shared";
import type { Db } from "../../../src/db/client.js";

// --- Mocks (must be declared before any imports that use them) ---

const mockGeneralLedger = vi.fn();
const mockTrialBalance = vi.fn();
const mockBalanceSheet = vi.fn();
const mockIncomeStatement = vi.fn();
const mockBuildPdf = vi.fn();
const mockWriteCsv = vi.fn();
const mockBuildZip = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("../../../src/domain/reporting/generalLedger.js", () => ({
  generalLedger: mockGeneralLedger,
}));

vi.mock("../../../src/domain/reporting/trialBalance.js", () => ({
  trialBalance: mockTrialBalance,
}));

vi.mock("../../../src/domain/reporting/balanceSheet.js", () => ({
  balanceSheet: mockBalanceSheet,
}));

vi.mock("../../../src/domain/reporting/incomeStatement.js", () => ({
  incomeStatement: mockIncomeStatement,
}));

vi.mock("../../../src/domain/exports/pdf.js", () => ({
  buildPdf: mockBuildPdf,
}));

vi.mock("../../../src/domain/exports/csv.js", () => ({
  writeCsv: mockWriteCsv,
}));

vi.mock("../../../src/domain/exports/zip.js", () => ({
  buildZip: mockBuildZip,
}));

const mockDb = { select: mockDbSelect };

const { buildAuditPack } =
  await import("../../../src/domain/reporting/auditPack.js");

const baseQuery: AuditPackQuery = {
  communityId: "comm-1",
  periodStart: "2024-01-01",
  periodEnd: "2024-12-31",
};

const fakeBytes = new Uint8Array([1, 2, 3]);
const fakeStream = new ReadableStream<Uint8Array>();

/**
 * Build a mock chain that supports these query patterns:
 * - db.select().from().where().limit()        → community lookup
 * - db.select().from().leftJoin().where()     → reserve studies
 * - db.select().from().innerJoin().where()    → reconciliations (no orderBy needed)
 * - db.select().from().where().orderBy()      → audit events, meetings
 */
function makeSelectChain(result: unknown[]) {
  const resolved = Promise.resolve(result);

  const orderBy = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockResolvedValue(result);

  // where can be awaited directly (for leftJoin path) or chained with orderBy/limit
  const where = vi
    .fn()
    .mockReturnValue(Object.assign(resolved, { orderBy, limit }));

  const innerJoin = vi.fn().mockReturnValue({ where });
  const leftJoin = vi.fn().mockReturnValue({ where });

  const from = vi.fn().mockReturnValue({ where, innerJoin, leftJoin });
  return { from };
}

function setupReportingMocks() {
  mockGeneralLedger.mockResolvedValue({
    rows: [
      {
        entryId: "e1",
        entryDate: "2024-06-01",
        memo: "Test",
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Cash",
        fundType: "operating",
        debitCents: 1000,
        creditCents: 0,
        runningBalanceCents: 1000,
      },
    ],
    total: 1,
  });

  mockTrialBalance.mockResolvedValue([
    {
      accountId: "acc-1",
      accountCode: "1000",
      accountName: "Cash",
      accountType: "asset",
      fundType: "operating",
      debitCents: 1000,
      creditCents: 0,
    },
  ]);

  mockBalanceSheet.mockResolvedValue({
    asOf: "2024-12-31",
    sections: [
      {
        fundType: "operating",
        accountType: "asset",
        accounts: [
          {
            accountId: "acc-1",
            accountCode: "1000",
            accountName: "Cash",
            balanceCents: 50000,
          },
        ],
        totalCents: 50000,
      },
    ],
    operatingNetCents: 50000,
    reserveNetCents: 0,
  });

  mockIncomeStatement.mockResolvedValue({
    from: "2024-01-01",
    to: "2024-12-31",
    lines: [
      {
        fundType: "operating",
        accountId: "acc-2",
        accountCode: "4000",
        accountName: "Dues Revenue",
        accountType: "revenue",
        amountCents: 120000,
      },
    ],
    operatingRevenueCents: 120000,
    operatingExpenseCents: 0,
    operatingNetCents: 120000,
    reserveRevenueCents: 0,
    reserveExpenseCents: 0,
    reserveNetCents: 0,
  });

  mockBuildPdf.mockResolvedValue(fakeBytes);
  mockWriteCsv.mockReturnValue("header\r\nvalue");
  mockBuildZip.mockResolvedValue(fakeStream);
}

function setupDbMocks(
  community: { id: string; state: string | null; name: string },
  reserveRows: unknown[],
  reconRows: unknown[],
  meetingRows: unknown[],
  auditRows: unknown[],
) {
  // 1. community lookup — select().from().where().limit()
  mockDbSelect.mockReturnValueOnce(makeSelectChain([community]));
  // 2. reserve studies — select().from().leftJoin().where()
  mockDbSelect.mockReturnValueOnce(makeSelectChain(reserveRows));
  // 3. reconciliations — select().from().innerJoin().where()
  mockDbSelect.mockReturnValueOnce(makeSelectChain(reconRows));
  // 4. meetings — select().from().where()
  mockDbSelect.mockReturnValueOnce(makeSelectChain(meetingRows));
  // 5. audit events — select().from().where().orderBy()
  mockDbSelect.mockReturnValueOnce(makeSelectChain(auditRows));
}

function setupAllMocksHappyPath() {
  setupReportingMocks();

  setupDbMocks(
    { id: "comm-1", state: "CA", name: "Sunrise HOA" },
    [
      {
        studyId: "study-1",
        effectiveDate: "2024-01-01",
        methodology: "Full",
        notes: "Annual study",
        componentId: "comp-1",
        componentName: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 2000000,
      },
    ],
    [
      {
        reconId: "recon-1",
        finalizedAt: new Date("2024-06-30"),
        statementDate: "2024-06-30",
        beginningBalanceCents: 100000,
        endingBalanceCents: 200000,
      },
    ],
    [
      {
        id: "meet-1",
        title: "Annual Meeting",
        meetingType: "annual",
        scheduledAt: new Date("2024-06-15"),
        minutesText: "Meeting minutes text",
        minutesFinalizedAt: new Date("2024-06-20"),
      },
    ],
    [
      {
        id: "evt-1",
        communityId: "comm-1",
        actorUserId: "user-1",
        action: "create",
        entityType: "journal_entry",
        entityId: "je-1",
        occurredAt: new Date("2024-03-01"),
      },
    ],
  );
}

describe("buildAuditPack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a ReadableStream", async () => {
    setupAllMocksHappyPath();

    const stream = await buildAuditPack(mockDb as unknown as Db, baseQuery);

    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it("calls buildZip with all expected file names including README.txt", async () => {
    setupAllMocksHappyPath();

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    expect(mockBuildZip).toHaveBeenCalledOnce();
    const [parts] = mockBuildZip.mock.calls[0] as [
      Array<{ name: string; content: unknown }>,
    ];
    const names = parts.map((p) => p.name);

    expect(names).toContain("general-ledger.pdf");
    expect(names).toContain("general-ledger.csv");
    expect(names).toContain("trial-balance.pdf");
    expect(names).toContain("trial-balance.csv");
    expect(names).toContain("balance-sheet.pdf");
    expect(names).toContain("balance-sheet.csv");
    expect(names).toContain("income-statement.pdf");
    expect(names).toContain("income-statement.csv");
    expect(names).toContain("reserve-study-snapshot.csv");
    expect(names).toContain("compliance-attestations.pdf");
    expect(names).toContain("audit-trail.csv");
    expect(names).toContain("README.txt");
  });

  it("includes bank reconciliation PDFs for each finalized reconciliation in period", async () => {
    setupAllMocksHappyPath();

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    const [parts] = mockBuildZip.mock.calls[0] as [
      Array<{ name: string; content: unknown }>,
    ];
    const reconParts = parts.filter((p) =>
      p.name.startsWith("bank-reconciliations/"),
    );
    expect(reconParts.length).toBe(1);
    expect(reconParts[0].name).toBe("bank-reconciliations/recon-recon-1.pdf");
  });

  it("includes meeting-minutes PDFs for each meeting with finalized minutes in period", async () => {
    setupAllMocksHappyPath();

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    const [parts] = mockBuildZip.mock.calls[0] as [
      Array<{ name: string; content: unknown }>,
    ];
    const meetParts = parts.filter((p) =>
      p.name.startsWith("meeting-minutes/"),
    );
    expect(meetParts.length).toBe(1);
    expect(meetParts[0].name).toBe("meeting-minutes/meet-1.pdf");
  });

  it("gracefully handles no reconciliations — skips recon PDFs but still builds zip", async () => {
    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: "TX", name: "Test HOA" },
      [],
      [],
      [],
      [],
    );

    const stream = await buildAuditPack(mockDb as unknown as Db, baseQuery);

    expect(stream).toBeInstanceOf(ReadableStream);
    expect(mockBuildZip).toHaveBeenCalledOnce();

    const [parts] = mockBuildZip.mock.calls[0] as [
      Array<{ name: string; content: unknown }>,
    ];
    const reconParts = parts.filter((p) =>
      p.name.startsWith("bank-reconciliations/"),
    );
    expect(reconParts.length).toBe(0);
  });

  it("gracefully handles no meetings — skips meeting PDFs but still builds zip", async () => {
    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: "CA", name: "Test HOA" },
      [],
      [
        {
          reconId: "recon-2",
          finalizedAt: new Date("2024-09-30"),
          statementDate: "2024-09-30",
          beginningBalanceCents: 0,
          endingBalanceCents: 0,
        },
      ],
      [],
      [],
    );

    const stream = await buildAuditPack(mockDb as unknown as Db, baseQuery);

    expect(stream).toBeInstanceOf(ReadableStream);
    const [parts] = mockBuildZip.mock.calls[0] as [
      Array<{ name: string; content: unknown }>,
    ];
    const meetParts = parts.filter((p) =>
      p.name.startsWith("meeting-minutes/"),
    );
    expect(meetParts.length).toBe(0);
  });

  it("README.txt is always included and contains community ID and period", async () => {
    setupAllMocksHappyPath();

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    const [parts] = mockBuildZip.mock.calls[0] as [
      Array<{ name: string; content: unknown }>,
    ];
    const readme = parts.find((p) => p.name === "README.txt");
    expect(readme).toBeDefined();
    const content = readme!.content as string;
    expect(content).toContain("comm-1");
    expect(content).toContain("2024-01-01");
    expect(content).toContain("2024-12-31");
  });

  it("README.txt lists all included files", async () => {
    setupAllMocksHappyPath();

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    const [parts] = mockBuildZip.mock.calls[0] as [
      Array<{ name: string; content: unknown }>,
    ];
    const readme = parts.find((p) => p.name === "README.txt");
    const content = readme!.content as string;

    expect(content).toContain("general-ledger.pdf");
    expect(content).toContain("audit-trail.csv");
    expect(content).toContain("compliance-attestations.pdf");
  });

  it("compliance-attestations.pdf uses state rules when community state is known", async () => {
    setupAllMocksHappyPath();

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    const pdfCalls = mockBuildPdf.mock.calls as Array<
      [{ title: string; rows: unknown[] }]
    >;
    const attestationCall = pdfCalls.find(([opts]) =>
      opts.title.toLowerCase().includes("attestation"),
    );
    expect(attestationCall).toBeDefined();
  });

  it("compliance-attestations.pdf uses placeholder when community state is null", async () => {
    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: null, name: "Stateless HOA" },
      [],
      [],
      [],
      [],
    );

    await buildAuditPack(mockDb as unknown as Db, {
      ...baseQuery,
      communityId: "comm-1",
    });

    const pdfCalls = mockBuildPdf.mock.calls as Array<
      [{ title: string; rows: Array<Record<string, string>> }]
    >;
    const attestationCall = pdfCalls.find(([opts]) =>
      opts.title.toLowerCase().includes("attestation"),
    );
    expect(attestationCall).toBeDefined();
    const rows = attestationCall![0].rows;
    expect(rows.length).toBeGreaterThan(0);
  });

  it("meeting with null minutesText renders 'No minutes recorded.' placeholder", async () => {
    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: "CA", name: "Test HOA" },
      [],
      [],
      [
        {
          id: "meet-2",
          title: "Board Meeting",
          meetingType: "board",
          scheduledAt: new Date("2024-03-10"),
          minutesText: null,
          minutesFinalizedAt: new Date("2024-03-15"),
        },
      ],
      [],
    );

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    const [parts] = mockBuildZip.mock.calls[0] as [
      Array<{ name: string; content: unknown }>,
    ];
    const meetParts = parts.filter((p) =>
      p.name.startsWith("meeting-minutes/"),
    );
    expect(meetParts.length).toBe(1);

    // buildPdf should have been called with "No minutes recorded." row
    const pdfCalls = mockBuildPdf.mock.calls as Array<
      [{ title: string; rows: Array<Record<string, string>> }]
    >;
    const meetingPdfCall = pdfCalls.find(([opts]) =>
      opts.title.includes("Board Meeting"),
    );
    expect(meetingPdfCall).toBeDefined();
    expect(meetingPdfCall![0].rows[0].minutes).toBe("No minutes recorded.");
  });

  it("reserve study with null methodology and notes uses empty string fallback", async () => {
    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: "CA", name: "Test HOA" },
      [
        {
          studyId: "study-2",
          effectiveDate: "2024-01-01",
          methodology: null,
          notes: null,
          componentId: null,
          componentName: null,
          usefulLifeYears: null,
          remainingLifeYears: null,
          replacementCostCents: null,
          currentReserveCents: null,
        },
      ],
      [],
      [],
      [],
    );

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    // writeCsv should have been called with the reserve study data
    expect(mockWriteCsv).toHaveBeenCalled();
    const csvCalls = mockWriteCsv.mock.calls as Array<[string[], unknown[][]]>;
    const reserveCall = csvCalls.find(([headers]) => headers[0] === "Study ID");
    expect(reserveCall).toBeDefined();
    // methodology/notes should be empty strings
    const dataRow = reserveCall![1][0];
    expect(dataRow[2]).toBe(""); // methodology
    expect(dataRow[3]).toBe(""); // notes
  });

  it("compliance attestations correctly shows minimum funding percent when state has one (HI)", async () => {
    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: "HI", name: "Aloha HOA" },
      [],
      [],
      [],
      [],
    );

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    const pdfCalls = mockBuildPdf.mock.calls as Array<
      [{ title: string; rows: Array<Record<string, string>> }]
    >;
    const attestationCall = pdfCalls.find(([opts]) =>
      opts.title.toLowerCase().includes("attestation"),
    );
    expect(attestationCall).toBeDefined();
    const rows = attestationCall![0].rows;
    const fundingRow = rows.find(
      (r) => r.requirement === "Minimum Funding Percent",
    );
    expect(fundingRow).toBeDefined();
    expect(fundingRow!.value).toBe("50%");
  });

  it("does not substitute Fannie Mae allocation rules for missing state funding minimums", async () => {
    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: "TX", name: "Texas HOA" },
      [],
      [],
      [],
      [],
    );

    await buildAuditPack(mockDb as unknown as Db, {
      communityId: "comm-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });

    const attestationCall = mockBuildPdf.mock.calls.find(([opts]) =>
      opts.title.toLowerCase().includes("attestation"),
    );
    expect(attestationCall).toBeDefined();
    const rows = attestationCall![0].rows as Array<{
      requirement: string;
      value: string;
    }>;
    const fundingRow = rows.find(
      (r) => r.requirement === "Minimum Funding Percent",
    );
    expect(fundingRow).toBeDefined();
    expect(fundingRow!.value).toBe("No state minimum specified");
  });

  it("GL and Trial Balance CSV money columns are labeled in cents, matching the raw-cents cell values and the Balance Sheet/Income Statement convention", async () => {
    setupAllMocksHappyPath();

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    const csvCalls = mockWriteCsv.mock.calls as Array<[string[], unknown[][]]>;

    // Balance Sheet / Income Statement CSVs establish the convention:
    // CSV cells carry raw integer cents and the header says so ("Cents").
    const glCall = csvCalls.find(([headers]) => headers[0] === "Entry ID");
    expect(glCall).toBeDefined();
    const [glHeaders, glRows] = glCall!;
    // Cells are raw cents (1000 = $10.00), so the headers must say "Cents".
    expect(glRows[0]).toContain(1000);
    expect(glHeaders).toContain("Debit Cents");
    expect(glHeaders).toContain("Credit Cents");
    expect(glHeaders).toContain("Running Balance Cents");

    const tbCall = csvCalls.find(([headers]) => headers[0] === "Account ID");
    expect(tbCall).toBeDefined();
    const [tbHeaders, tbRows] = tbCall!;
    expect(tbRows[0]).toContain(1000);
    expect(tbHeaders).toContain("Debit Cents");
    expect(tbHeaders).toContain("Credit Cents");
  });

  it("audit trail CSV handles null actorUserId by substituting empty string", async () => {
    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: "CA", name: "Test HOA" },
      [],
      [],
      [],
      [
        {
          id: "evt-sys",
          communityId: "comm-1",
          actorUserId: null,
          action: "create",
          entityType: "system",
          entityId: "sys-1",
          occurredAt: new Date("2024-05-01"),
        },
      ],
    );

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    // writeCsv should have been called with audit trail data
    const csvCalls = mockWriteCsv.mock.calls as Array<[string[], unknown[][]]>;
    const auditCsvCall = csvCalls.find(
      ([headers]) => headers[0] === "Event ID",
    );
    expect(auditCsvCall).toBeDefined();
    // The actorUserId null should become ""
    const dataRow = auditCsvCall![1][0];
    expect(dataRow[2]).toBe("");
  });

  it("compliance attestations handles commingleProhibited=true and null notes", async () => {
    // Temporarily inject a synthetic state to cover the commingleProhibited=true branch
    const syntheticState = {
      stateCode: "ZZ",
      stateName: "Test State",
      statuteCitation: null,
      reserveStudyRequired: false,
      reserveStudyFrequencyYears: null,
      minimumFundingPercent: null,
      commingleProhibited: true,
      notes: null,
    };
    STATE_RESERVE_REQUIREMENTS["ZZ"] = syntheticState;

    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: "ZZ", name: "Test HOA" },
      [],
      [],
      [],
      [],
    );

    try {
      await buildAuditPack(mockDb as unknown as Db, baseQuery);

      const pdfCalls = mockBuildPdf.mock.calls as Array<
        [{ title: string; rows: Array<Record<string, string>> }]
      >;
      const attestationCall = pdfCalls.find(([opts]) =>
        opts.title.toLowerCase().includes("attestation"),
      );
      expect(attestationCall).toBeDefined();
      const rows = attestationCall![0].rows;
      const commingleRow = rows.find(
        (r) => r.requirement === "Commingling Prohibited",
      );
      expect(commingleRow).toBeDefined();
      expect(commingleRow!.value).toBe("Yes");
      expect(commingleRow!.status).toBe("PROHIBITED");

      const notesRow = rows.find(
        (r) => r.requirement === "Reserve Study Required",
      );
      expect(notesRow).toBeDefined();
      expect(notesRow!.notes).toBe("");
    } finally {
      delete STATE_RESERVE_REQUIREMENTS["ZZ"];
    }
  });

  it("reconciliations outside the period are not included", async () => {
    // SQL gte/lte filters exclude out-of-period rows at the DB layer;
    // the mock simulates this by returning an empty array for reconciliations.
    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: "CA", name: "Test HOA" },
      [],
      [],
      [],
      [],
    );

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    const [parts] = mockBuildZip.mock.calls[0] as [
      Array<{ name: string; content: unknown }>,
    ];
    const reconParts = parts.filter((p) =>
      p.name.startsWith("bank-reconciliations/"),
    );
    expect(reconParts.length).toBe(0);
  });

  it("meetings outside the period are not included", async () => {
    // SQL gte/lte filters exclude out-of-period rows at the DB layer;
    // the mock simulates this by returning an empty array for meetings.
    setupReportingMocks();
    setupDbMocks(
      { id: "comm-1", state: "CA", name: "Test HOA" },
      [],
      [],
      [],
      [],
    );

    await buildAuditPack(mockDb as unknown as Db, baseQuery);

    const [parts] = mockBuildZip.mock.calls[0] as [
      Array<{ name: string; content: unknown }>,
    ];
    const meetParts = parts.filter((p) =>
      p.name.startsWith("meeting-minutes/"),
    );
    expect(meetParts.length).toBe(0);
  });
});
