import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";

const mockUseSession = vi.fn(() => ({
  data: { user: { id: "user-1", email: "treasurer@example.com" } },
}));
const mockList = vi.fn();
const mockActivationGet = vi.fn();
const mockActivationPatch = vi.fn();
const mockAiCsStartSession = vi.fn();
const mockAiCsChat = vi.fn();
const mockAiCsEscalate = vi.fn();
const mockTrackDashboardEvent = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
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
    },
    activation: {
      get: (communityId: string) => mockActivationGet(communityId),
      patch: (step: string, communityId: string, completed: boolean) =>
        mockActivationPatch(step, communityId, completed),
    },
    aiCs: {
      startSession: (data: unknown) => mockAiCsStartSession(data),
      chat: (data: unknown) => mockAiCsChat(data),
      escalate: (data: unknown) => mockAiCsEscalate(data),
    },
  },
}));

vi.mock("@/lib/community-context", () => ({
  useCommunity: () => ({
    selectedCommunityId: "community-1",
  }),
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

async function renderDashboardPage() {
  const mod = await import("@/routes/_app.dashboard");
  const DashboardPage = mod.Route as unknown as React.ComponentType;
  const config: QueryClientConfig = {
    defaultOptions: { queries: { retry: false } },
  };
  const client = new QueryClient(config);
  render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

describe("DashboardPage onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockList.mockResolvedValue({
      communities: [
        {
          community: {
            id: "community-1",
            name: "Sunset Ridge HOA",
            slug: "sunset-ridge-hoa",
            state: "CA",
            ownerUserId: "user-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          role: "owner",
        },
      ],
    });
    mockActivationGet.mockResolvedValue({
      activation: {
        communityId: "community-1",
        rosterImported: false,
        reservePopulated: false,
        complianceAcknowledged: false,
        dueBatchConfigured: false,
      },
    });
    mockActivationPatch.mockResolvedValue({ ok: true });
    mockAiCsStartSession.mockResolvedValue({ sessionId: "cs_123" });
    mockAiCsChat.mockResolvedValue({ reply: "Check your reserve dashboard." });
    mockAiCsEscalate.mockResolvedValue({ ok: true });
  });

  it("surfaces the current setup action at a glance", async () => {
    await renderDashboardPage();

    await waitFor(() => {
      expect(
        screen.getByText("0 of 4 setup steps complete"),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Import homeowner roster" }),
      ).toHaveAttribute("href", "/governance/homeowners");
    });
    expect(screen.queryByRole("link", { name: /do this/i })).toBeNull();
  });

  it("shows setup progress once without a redundant guided walkthrough", async () => {
    await renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("At a glance")).toBeInTheDocument();
    });

    // The standalone guided-setup walkthrough was consolidated away.
    expect(
      screen.queryByText("Use Gavelhouse one step at a time"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip guide" })).toBeNull();

    // Progress is shown once, not duplicated across stacked widgets.
    await waitFor(() => {
      expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    });

    // The detailed activation checklist remains the single source of truth.
    expect(screen.getByText("Activation checklist")).toBeInTheDocument();
  });

  it("starts authenticated AI support from the dashboard widget", async () => {
    const user = userEvent.setup();

    await renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("Gavelhouse support")).toBeInTheDocument();
    });
    await user.type(
      screen.getByLabelText("Support message"),
      "How do we handle reserve expenses?",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(mockAiCsStartSession).toHaveBeenCalledWith({
        topic: "dashboard",
        pageUrl: "http://localhost:3000/",
      });
    });
    expect(mockAiCsChat).toHaveBeenCalledWith({
      sessionId: "cs_123",
      message: "How do we handle reserve expenses?",
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "ai_support_message_sent",
      {
        content_length: 34,
        page_path: "/",
        reused_session: false,
        source: "dashboard_widget",
      },
    );
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "ai_support_reply_received",
      {
        content_length: 34,
        page_path: "/",
        reply_available: true,
        source: "dashboard_widget",
      },
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("How do we handle reserve expenses?");
    expect(calls).not.toContain("http://localhost:3000/");
    expect(
      screen.getByText("Check your reserve dashboard."),
    ).toBeInTheDocument();
  });

  it("tracks AI support failures without raw message text", async () => {
    const user = userEvent.setup();
    mockAiCsStartSession.mockResolvedValueOnce({ sessionId: "cs_123" });
    mockAiCsChat.mockRejectedValueOnce(new Error("worker detail"));

    await renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("Gavelhouse support")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("Support message"), "It broke");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        screen.getByText("Support is unavailable right now."),
      ).toBeInTheDocument();
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "ai_support_message_failed",
      {
        content_length: 8,
        failure_type: "unavailable",
        page_path: "/",
        source: "dashboard_widget",
      },
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("It broke");
    expect(calls).not.toContain("worker detail");
  });

  it("tracks attempted AI support sends even when session creation fails", async () => {
    const user = userEvent.setup();
    mockAiCsStartSession.mockRejectedValueOnce(new Error("session detail"));

    await renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("Gavelhouse support")).toBeInTheDocument();
    });
    await user.type(
      screen.getByLabelText("Support message"),
      "Need setup help",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        screen.getByText("Support is unavailable right now."),
      ).toBeInTheDocument();
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "ai_support_message_sent",
      {
        content_length: 15,
        page_path: "/",
        reused_session: false,
        source: "dashboard_widget",
      },
    );
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "ai_support_message_failed",
      {
        content_length: 15,
        failure_type: "unavailable",
        page_path: "/",
        source: "dashboard_widget",
      },
    );
    expect(mockAiCsChat).not.toHaveBeenCalled();
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("Need setup help");
    expect(calls).not.toContain("session detail");
  });

  it("does not flash a setup action before activation status loads", async () => {
    // While the activation query is still in flight, the Priority action card
    // must not assume step 1 is current (that would show "Import homeowner
    // roster" to a returning user who already finished it). It shows a
    // placeholder until the real status arrives.
    mockActivationGet.mockImplementation(() => new Promise(() => {}));

    await renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("Priority action")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("link", { name: "Import homeowner roster" }),
    ).toBeNull();
  });

  it("labels the at-a-glance jurisdiction tile as State, not Compliance", async () => {
    await renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("At a glance")).toBeInTheDocument();
    });
    expect(screen.getByText("State")).toBeInTheDocument();
    expect(screen.queryByText("Compliance")).toBeNull();
  });

  it("zero-state CTA links to /setup not /settings", async () => {
    mockList.mockResolvedValueOnce({ communities: [] });

    await renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("Set up your community")).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/setup",
    );
  });

  it("tracks when the AI support response has no explicit reply text", async () => {
    const user = userEvent.setup();
    mockAiCsChat.mockResolvedValueOnce({});

    await renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText("Gavelhouse support")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("Support message"), "Status?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        screen.getByText("Support received your message."),
      ).toBeInTheDocument();
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "ai_support_reply_received",
      {
        content_length: 7,
        page_path: "/",
        reply_available: false,
        source: "dashboard_widget",
      },
    );
  });
});
