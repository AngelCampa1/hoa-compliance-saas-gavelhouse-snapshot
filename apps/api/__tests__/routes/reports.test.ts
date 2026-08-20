import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../src/types/env.js";

const mockEnv = {
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:8060",
  APP_URL: "http://localhost:3060",
  DATABASE_URL: "postgres://localhost/test",
} as Env;

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasReportCapability: vi.fn(),
  trialBalance: vi.fn(),
  balanceSheet: vi.fn(),
  incomeStatement: vi.fn(),
  generalLedger: vi.fn(),
  buildAuditPack: vi.fn(),
  buildRoleHandoffReport: vi.fn(),
  insertAuditEvent: vi.fn(),
  captureEvent: vi.fn(),
}));

vi.mock("../../src/lib/auth.js", () => ({
  createAuth: vi.fn(() => ({
    api: { getSession: mocks.getSession },
    handler: vi.fn(),
  })),
  getAuth: vi.fn(() => ({
    api: { getSession: mocks.getSession },
    handler: vi.fn(),
  })),
}));

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({ mockDb: true })),
}));

vi.mock("../../src/domain/policy/reportAccess.js", () => ({
  hasReportCapability: mocks.hasReportCapability,
}));

vi.mock("../../src/domain/accounting/auditMiddleware.js", () => ({
  insertAuditEvent: mocks.insertAuditEvent,
}));

vi.mock("../../src/domain/tier/requireTier.js", () => ({
  requireTier: vi.fn(
    () => async (_c: unknown, next: () => Promise<void>) => next(),
  ),
}));

vi.mock("../../src/domain/reporting/trialBalance.js", () => ({
  trialBalance: mocks.trialBalance,
}));

vi.mock("../../src/domain/reporting/balanceSheet.js", () => ({
  balanceSheet: mocks.balanceSheet,
}));

vi.mock("../../src/domain/reporting/incomeStatement.js", () => ({
  incomeStatement: mocks.incomeStatement,
}));

vi.mock("../../src/domain/reporting/generalLedger.js", () => ({
  generalLedger: mocks.generalLedger,
}));

vi.mock("../../src/domain/reporting/auditPack.js", () => ({
  buildAuditPack: mocks.buildAuditPack,
}));

vi.mock("../../src/domain/reporting/roleHandoff.js", () => ({
  buildRoleHandoffReport: mocks.buildRoleHandoffReport,
}));

vi.mock("../../src/lib/observability.js", () => ({
  captureEvent: mocks.captureEvent,
}));

const reportsModule = await import("../../src/routes/reports/index.js");
const reportsRouter = reportsModule.default;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", reportsRouter);
  return app;
}

function makeRequest(path: string) {
  return makeApp().request(path, {}, mockEnv);
}

describe("reports routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.hasReportCapability.mockResolvedValue(true);
    mocks.captureEvent.mockResolvedValue(undefined);
  });

  it("wraps trial balance rows for the dashboard report client", async () => {
    const rows = [
      {
        accountId: "acc-1",
        accountCode: "1000",
        accountName: "Checking",
        accountType: "asset",
        fundType: "operating",
        debitCents: 1000,
        creditCents: 0,
      },
    ];
    mocks.trialBalance.mockResolvedValue(rows);

    const res = await makeRequest(
      "/reports/trial-balance?communityId=comm-1&asOf=2026-05-31",
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ rows });
    expect(mocks.insertAuditEvent).toHaveBeenCalledWith(
      { mockDb: true },
      expect.objectContaining({
        communityId: "comm-1",
        actorUserId: "user-1",
        entityType: "report_export",
        entityId: "trial-balance",
      }),
    );
  });

  it("adapts the balance sheet domain model to report rows", async () => {
    mocks.balanceSheet.mockResolvedValue({
      asOf: "2026-05-31",
      sections: [
        {
          fundType: "operating",
          accountType: "asset",
          accounts: [{ balanceCents: 3000 }],
          totalCents: 3000,
        },
        {
          fundType: "reserve",
          accountType: "liability",
          accounts: [{ balanceCents: 700 }],
          totalCents: 700,
        },
      ],
      operatingNetCents: 3000,
      reserveNetCents: -700,
    });

    const res = await makeRequest(
      "/reports/balance-sheet?communityId=comm-1&asOf=2026-05-31",
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      rows: [
        {
          accountType: "asset",
          fundType: "operating",
          balanceCents: 3000,
        },
        {
          accountType: "liability",
          fundType: "reserve",
          balanceCents: 700,
        },
      ],
    });
  });

  it("adapts the income statement domain model to fund summary rows", async () => {
    mocks.incomeStatement.mockResolvedValue({
      from: "2026-05-01",
      to: "2026-05-31",
      lines: [],
      operatingRevenueCents: 5000,
      operatingExpenseCents: 1200,
      operatingNetCents: 3800,
      reserveRevenueCents: 800,
      reserveExpenseCents: 300,
      reserveNetCents: 500,
    });

    const res = await makeRequest(
      "/reports/income-statement?communityId=comm-1&from=2026-05-01&to=2026-05-31",
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      rows: [
        {
          fundType: "operating",
          revenue: 5000,
          expenses: 1200,
          netIncome: 3800,
        },
        {
          fundType: "reserve",
          revenue: 800,
          expenses: 300,
          netIncome: 500,
        },
      ],
    });
  });

  it("wraps general ledger rows and preserves dashboard field names", async () => {
    mocks.generalLedger.mockResolvedValue({
      rows: [
        {
          entryId: "entry-1",
          entryDate: "2026-05-15",
          memo: "Deposit",
          accountId: "acc-1",
          accountCode: "1000",
          accountName: "Checking",
          fundType: "operating",
          debitCents: 1000,
          creditCents: 0,
          runningBalanceCents: 1000,
        },
      ],
      total: 1,
    });

    const res = await makeRequest(
      "/reports/general-ledger?communityId=comm-1&from=2026-05-01&to=2026-05-31",
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      rows: [
        {
          id: "entry-1",
          entryDate: "2026-05-15",
          memo: "Deposit",
          accountId: "acc-1",
          accountCode: "1000",
          accountName: "Checking",
          fundType: "operating",
          debitCents: 1000,
          creditCents: 0,
          runningBalance: 1000,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
  });

  it("tracks audit pack downloads without filename or raw query details", async () => {
    mocks.buildAuditPack.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("zip"));
          controller.close();
        },
      }),
    );

    const res = await makeRequest(
      "/reports/audit-pack?communityId=comm-1&periodStart=2026-05-01&periodEnd=2026-05-31",
    );

    expect(res.status).toBe(200);
    expect(mocks.captureEvent).toHaveBeenCalledWith(
      "report_export_downloaded",
      {
        community_id: "comm-1",
        period_end: "2026-05-31",
        period_start: "2026-05-01",
        report_type: "audit_pack",
      },
      "user-1",
      mockEnv,
    );
    const calls = JSON.stringify(mocks.captureEvent.mock.calls);
    expect(calls).not.toContain("audit-pack-2026-05-01");
    expect(calls).not.toContain("raw");
  });

  it("still streams audit pack when analytics capture fails", async () => {
    mocks.captureEvent.mockRejectedValueOnce(new Error("posthog down"));
    mocks.buildAuditPack.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("zip"));
          controller.close();
        },
      }),
    );

    const res = await makeRequest(
      "/reports/audit-pack?communityId=comm-1&periodStart=2026-05-01&periodEnd=2026-05-31",
    );

    expect(res.status).toBe(200);
  });

  it("tracks role handoff downloads without transition filename", async () => {
    mocks.buildRoleHandoffReport.mockResolvedValue(
      new TextEncoder().encode("%PDF"),
    );

    const res = await makeRequest(
      "/reports/role-handoff?communityId=comm-1&transitionId=transition-1",
    );

    expect(res.status).toBe(200);
    expect(mocks.captureEvent).toHaveBeenCalledWith(
      "report_export_downloaded",
      {
        community_id: "comm-1",
        report_type: "role_handoff",
      },
      "user-1",
      mockEnv,
    );
    expect(JSON.stringify(mocks.captureEvent.mock.calls)).not.toContain(
      "transition-1",
    );
  });

  it("tracks unsupported role handoff export failures without raw error text", async () => {
    mocks.buildRoleHandoffReport.mockRejectedValueOnce(
      new Error(
        "Role handoff reports are supported only for treasurer and secretary roles.",
      ),
    );

    const res = await makeRequest(
      "/reports/role-handoff?communityId=comm-1&transitionId=transition-1",
    );

    expect(res.status).toBe(422);
    expect(mocks.captureEvent).toHaveBeenCalledWith(
      "report_export_failed",
      {
        community_id: "comm-1",
        failure_type: "unsupported_role",
        report_type: "role_handoff",
      },
      "user-1",
      mockEnv,
    );
    const calls = JSON.stringify(mocks.captureEvent.mock.calls);
    expect(calls).not.toContain("treasurer and secretary");
    expect(calls).not.toContain("transition-1");
  });
});
