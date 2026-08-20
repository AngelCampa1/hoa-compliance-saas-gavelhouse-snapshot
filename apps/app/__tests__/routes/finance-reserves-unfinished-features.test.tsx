import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSummary = vi.fn();
const mockUpsertStudy = vi.fn();
const mockUpdateAllocation = vi.fn();
const mockActivationGet = vi.fn();
const mockActivationPatch = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/lib/community-context", () => ({
  useCommunity: () => ({
    selectedCommunityId: "comm-1",
    selectedCommunityRole: "owner",
    selectedCommunityTier: "scale",
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    activation: {
      get: (communityId: string) => mockActivationGet(communityId),
      patch: (step: string, communityId: string, completed: boolean) =>
        mockActivationPatch(step, communityId, completed),
    },
    finance: {
      reserves: {
        getSummary: (communityId: string) => mockGetSummary(communityId),
        upsertStudy: (data: unknown) => mockUpsertStudy(data),
        updateAllocation: (data: unknown) => mockUpdateAllocation(data),
        importStudy: vi.fn(),
      },
    },
  },
}));

vi.mock("@boardstack/shared", () => ({
  getPageHelpForRoute: () => undefined,
  PRODUCT_CONTEXTUAL_HELP: {
    reserves: {
      title: "Reserve help",
      body: "Review reserve data.",
      bullets: ["Import study"],
      href: "/help/reserve-study-import",
    },
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("finance reserves unfinished feature fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActivationGet.mockResolvedValue({
      activation: { complianceAcknowledged: true },
    });
    mockActivationPatch.mockResolvedValue({ ok: true });
    mockUpsertStudy.mockResolvedValue({});
    mockUpdateAllocation.mockResolvedValue({});
    mockGetSummary.mockResolvedValue({
      studyId: "study-1",
      effectiveDate: "2026-01-01",
      components: [
        {
          id: "component-1",
          name: "Roof",
          usefulLifeYears: 20,
          remainingLifeYears: 5,
          replacementCostCents: 4000000,
          currentReserveCents: 1200000,
        },
        {
          id: "component-2",
          name: "Pool",
          usefulLifeYears: 10,
          remainingLifeYears: 3,
          replacementCostCents: 1000000,
          currentReserveCents: 300000,
        },
      ],
      totalReserveBalance: 1500000,
      totalProjectedNeed: 5000000,
      percentFunded: 30,
      annualBudgetCents: null,
      annualReserveContributionCents: null,
      allocationPercent: null,
      fannieMaeCompliant: null,
      fannieMaeComplianceBasis: "annual_budget_allocation_unavailable",
      stateRequirements: null,
    });
  });

  it("shows Fannie Mae allocation unavailable instead of deriving compliance from reserve allocation percent", async () => {
    const mod = (await import("@/routes/_app.finance.reserves")) as {
      Route: React.ComponentType;
    };

    renderWithClient(<mod.Route />);

    expect(
      await screen.findByText(/needs annual budget allocation/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/30\.0%.*compliant/i)).toBeNull();
    expect(screen.queryByText(/below 15% threshold/i)).toBeNull();
  });

  it("does not repeat community-level allocation percent as a component allocation column", async () => {
    const mod = (await import("@/routes/_app.finance.reserves")) as {
      Route: React.ComponentType;
    };

    renderWithClient(<mod.Route />);

    expect(await screen.findAllByText("Roof")).not.toHaveLength(0);
    expect(screen.getAllByText("Pool")).not.toHaveLength(0);
    expect(
      screen.queryByRole("columnheader", { name: /allocation/i }),
    ).toBeNull();
    expect(screen.queryAllByText("30.0%")).toHaveLength(1);
  });

  it("saves annual budget allocation and shows real Fannie Mae compliance", async () => {
    mockGetSummary.mockResolvedValue({
      studyId: "study-1",
      effectiveDate: "2026-01-01",
      components: [
        {
          id: "component-1",
          name: "Roof",
          usefulLifeYears: 20,
          remainingLifeYears: 5,
          replacementCostCents: 4000000,
          currentReserveCents: 1200000,
        },
      ],
      totalReserveBalance: 1200000,
      totalProjectedNeed: 4000000,
      percentFunded: 30,
      annualBudgetCents: 12000000,
      annualReserveContributionCents: 2400000,
      allocationPercent: 20,
      fannieMaeCompliant: true,
      fannieMaeComplianceBasis: "annual_budget_allocation",
      stateRequirements: null,
    });
    const mod = (await import("@/routes/_app.finance.reserves")) as {
      Route: React.ComponentType;
    };

    renderWithClient(<mod.Route />);

    expect(await screen.findByText(/20\.0%.*compliant/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/annual budget/i));
    await user.type(screen.getByLabelText(/annual budget/i), "120000");
    await user.clear(screen.getByLabelText(/reserve contribution/i));
    await user.type(screen.getByLabelText(/reserve contribution/i), "12000");
    await user.click(screen.getByRole("button", { name: /save allocation/i }));

    expect(mockUpdateAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: "comm-1",
        annualBudgetCents: 12000000,
        annualReserveContributionCents: 1200000,
      }),
    );
    expect(mockUpsertStudy).not.toHaveBeenCalled();
  });
});
