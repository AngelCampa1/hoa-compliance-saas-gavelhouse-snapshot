import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@tanstack/react-router", () => ({
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

const mockUseCommunity = vi.fn();

vi.mock("@/lib/community-context", () => ({
  useCommunity: () => mockUseCommunity(),
}));

describe("TierUpgradeGate", () => {
  it("renders an upgrade state instead of gated report content for lower tiers", async () => {
    mockUseCommunity.mockReturnValue({ selectedCommunityTier: "growth" });
    const { TierUpgradeGate } = await import("@/components/tier-upgrade-gate");

    render(
      <TierUpgradeGate feature="reports" featureName="Reports">
        <div>Scale-only report table</div>
      </TierUpgradeGate>,
    );

    expect(screen.getByRole("heading", { name: /reports require scale/i }));
    expect(screen.getByRole("link", { name: /upgrade plan/i })).toHaveAttribute(
      "href",
      "/billing",
    );
    expect(
      screen.queryByText("Scale-only report table"),
    ).not.toBeInTheDocument();
  });

  it("renders children when the current tier allows the feature", async () => {
    mockUseCommunity.mockReturnValue({
      selectedCommunityRole: "treasurer",
      selectedCommunityTier: "scale",
    });
    const { TierUpgradeGate } = await import("@/components/tier-upgrade-gate");

    render(
      <TierUpgradeGate
        feature="reports"
        featureName="Reports"
        capability="report:read"
      >
        <div>Scale-only report table</div>
      </TierUpgradeGate>,
    );

    expect(screen.getByText("Scale-only report table")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /upgrade plan/i })).toBeNull();
  });

  it("renders a loading state while plan access is unknown", async () => {
    mockUseCommunity.mockReturnValue({
      selectedCommunityRole: "treasurer",
      selectedCommunityTier: null,
    });
    const { TierUpgradeGate } = await import("@/components/tier-upgrade-gate");

    render(
      <TierUpgradeGate feature="reports" featureName="Reports">
        <div>Scale-only report table</div>
      </TierUpgradeGate>,
    );

    expect(screen.getByText("Checking your plan...")).toBeInTheDocument();
    expect(
      screen.queryByText("Scale-only report table"),
    ).not.toBeInTheDocument();
  });

  it("uses singular grammar for one-name gated features", async () => {
    mockUseCommunity.mockReturnValue({ selectedCommunityTier: "growth" });
    const { TierUpgradeGate } = await import("@/components/tier-upgrade-gate");

    render(
      <TierUpgradeGate feature="audit-pack" featureName="Audit pack">
        <div>Audit pack download</div>
      </TierUpgradeGate>,
    );

    expect(
      screen.getByRole("heading", { name: /audit pack requires scale/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Audit pack download")).not.toBeInTheDocument();
  });

  it("renders access denied instead of report content for roles without capability", async () => {
    mockUseCommunity.mockReturnValue({
      selectedCommunityRole: "secretary",
      selectedCommunityTier: "scale",
    });
    const { TierUpgradeGate } = await import("@/components/tier-upgrade-gate");

    render(
      <TierUpgradeGate
        feature="reports"
        featureName="Reports"
        capability="report:read"
      >
        <div>Report API-backed table</div>
      </TierUpgradeGate>,
    );

    expect(
      screen.getByRole("heading", { name: /reports access denied/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Report API-backed table")).toBeNull();
    expect(screen.queryByRole("link", { name: /upgrade plan/i })).toBeNull();
  });
});
