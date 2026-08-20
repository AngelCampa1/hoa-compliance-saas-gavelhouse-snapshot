import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Db } from "../../../src/db/client.js";

// --- Mocks (must be declared before any imports that use them) ---

const mockDbSelect = vi.fn();
const mockTrialBalance = vi.fn();
const mockBuildPdf = vi.fn();

vi.mock("../../../src/domain/reporting/trialBalance.js", () => ({
  trialBalance: mockTrialBalance,
}));

vi.mock("../../../src/domain/exports/pdf.js", () => ({
  buildPdf: mockBuildPdf,
}));

const mockDb = { select: mockDbSelect } as unknown as Db;

const { buildRoleHandoffReport } =
  await import("../../../src/domain/reporting/roleHandoff.js");

// Fake PDF bytes
const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

// Helper: create a mock DB chain that returns specific values for different queries
// The roleHandoff domain function makes multiple chained select queries.
// We model each as a separate mockReturnValueOnce.
function dbChain(resolvedValue: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(resolvedValue),
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(resolvedValue),
        })),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(resolvedValue),
      })),
    })),
  };
}

function dbChainNoLimit(resolvedValue: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(resolvedValue),
    })),
  };
}

describe("buildRoleHandoffReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildPdf.mockResolvedValue(fakePdfBytes);
    mockTrialBalance.mockResolvedValue([]);
  });

  it("throws when transition is not found", async () => {
    // transition lookup returns empty
    mockDbSelect.mockReturnValueOnce(dbChain([]));

    await expect(
      buildRoleHandoffReport(mockDb, "comm-1", "trans-missing"),
    ).rejects.toThrow("Transition trans-missing not found");
  });

  it("returns Uint8Array PDF bytes for a treasurer transition", async () => {
    // 1. transition record
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "pending",
          pendingItems: ["item1", "item2"],
          fromUserId: "user-from",
          toUserId: "user-to",
        },
      ]),
    );
    // 2. from user
    mockDbSelect.mockReturnValueOnce(dbChain([{ name: "Alice" }]));
    // 3. to user
    mockDbSelect.mockReturnValueOnce(dbChain([{ name: "Bob" }]));
    // 4. trial balance
    mockTrialBalance.mockResolvedValueOnce([]);
    // 5. reserve study
    mockDbSelect.mockReturnValueOnce(dbChain([]));
    // 6. open reconciliations
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    const result = await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    expect(result).toBeInstanceOf(Uint8Array);
    expect(mockBuildPdf).toHaveBeenCalledOnce();
  });

  it("includes pending items in rows when transition has pendingItems", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "pending",
          pendingItems: ["Review finances", "Transfer codes"],
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    // from/to are null — no user lookups needed
    mockTrialBalance.mockResolvedValueOnce([]);
    mockDbSelect.mockReturnValueOnce(dbChain([]));
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const pendingRow = options.rows.find((r) => r.field === "Pending Items");
    expect(pendingRow?.value).toContain("Review finances");
    expect(pendingRow?.value).toContain("Transfer codes");
  });

  it("shows None for pending items when there are no pending items", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "complete",
          pendingItems: [],
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    mockTrialBalance.mockResolvedValueOnce([]);
    mockDbSelect.mockReturnValueOnce(dbChain([]));
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const pendingRow = options.rows.find((r) => r.field === "Pending Items");
    expect(pendingRow?.value).toBe("None");
  });

  it("includes trial balance data in treasurer rows", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    mockTrialBalance.mockResolvedValueOnce([
      {
        accountCode: "1000",
        accountName: "Checking",
        fundType: "operating",
        debitCents: 100000,
        creditCents: 50000,
      },
    ]);
    // reserve study
    mockDbSelect.mockReturnValueOnce(dbChain([]));
    // reconciliations
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const tbRow = options.rows.find(
      (r) => r.field.includes("1000") && r.field.includes("Checking"),
    );
    expect(tbRow).toBeTruthy();
    // Money must render as dollars, not raw cents (100000c -> $1000.00, 50000c -> $500.00)
    expect(tbRow?.value).toContain("$1000.00");
    expect(tbRow?.value).toContain("$500.00");
    expect(tbRow?.value).not.toMatch(/\b100000\b/);
  });

  it("includes reserve study summary when reserve study exists", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    mockTrialBalance.mockResolvedValueOnce([]);
    // reserve study
    mockDbSelect.mockReturnValueOnce(
      dbChain([{ id: "study-1", effectiveDate: "2024-01-01" }]),
    );
    // reserve components
    const mockComponents = [
      {
        name: "Roof",
        replacementCostCents: 50000_00,
        currentReserveCents: 10000_00,
      },
    ];
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(mockComponents),
      })),
    });
    // reconciliations
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const effectiveDateRow = options.rows.find(
      (r) => r.field === "Effective Date",
    );
    expect(effectiveDateRow?.value).toBe("2024-01-01");
    const fundedRow = options.rows.find((r) => r.field === "Funded %");
    expect(fundedRow?.value).toBe("20%");
    const reserveThresholdRow = options.rows.find(
      (r) => r.field === "Reserve Funded >= 15% Target",
    );
    expect(reserveThresholdRow?.value).toBe("Yes");
  });

  it("shows below target when funded percent is below 15%", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    mockTrialBalance.mockResolvedValueOnce([]);
    // reserve study
    mockDbSelect.mockReturnValueOnce(
      dbChain([{ id: "study-1", effectiveDate: "2023-01-01" }]),
    );
    // reserve components: 14% funded
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([
          {
            name: "Pool",
            replacementCostCents: 100000_00,
            currentReserveCents: 14000_00,
          },
        ]),
      })),
    });
    // reconciliations
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const reserveThresholdRow = options.rows.find(
      (r) => r.field === "Reserve Funded >= 15% Target",
    );
    expect(reserveThresholdRow?.value).toBe("No");
  });

  it("lists open reconciliations in treasurer section", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    mockTrialBalance.mockResolvedValueOnce([]);
    // reserve study — none
    mockDbSelect.mockReturnValueOnce(dbChain([]));
    // reconciliations
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([
          { id: "rec-1", statementId: "stmt-1" },
          { id: "rec-2", statementId: "stmt-2" },
        ]),
      })),
    });

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const rec1Row = options.rows.find((r) => r.field.includes("rec-1"));
    expect(rec1Row?.value).toContain("stmt-1");
    const rec2Row = options.rows.find((r) => r.field.includes("rec-2"));
    expect(rec2Row?.value).toContain("stmt-2");
  });

  it("returns Uint8Array PDF bytes for a secretary transition", async () => {
    // 1. transition record
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-2",
          role: "secretary",
          status: "pending",
          pendingItems: null,
          fromUserId: "user-from",
          toUserId: null,
        },
      ]),
    );
    // 2. from user
    mockDbSelect.mockReturnValueOnce(dbChain([{ name: "Carol" }]));
    // 3. last 3 meetings
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    });
    // 4. arch requests
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));
    // 5. violations
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    const result = await buildRoleHandoffReport(mockDb, "comm-1", "trans-2");

    expect(result).toBeInstanceOf(Uint8Array);
    expect(mockBuildPdf).toHaveBeenCalledOnce();
  });

  it("includes meeting title and truncated minutes in secretary section", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-2",
          role: "secretary",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );

    const longMinutes = "A".repeat(600);
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: "meeting-1",
                title: "Annual Meeting",
                scheduledAt: new Date("2024-06-01T18:00:00Z"),
                minutesText: longMinutes,
                minutesFinalizedAt: new Date("2024-06-02"),
              },
            ]),
          })),
        })),
      })),
    });
    // arch requests
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));
    // violations
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-2");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const meetingRow = options.rows.find((r) =>
      r.field.includes("Annual Meeting"),
    );
    expect(meetingRow).toBeTruthy();
    const minutesRow = options.rows.find((r) => r.field === "Minutes");
    expect(minutesRow?.value.length).toBeLessThanOrEqual(500);
    expect(minutesRow?.value).toContain("…");
  });

  it("shows None when no finalized meetings exist for secretary", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-2",
          role: "secretary",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    // meetings
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    });
    // arch requests
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));
    // violations
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-2");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const noneRow = options.rows.find(
      (r) => r.field === "Finalized Meetings" && r.value === "None",
    );
    expect(noneRow).toBeTruthy();
  });

  it("includes open arch requests and violations in secretary section", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-2",
          role: "secretary",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    // meetings
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    });
    // arch requests — one pending
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([
          {
            id: "req-1",
            requestType: "Fence",
            description: "New fence installation",
            status: "pending",
          },
        ]),
      })),
    });
    // violations — one open
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi
          .fn()
          .mockResolvedValue([
            {
              id: "vio-1",
              title: "Parking violation",
              description: "Vehicle parked in fire lane",
              status: "open",
            },
          ]),
      })),
    });

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-2");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const archRow = options.rows.find(
      (r) => r.field.includes("Fence") && r.field.includes("pending"),
    );
    expect(archRow?.value).toContain("New fence installation");
    const violationRow = options.rows.find((r) =>
      r.field.includes("Parking violation"),
    );
    // Like the arch-request sibling, the value must be the human-readable
    // description, not the raw violation UUID.
    expect(violationRow?.value).toBe("Vehicle parked in fire lane");
  });

  it("rejects non-treasurer non-secretary role handoff reports", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-3",
          role: "owner",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );

    await expect(
      buildRoleHandoffReport(mockDb, "comm-1", "trans-3"),
    ).rejects.toThrow(
      "Role handoff reports are supported only for treasurer and secretary roles.",
    );
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it("uses N/A for from user when fromUserId is null", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    mockTrialBalance.mockResolvedValueOnce([]);
    mockDbSelect.mockReturnValueOnce(dbChain([]));
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const fromRow = options.rows.find((r) => r.field === "From");
    expect(fromRow?.value).toBe("N/A");
    const toRow = options.rows.find((r) => r.field === "To");
    expect(toRow?.value).toBe("N/A");
  });

  it("includes user names when fromUserId and toUserId are provided", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "pending",
          pendingItems: null,
          fromUserId: "user-from",
          toUserId: "user-to",
        },
      ]),
    );
    // from user
    mockDbSelect.mockReturnValueOnce(dbChain([{ name: "Alice Smith" }]));
    // to user
    mockDbSelect.mockReturnValueOnce(dbChain([{ name: "Bob Jones" }]));
    mockTrialBalance.mockResolvedValueOnce([]);
    mockDbSelect.mockReturnValueOnce(dbChain([]));
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const fromRow = options.rows.find((r) => r.field === "From");
    expect(fromRow?.value).toBe("Alice Smith");
    const toRow = options.rows.find((r) => r.field === "To");
    expect(toRow?.value).toBe("Bob Jones");
  });

  it("handles reserve study with zero target cost gracefully (0% funded)", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    mockTrialBalance.mockResolvedValueOnce([]);
    // reserve study exists
    mockDbSelect.mockReturnValueOnce(
      dbChain([{ id: "study-1", effectiveDate: "2024-01-01" }]),
    );
    // reserve components: no cost (edge case)
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([
          {
            name: "Pool",
            replacementCostCents: 0,
            currentReserveCents: 0,
          },
        ]),
      })),
    });
    // reconciliations
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const fundedRow = options.rows.find((r) => r.field === "Funded %");
    expect(fundedRow?.value).toBe("0%");
  });

  it("shows No minutes text when meeting minutesText is null", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-2",
          role: "secretary",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: "meeting-1",
                title: "Board Meeting",
                scheduledAt: new Date("2024-03-01T18:00:00Z"),
                minutesText: null,
                minutesFinalizedAt: new Date("2024-03-02"),
              },
            ]),
          })),
        })),
      })),
    });
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-2");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const minutesRow = options.rows.find((r) => r.field === "Minutes");
    expect(minutesRow?.value).toBe("No minutes text");
  });

  it("shows the scheduled date when scheduledAt is available for meetings", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-2",
          role: "secretary",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: "meeting-1",
                title: "Special Meeting",
                scheduledAt: new Date("2024-08-15T00:00:00Z"),
                minutesText: "Some notes",
                minutesFinalizedAt: new Date("2024-08-16"),
              },
            ]),
          })),
        })),
      })),
    });
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-2");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const meetingRow = options.rows.find((r) =>
      r.field.includes("Special Meeting"),
    );
    expect(meetingRow?.value).toBe("2024-08-15");
  });

  it("uses N/A when fromUserId is set but user record is not found", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-1",
          role: "treasurer",
          status: "pending",
          pendingItems: null,
          fromUserId: "user-from",
          toUserId: "user-to",
        },
      ]),
    );
    // from user not found
    mockDbSelect.mockReturnValueOnce(dbChain([]));
    // to user not found
    mockDbSelect.mockReturnValueOnce(dbChain([]));
    mockTrialBalance.mockResolvedValueOnce([]);
    mockDbSelect.mockReturnValueOnce(dbChain([]));
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-1");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const fromRow = options.rows.find((r) => r.field === "From");
    expect(fromRow?.value).toBe("N/A");
    const toRow = options.rows.find((r) => r.field === "To");
    expect(toRow?.value).toBe("N/A");
  });

  it("shows Unknown when scheduledAt is null for a meeting", async () => {
    mockDbSelect.mockReturnValueOnce(
      dbChain([
        {
          id: "trans-2",
          role: "secretary",
          status: "pending",
          pendingItems: null,
          fromUserId: null,
          toUserId: null,
        },
      ]),
    );
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: "meeting-1",
                title: "Old Meeting",
                scheduledAt: null,
                minutesText: "Some notes",
                minutesFinalizedAt: new Date("2024-01-02"),
              },
            ]),
          })),
        })),
      })),
    });
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));
    mockDbSelect.mockReturnValueOnce(dbChainNoLimit([]));

    await buildRoleHandoffReport(mockDb, "comm-1", "trans-2");

    const [options] = mockBuildPdf.mock.calls[0] as [
      { rows: Array<{ field: string; value: string }> },
    ];
    const meetingRow = options.rows.find((r) =>
      r.field.includes("Old Meeting"),
    );
    expect(meetingRow?.value).toBe("Unknown");
  });
});
