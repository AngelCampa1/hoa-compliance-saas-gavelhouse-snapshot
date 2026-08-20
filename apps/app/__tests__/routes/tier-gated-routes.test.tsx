import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseCommunity = vi.fn();
const mockMeetingsList = vi.fn();
const mockViolationsList = vi.fn();
const mockArchRequestsList = vi.fn();
const mockCloseList = vi.fn();
const mockTransitionsList = vi.fn();

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

vi.mock("@/lib/community-context", () => ({
  useCommunity: () => mockUseCommunity(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    governance: {
      meetings: {
        list: (communityId: string) => mockMeetingsList(communityId),
        create: vi.fn(),
        recordMinutes: vi.fn(),
      },
      violations: {
        list: (communityId: string) => mockViolationsList(communityId),
        create: vi.fn(),
        updateStatus: vi.fn(),
      },
      archRequests: {
        list: (communityId: string) => mockArchRequestsList(communityId),
        create: vi.fn(),
        review: vi.fn(),
      },
      transitions: {
        list: (communityId: string) => mockTransitionsList(communityId),
        acknowledge: vi.fn(),
        complete: vi.fn(),
      },
    },
    close: {
      list: (communityId: string) => mockCloseList(communityId),
      getChecklist: vi.fn(),
      start: vi.fn(),
    },
  },
}));

vi.mock("@boardstack/shared", () => ({
  FEATURE_MINIMUM_TIER: {
    "governance-workflows": "growth",
    "month-end-close": "scale",
  },
  roleCan: () => true,
  tierAllowsFeature: () => false,
  getPageHelpForRoute: () => undefined,
}));

async function renderRoute(importPath: string) {
  const mod = (await import(importPath)) as {
    Route: React.ComponentType;
  };
  const Route = mod.Route;
  return render(<Route />);
}

describe("tier-gated app routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCommunity.mockReturnValue({
      selectedCommunityId: "comm-1",
      selectedCommunityRole: "owner",
      selectedCommunityTier: "starter",
    });
  });

  it.each([
    [
      "meetings",
      "@/routes/_app.governance.meetings",
      /board meetings require growth/i,
      mockMeetingsList,
    ],
    [
      "violations",
      "@/routes/_app.governance.violations",
      /violation log requires growth/i,
      mockViolationsList,
    ],
    [
      "architectural requests",
      "@/routes/_app.governance.arch-requests",
      /architectural requests require growth/i,
      mockArchRequestsList,
    ],
    [
      "board transitions",
      "@/routes/_app.governance.transitions",
      /board transitions require growth/i,
      mockTransitionsList,
    ],
    [
      "month-end close",
      "@/routes/_app.close",
      /month-end close requires scale/i,
      mockCloseList,
    ],
  ])(
    "does not fetch %s data when the active tier is too low",
    async (_label, importPath, heading, listSpy) => {
      await renderRoute(importPath);

      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
      expect(
        screen.getByRole("link", { name: /upgrade plan/i }),
      ).toHaveAttribute("href", "/billing");
      expect(listSpy).not.toHaveBeenCalled();
    },
  );
});
