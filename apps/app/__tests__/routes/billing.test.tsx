import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { PRICING_TIERS } from "@boardstack/shared";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";

const mockNavigate = vi.fn();
const mockUseSession = vi.fn(() => ({ data: { user: { id: "u-1" } } }));
const mockList = vi.fn();
const mockGetStatus = vi.fn();
const mockStartTrial = vi.fn();
const mockCheckout = vi.fn();
const mockPortal = vi.fn();
const mockUsage = vi.fn();
const mockTrackDashboardEvent = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
  useNavigate: () => mockNavigate,
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    useSession: () => mockUseSession(),
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    communities: {
      list: () => mockList(),
      usage: (communityId: string) => mockUsage(communityId),
    },
    billing: {
      getStatus: (communityId: string) => mockGetStatus(communityId),
      startTrial: (data: unknown) => mockStartTrial(data),
      checkout: (data: unknown) => mockCheckout(data),
      portal: (communityId: string, returnUrl: string) =>
        mockPortal(communityId, returnUrl),
    },
  },
}));

vi.mock("@/lib/community-context", () => ({
  useCommunity: () => ({
    selectedCommunityId: "community-1",
    setSelectedCommunityId: vi.fn(),
  }),
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

vi.mock("@/components/billing/CancelReasonModal", () => ({
  CancelReasonModal: () => null,
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const config: QueryClientConfig = {
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  };
  const client = new QueryClient(config);
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

async function renderBillingPage() {
  const mod = await import("@/routes/_app.billing");
  const BillingPage = mod.Route as unknown as React.ComponentType;
  renderWithQueryClient(<BillingPage />);
}

const communityResponse = {
  communities: [
    {
      community: {
        id: "community-1",
        name: "Sunset Ridge HOA",
        slug: "sunset-ridge-hoa",
        state: "CA",
        ownerUserId: "u-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      role: "owner",
    },
  ],
};

const annualPricePattern = /\$\d+(?:\.\d{2})?\/mo billed annually/;

const emptyUsage = {
  homes: 0,
  boardUsers: 1,
  pendingInvites: 0,
  featuresUsed: [] as string[],
  recommendedTier: "starter" as const,
};

describe("BillingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    mockList.mockResolvedValue(communityResponse);
    mockUsage.mockResolvedValue(emptyUsage);
    mockStartTrial.mockResolvedValue({
      status: "trialing",
      tier: "starter",
      cycle: "monthly",
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    mockCheckout.mockResolvedValue({ url: null });
    mockPortal.mockResolvedValue({ url: "https://billing.stripe.test/portal" });
    window.history.replaceState({}, "", "http://localhost:3000/billing");
  });

  it("renders the plan chooser for trialing communities", async () => {
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(
        screen.getByText("Pick a plan to keep access after your trial"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getAllByRole("button", { name: /switch to this plan/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /start free trial/i }),
    ).not.toBeInTheDocument();
  });

  it("tracks pricing view context when the plan chooser loads", async () => {
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    mockUsage.mockResolvedValue({
      homes: 130,
      boardUsers: 4,
      pendingInvites: 2,
      featuresUsed: ["audit-pack", "month-end-close"],
      recommendedTier: "growth",
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith("pricing_viewed", {
        billing_status: "trialing",
        community_id: "community-1",
        current_tier: "portfolio",
        features_used_count: 2,
        homes: 130,
        board_users: 4,
        pending_invites: 2,
        recommended_tier: "growth",
        source: "billing_page",
      });
    });
  });

  it("renders whoItsFor and outcome for each tier in the plan chooser", async () => {
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(
        screen.getByText("Pick a plan to keep access after your trial"),
      ).toBeInTheDocument();
    });

    for (const tier of PRICING_TIERS.filter((t) => !t.contactSales)) {
      expect(screen.getByText(tier.whoItsFor)).toBeInTheDocument();
      expect(screen.getByText(tier.outcome)).toBeInTheDocument();
    }
  });

  it("starts legacy pending-trial communities with one Scale trial CTA", async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      status: "pending_trial",
      tier: "starter",
      cycle: null,
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getByText("Start your Scale trial")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/You do not need to pick a plan now/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/1-month free trial/i)).not.toBeInTheDocument();
    expect(
      screen.queryAllByRole("button", { name: /start free trial/i }),
    ).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /start free trial/i }));

    await waitFor(() => {
      expect(mockStartTrial).toHaveBeenCalledWith({
        communityId: "community-1",
      });
    });
  });

  it("does not auto-start a trial on mount even with plan/cycle in URL", async () => {
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/billing?plan=growth&cycle=annual",
    );
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(
        screen.getByText("Pick a plan to keep access after your trial"),
      ).toBeInTheDocument();
    });
    expect(mockStartTrial).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "/dashboard" }),
    );
  });

  it("defaults plan selection to annual billing and submits checkout with annual cycle for trialing users", async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getAllByText(annualPricePattern).length).toBeGreaterThan(0);
    });

    await user.click(
      screen.getAllByRole("button", { name: /switch to this plan/i })[0]!,
    );

    await waitFor(() => {
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: "starter",
          cycle: "annual",
        }),
      );
    });
  });

  it("switches visible pricing and checkout payload to monthly billing", async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      status: "expired",
      tier: "starter",
      cycle: null,
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getAllByText(annualPricePattern).length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: "Monthly" }));

    expect(screen.getAllByText(/\$\d+(?:\.\d{2})?\/mo/).length).toBeGreaterThan(
      0,
    );
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "billing_cycle_changed",
      {
        billing_period: "monthly",
        community_id: "community-1",
        source: "billing_page",
      },
    );

    await user.click(screen.getByRole("button", { name: /annual/i }));
    await user.click(
      screen.getAllByRole("button", { name: /restore access/i })[0]!,
    );

    await waitFor(() => {
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: "starter",
          cycle: "annual",
        }),
      );
    });
  });

  it("does not track billing cycle changes for no-op cycle clicks", async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      status: "expired",
      tier: "starter",
      cycle: null,
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getAllByText(annualPricePattern).length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: /annual/i }));

    expect(mockTrackDashboardEvent).not.toHaveBeenCalledWith(
      "billing_cycle_changed",
      expect.anything(),
    );
  });

  it("shows limited offer and guarantee copy near checkout actions", async () => {
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getAllByText(/limited offer/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/M80OFF/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Y80OFF/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/80% off your first year/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(new RegExp("80% off for " + "12 months", "i")),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(new RegExp("80% off " + "once", "i")),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/for the life/i)).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/30-day money-back guarantee/i).length,
    ).toBeGreaterThan(0);
  });

  it("warns about lost access on tiers below current usage and offers a recommended-tier CTA", async () => {
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    mockUsage.mockResolvedValue({
      homes: 130,
      boardUsers: 4,
      pendingInvites: 0,
      featuresUsed: [],
      recommendedTier: "growth",
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getByTestId("plan-card-loss-starter")).toBeInTheDocument();
    });
    const starterLoss = screen.getByTestId("plan-card-loss-starter");
    expect(starterLoss).toHaveTextContent(/80 homes over cap/i);
    expect(starterLoss).toHaveTextContent(/1 board seats over cap/i);
    expect(
      screen.getByTestId("plan-card-use-recommended-starter"),
    ).toHaveTextContent(/use growth instead \(recommended\)/i);
    expect(screen.getByTestId("plan-card-continue-starter")).toHaveTextContent(
      /continue with starter/i,
    );
    expect(
      screen.queryByTestId("plan-card-loss-growth"),
    ).not.toBeInTheDocument();
  });

  it("clicking Use {recommended} instead checks out the recommended tier", async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    mockUsage.mockResolvedValue({
      homes: 130,
      boardUsers: 4,
      pendingInvites: 0,
      featuresUsed: [],
      recommendedTier: "growth",
    });
    mockCheckout.mockResolvedValue({ url: null });

    await renderBillingPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("plan-card-use-recommended-starter"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("plan-card-use-recommended-starter"));

    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "pricing_tier_selected",
      {
        billing_period: "annual",
        billing_status: "trialing",
        community_id: "community-1",
        recommended_tier: "growth",
        selection_type: "recommended",
        source: "billing_page",
        tier: "growth",
      },
    );
    await waitFor(() => {
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ tier: "growth", cycle: "annual" }),
      );
    });
  });

  it("clicking Continue with {tier} checks out the cheaper tier despite the warning", async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    mockUsage.mockResolvedValue({
      homes: 130,
      boardUsers: 4,
      pendingInvites: 0,
      featuresUsed: [],
      recommendedTier: "growth",
    });
    mockCheckout.mockResolvedValue({ url: null });

    await renderBillingPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("plan-card-continue-starter"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("plan-card-continue-starter"));

    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "pricing_tier_selected",
      {
        billing_period: "annual",
        billing_status: "trialing",
        community_id: "community-1",
        recommended_tier: "growth",
        selection_type: "override",
        source: "billing_page",
        tier: "starter",
      },
    );
    await waitFor(() => {
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ tier: "starter", cycle: "annual" }),
      );
    });
  });

  it("highlights the recommended tier with a Recommended badge", async () => {
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    mockUsage.mockResolvedValue({
      homes: 130,
      boardUsers: 4,
      pendingInvites: 0,
      featuresUsed: [],
      recommendedTier: "growth",
    });

    await renderBillingPage();

    await waitFor(() => {
      const growthCard = screen.getByTestId("plan-card-growth");
      expect(growthCard).toHaveTextContent(/recommended/i);
    });
  });

  it("lists missing features in the loss summary", async () => {
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    mockUsage.mockResolvedValue({
      homes: 0,
      boardUsers: 1,
      pendingInvites: 0,
      featuresUsed: ["audit-pack", "month-end-close"],
      recommendedTier: "scale",
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getByTestId("plan-card-loss-growth")).toHaveTextContent(
        /audit pack export/i,
      );
    });
    expect(screen.getByTestId("plan-card-loss-growth")).toHaveTextContent(
      /month-end close/i,
    );
  });

  it("shows billing management state for active subscriptions", async () => {
    mockGetStatus.mockResolvedValue({
      status: "active",
      tier: "growth",
      cycle: "monthly",
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getByText("Billing overview")).toBeInTheDocument();
    });
    expect(screen.queryByText("Choose your plan")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Pick a plan to keep access after your trial"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Your plan")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /cancel subscription/i }),
      ).toBeInTheDocument();
    });
  });

  it("opens the Stripe billing portal for active subscriptions", async () => {
    const user = userEvent.setup();
    mockPortal.mockResolvedValue({ url: null });
    mockGetStatus.mockResolvedValue({
      status: "active",
      tier: "growth",
      cycle: "monthly",
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /manage billing/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /manage billing/i }));

    await waitFor(() => {
      expect(mockPortal).toHaveBeenCalledWith(
        "community-1",
        "http://localhost:3000/billing",
      );
    });
  });

  it("tracks checkout failures without raw error text", async () => {
    const user = userEvent.setup();
    mockCheckout.mockRejectedValueOnce(new Error("stripe detail"));
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: null,
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getAllByText(annualPricePattern).length).toBeGreaterThan(0);
    });

    await user.click(
      screen.getAllByRole("button", { name: /switch to this plan/i })[0]!,
    );

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "billing_checkout_failed",
        {
          billing_period: "annual",
          community_id: "community-1",
          failure_type: "api_error",
          tier: "starter",
        },
      );
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "stripe detail",
    );
  });

  it("tracks billing portal failures without raw error text", async () => {
    const user = userEvent.setup();
    mockPortal.mockRejectedValueOnce(new Error("portal detail"));
    mockGetStatus.mockResolvedValue({
      status: "active",
      tier: "growth",
      cycle: "monthly",
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /manage billing/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /manage billing/i }));

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "billing_portal_failed",
        {
          community_id: "community-1",
          failure_type: "api_error",
        },
      );
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "portal detail",
    );
  });

  it("shows restart flow for expired subscriptions", async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      status: "expired",
      tier: "starter",
      cycle: "monthly",
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getByText("Restart your plan")).toBeInTheDocument();
    });
    expect(
      screen.getAllByRole("button", { name: /restore access/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /cancel subscription/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /annual/i }));
    await user.click(
      screen.getAllByRole("button", { name: /restore access/i })[0]!,
    );

    await waitFor(() => {
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: "starter",
          cycle: "annual",
        }),
      );
    });
  });

  it("checkout honors the toggled cycle (not the trial's cycle) when trialing with a non-null trial cycle", async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "portfolio",
      cycle: "monthly",
      trialStartedAt: "2026-05-01T00:00:00.000Z",
      trialEndsAt: "2026-05-31T00:00:00.000Z",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(
        screen.getByText("Pick a plan to keep access after your trial"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /annual/i }));

    await user.click(
      screen.getAllByRole("button", { name: /switch to this plan/i })[0]!,
    );

    await waitFor(() => {
      expect(mockCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ cycle: "annual" }),
      );
    });
  });

  it("does not show cancel subscription for canceled communities", async () => {
    mockGetStatus.mockResolvedValue({
      status: "canceled",
      tier: "growth",
      cycle: "monthly",
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getByText("Billing overview")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /cancel subscription/i }),
    ).not.toBeInTheDocument();
  });

  it("still offers billing management when cancellation is already scheduled", async () => {
    mockGetStatus.mockResolvedValue({
      status: "active",
      tier: "growth",
      cycle: "monthly",
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      cancelAtPeriodEnd: true,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /manage billing/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /cancel subscription/i }),
    ).not.toBeInTheDocument();
  });

  it("hides billing management actions from non-admin members", async () => {
    mockList.mockResolvedValue({
      communities: [
        {
          ...communityResponse.communities[0],
          role: "viewer",
        },
      ],
    });
    mockGetStatus.mockResolvedValue({
      status: "active",
      tier: "growth",
      cycle: "monthly",
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });

    await renderBillingPage();

    await waitFor(() => {
      expect(screen.getByText("Billing overview")).toBeInTheDocument();
    });
    expect(screen.getByText("Your plan")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /manage billing/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cancel subscription/i }),
    ).not.toBeInTheDocument();
  });
});
