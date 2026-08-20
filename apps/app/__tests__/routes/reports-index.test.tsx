import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

const mockNavigate = vi.fn();
const mockUseCommunity = vi.fn();
const mockTrackDashboardEvent = vi.fn();

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
  useNavigate: () => mockNavigate,
}));

vi.mock("@/lib/community-context", () => ({
  useCommunity: () => mockUseCommunity(),
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

async function renderReportsIndex() {
  const mod = await import("@/routes/_app.reports.index");
  const ReportsIndex = mod.Route as unknown as React.ComponentType;
  return render(<ReportsIndex />);
}

describe("Reports index access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders access denied instead of report cards for secretary role", async () => {
    mockUseCommunity.mockReturnValue({
      selectedCommunityRole: "secretary",
      selectedCommunityTier: "scale",
    });

    await renderReportsIndex();

    expect(
      screen.getByRole("heading", { name: /reports access denied/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /review balance/i }),
    ).toBeNull();
    expect(screen.queryByText("Trial Balance")).toBeNull();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "feature_access_denied",
      {
        capability: "report:read",
        feature: "reports",
        reason: "role",
        role: "secretary",
        tier: "scale",
      },
    );
  });

  it("does not track access denial while tier is loading", async () => {
    mockUseCommunity.mockReturnValue({
      selectedCommunityRole: "secretary",
      selectedCommunityTier: null,
    });

    await renderReportsIndex();

    expect(screen.getByText(/checking your plan/i)).toBeInTheDocument();
    expect(mockTrackDashboardEvent).not.toHaveBeenCalled();
  });

  it("does not track access denial while role is loading", async () => {
    mockUseCommunity.mockReturnValue({
      selectedCommunityRole: null,
      selectedCommunityTier: "scale",
    });

    await renderReportsIndex();

    expect(screen.getByText(/checking your plan/i)).toBeInTheDocument();
    expect(mockTrackDashboardEvent).not.toHaveBeenCalled();
  });

  it("does not duplicate access denial analytics on a stable denied rerender", async () => {
    mockUseCommunity.mockReturnValue({
      selectedCommunityRole: "secretary",
      selectedCommunityTier: "scale",
    });

    const view = await renderReportsIndex();
    view.rerender(
      React.createElement(
        (await import("@/routes/_app.reports.index"))
          .Route as unknown as React.ComponentType,
      ),
    );

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledTimes(1);
    });
  });

  it("renders report cards for finance report roles", async () => {
    mockUseCommunity.mockReturnValue({
      selectedCommunityRole: "treasurer",
      selectedCommunityTier: "scale",
    });

    await renderReportsIndex();

    expect(
      screen.getByRole("heading", { name: "Reports", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Trial Balance")).toBeInTheDocument();
    expect(screen.getByText("Audit Pack")).toBeInTheDocument();
  });
});
