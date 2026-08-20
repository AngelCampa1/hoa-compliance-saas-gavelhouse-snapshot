import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockUseQuery = vi.fn();
const mockUseCommunity = vi.fn();
const mockTrackDashboardEvent = vi.fn();
const mockDownloadAuditPack = vi.fn();

vi.mock("@/lib/sentry", () => ({
  reportUserFacingError: (_err: unknown, fallback: string) => fallback,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

vi.mock("@/lib/community-context", () => ({
  useCommunity: () => mockUseCommunity(),
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

vi.mock("@/lib/api", () => ({
  api: {
    reports: {
      trialBalance: vi.fn(),
      balanceSheet: vi.fn(),
      incomeStatement: vi.fn(),
      generalLedger: vi.fn(),
      downloadAuditPack: (communityId: string, from: string, to: string) =>
        mockDownloadAuditPack(communityId, from, to),
    },
  },
}));

vi.mock("@/components/reports/TrialBalanceTable", () => ({
  TrialBalanceTable: () => <div>trial balance table</div>,
}));

vi.mock("@/components/reports/BalanceSheetCard", () => ({
  BalanceSheetCard: () => <div>balance sheet card</div>,
}));

vi.mock("@/components/reports/IncomeStatementCard", () => ({
  IncomeStatementCard: () => <div>income statement card</div>,
}));

vi.mock("@/components/reports/LedgerFilters", () => ({
  LedgerFilters: ({
    onAccountIdChange,
    onFundTypeChange,
  }: {
    onAccountIdChange: (value: string) => void;
    onFundTypeChange: (value: string) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onAccountIdChange("acc-secret")}>
        Account filter
      </button>
      <button type="button" onClick={() => onFundTypeChange("reserve")}>
        Reserve fund filter
      </button>
    </div>
  ),
}));

async function renderTrialBalance() {
  const mod = await import("@/routes/_app.reports.trial-balance");
  const TrialBalance = mod.Route as unknown as React.ComponentType;
  render(<TrialBalance />);
}

async function renderGeneralLedger() {
  const mod = await import("@/routes/_app.reports.general-ledger");
  const GeneralLedger = mod.Route as unknown as React.ComponentType;
  render(<GeneralLedger />);
}

async function renderAuditPack() {
  const mod = await import("@/routes/_app.reports.audit-pack");
  const AuditPack = mod.Route as unknown as React.ComponentType;
  render(<AuditPack />);
}

describe("reports analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCommunity.mockReturnValue({
      selectedCommunityId: "comm-1",
      selectedCommunityRole: "treasurer",
      selectedCommunityTier: "scale",
    });
    mockUseQuery.mockReturnValue({
      data: { rows: [] },
      isLoading: false,
      isError: false,
    });
    mockDownloadAuditPack.mockResolvedValue(undefined);
  });

  it("tracks report load failures without raw error details", async () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("SQL detail"),
    });

    await renderTrialBalance();

    expect(
      screen.getByText(/unable to load the trial balance/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "report_load_failed",
        {
          community_id: "comm-1",
          failure_type: "api_error",
          report_type: "trial_balance",
        },
      );
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "SQL detail",
    );
  });

  it("tracks report filter changes without raw account values", async () => {
    const user = userEvent.setup();

    await renderGeneralLedger();

    await user.click(screen.getByRole("button", { name: /account filter/i }));

    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "report_filter_changed",
      {
        community_id: "comm-1",
        filter_type: "account",
        report_type: "general_ledger",
      },
    );
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "acc-secret",
    );
  });

  it("tracks report filter changes without raw fund values", async () => {
    const user = userEvent.setup();

    await renderGeneralLedger();

    await user.click(screen.getByRole("button", { name: /reserve fund/i }));

    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "report_filter_changed",
      {
        community_id: "comm-1",
        filter_type: "fund_type",
        report_type: "general_ledger",
      },
    );
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "reserve",
    );
  });

  it("tracks audit pack download failures without raw error text", async () => {
    const user = userEvent.setup();
    mockDownloadAuditPack.mockRejectedValue(new Error("zip stack detail"));

    await renderAuditPack();

    await user.click(
      screen.getByRole("button", { name: /download audit pack/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "We could not download your audit pack. Please try again.",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("zip stack detail")).not.toBeInTheDocument();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "audit_pack_download_failed",
      {
        community_id: "comm-1",
        failure_type: "api_error",
        period_end: expect.any(String),
        period_start: expect.any(String),
      },
    );
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "zip stack detail",
    );
  });

  it("tracks report_export_downloaded on successful audit pack download", async () => {
    const user = userEvent.setup();
    mockDownloadAuditPack.mockResolvedValue(undefined);

    await renderAuditPack();

    await user.click(
      screen.getByRole("button", { name: /download audit pack/i }),
    );

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "report_export_downloaded",
        {
          community_id: "comm-1",
          report_type: "audit_pack",
        },
      );
    });
  });

  it("tracks report_export_failed on failed audit pack download without raw error text", async () => {
    const user = userEvent.setup();
    mockDownloadAuditPack.mockRejectedValue(new Error("internal server trace"));

    await renderAuditPack();

    await user.click(
      screen.getByRole("button", { name: /download audit pack/i }),
    );

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "report_export_failed",
        {
          community_id: "comm-1",
          report_type: "audit_pack",
          failure_type: "api_error",
        },
      );
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "internal server trace",
    );
  });
});
