import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockList = vi.fn();
const mockGetChecklist = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
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
    close: {
      list: () => mockList(),
      getChecklist: (closeId: string, communityId: string) =>
        mockGetChecklist(closeId, communityId),
      start: vi.fn(),
      auditPackUrl: (closeId: string, communityId: string) =>
        `https://api.test/close/${closeId}/pack-url?communityId=${communityId}`,
    },
  },
}));

vi.mock("@boardstack/shared", () => ({
  FEATURE_MINIMUM_TIER: {
    "month-end-close": "scale",
  },
  getPageHelpForRoute: () => undefined,
  roleCan: () => true,
  tierAllowsFeature: () => true,
}));

vi.mock("@/components/close/CloseChecklist", () => ({
  CloseChecklist: ({ closeId }: { closeId: string }) => (
    <div data-testid="close-checklist">Checklist for {closeId}</div>
  ),
}));

function renderClosePage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return import("@/routes/_app.close").then((mod) => {
    const ClosePage = mod.Route as unknown as React.ComponentType;
    return render(
      <QueryClientProvider client={client}>
        <ClosePage />
      </QueryClientProvider>,
    );
  });
}

describe("MonthEndClosePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({
      closes: [
        {
          id: "close-open",
          communityId: "comm-1",
          periodYear: 2026,
          periodMonth: 4,
          status: "open",
          completedAt: null,
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    });
    mockGetChecklist.mockResolvedValue({
      items: [
        {
          step: "bank_reconciled",
          completed: false,
          completedAt: null,
        },
      ],
    });
  });

  it("loads the active close checklist without requiring historical selection", async () => {
    await renderClosePage();

    await waitFor(() => {
      expect(mockGetChecklist).toHaveBeenCalledWith("close-open", "comm-1");
    });
    expect(await screen.findByTestId("close-checklist")).toHaveTextContent(
      "Checklist for close-open",
    );
  });

  it("keeps audit pack downloads available for completed historical periods", async () => {
    mockList.mockResolvedValue({
      closes: [
        {
          id: "close-open",
          communityId: "comm-1",
          periodYear: 2026,
          periodMonth: 5,
          status: "open",
          auditPackKey: null,
          startedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "close-complete",
          communityId: "comm-1",
          periodYear: 2026,
          periodMonth: 4,
          status: "complete",
          auditPackKey: "comm-1/2026-04/audit-pack.zip",
          startedAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    });

    await renderClosePage();

    const link = await screen.findByRole("link", {
      name: /download audit pack for 2026-04/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://api.test/close/close-complete/pack-url?communityId=comm-1",
    );
  });

  it("shows the audit pack download for a selected completed close", async () => {
    mockList.mockResolvedValue({
      closes: [
        {
          id: "close-open",
          communityId: "comm-1",
          periodYear: 2026,
          periodMonth: 5,
          status: "open",
          auditPackKey: null,
          startedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "close-complete",
          communityId: "comm-1",
          periodYear: 2026,
          periodMonth: 4,
          status: "complete",
          auditPackKey: "comm-1/2026-04/audit-pack.zip",
          startedAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    });
    const user = userEvent.setup();

    await renderClosePage();
    await user.click(await screen.findByRole("button", { name: /2026-04/i }));

    const link = await screen.findByRole("link", {
      name: /download audit pack for 2026-04/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://api.test/close/close-complete/pack-url?communityId=comm-1",
    );
    await waitFor(() => {
      expect(mockGetChecklist).toHaveBeenCalledWith("close-complete", "comm-1");
    });
  });
});
