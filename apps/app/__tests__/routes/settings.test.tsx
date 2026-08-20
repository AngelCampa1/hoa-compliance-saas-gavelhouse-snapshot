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
  data: { user: { id: "u-1", email: "owner@example.com" } },
}));
const mockChangePassword = vi.fn();
const mockDeleteUser = vi.fn();
const mockList = vi.fn();
const mockSetup = vi.fn();
const mockInvite = vi.fn();
const mockTrackDashboardEvent = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockNavigate = vi.fn();
let selectedCommunityId = "community-2";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    useSession: () => mockUseSession(),
    changePassword: (data: unknown) => mockChangePassword(data),
    deleteUser: (data?: unknown) => mockDeleteUser(data),
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    communities: {
      list: () => mockList(),
      setup: (data: unknown) => mockSetup(data),
      invite: (communityId: string, email: string, role: string) =>
        mockInvite(communityId, email, role),
    },
  },
}));

vi.mock("@/lib/community-context", () => ({
  useCommunity: () => ({
    selectedCommunityId,
  }),
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (message: string) => mockToastSuccess(message),
    error: (message: string) => mockToastError(message),
  },
}));

vi.mock("@/lib/sentry", () => ({
  reportUserFacingError: (_err: unknown, fallback: string) => fallback,
}));

async function renderSettingsPage() {
  const mod = await import("@/routes/_app.settings");
  const SettingsPage = mod.Route as unknown as React.ComponentType;
  const config: QueryClientConfig = {
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  };
  const client = new QueryClient(config);
  const utils = render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>,
  );
  return { ...utils, SettingsPage, client };
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedCommunityId = "community-2";
    mockList.mockResolvedValue({
      communities: [
        {
          community: {
            id: "community-1",
            name: "Alpha HOA",
            slug: "alpha-hoa",
            state: "CA",
            ownerUserId: "u-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          role: "owner",
        },
        {
          community: {
            id: "community-2",
            name: "Beta HOA",
            slug: "beta-hoa",
            state: "TX",
            ownerUserId: "u-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          role: "owner",
        },
      ],
    });
    mockSetup.mockResolvedValue({ ok: true });
    mockInvite.mockResolvedValue({ token: "invite-token-123" });
    mockChangePassword.mockResolvedValue({ data: null, error: null });
    mockDeleteUser.mockResolvedValue({ data: null, error: null });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("updates and invites against the currently selected community", async () => {
    const user = userEvent.setup();

    await renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Beta HOA")).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText("Community name"));
    await user.type(
      screen.getByLabelText("Community name"),
      "Beta Gardens HOA",
    );
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(mockSetup).toHaveBeenCalledWith({
        communityId: "community-2",
        name: "Beta Gardens HOA",
        state: "TX",
      });
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "community_settings_updated",
      {
        changed_name: true,
        changed_state: false,
        community_id: "community-2",
      },
    );

    await user.type(
      screen.getByLabelText("Email address"),
      "boardmember@example.com",
    );
    await user.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() => {
      expect(mockInvite).toHaveBeenCalledWith(
        "community-2",
        "boardmember@example.com",
        "treasurer",
      );
    });

    expect(
      screen.getByText(
        "http://localhost:3000/invitations/invite-token-123/accept",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /invitation role/i }),
    ).toHaveTextContent("Treasurer");
    expect(
      screen.getByRole("combobox", { name: /community state/i }),
    ).toHaveTextContent("Texas");
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "boardmember@example.com",
    );
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "invite-token-123",
    );
  });

  it("tracks failed community settings saves without raw values", async () => {
    const user = userEvent.setup();
    mockSetup.mockRejectedValueOnce(new Error("backend detail"));

    await renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Beta HOA")).toBeInTheDocument();
    });
    await user.clear(screen.getByLabelText("Community name"));
    await user.type(screen.getByLabelText("Community name"), "Private Name");
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "We could not save your settings. Please try again.",
      );
    });
    expect(mockToastError).not.toHaveBeenCalledWith("backend detail");
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "community_settings_update_failed",
      {
        changed_name: true,
        changed_state: false,
        community_id: "community-2",
        failure_type: "api_error",
      },
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("Private Name");
    expect(calls).not.toContain("backend detail");
  });

  it("disables saving until the current community resolves", async () => {
    const user = userEvent.setup();
    mockList.mockImplementation(() => new Promise<never>(() => {}));

    await renderSettingsPage();

    expect(
      screen.getByRole("button", { name: /save settings/i }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(mockSetup).not.toHaveBeenCalled();
  });

  it("does not switch settings selects between controlled and uncontrolled", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue("Beta HOA")).toBeInTheDocument();
      });

      const messages = [
        ...consoleError.mock.calls.flat(),
        ...consoleWarn.mock.calls.flat(),
      ].map(String);
      expect(
        messages.some((message) =>
          message.includes("changing from uncontrolled to controlled"),
        ),
      ).toBe(false);
      expect(
        messages.some((message) =>
          message.includes("changing from controlled to uncontrolled"),
        ),
      ).toBe(false);
    } finally {
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    }
  });

  it("clears the invitation link when the active community changes", async () => {
    const user = userEvent.setup();
    const { rerender, SettingsPage, client } = await renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Beta HOA")).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText("Email address"),
      "boardmember@example.com",
    );
    await user.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "http://localhost:3000/invitations/invite-token-123/accept",
        ),
      ).toBeInTheDocument();
    });

    selectedCommunityId = "community-1";
    rerender(
      <QueryClientProvider client={client}>
        <SettingsPage />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.queryByText(
          "http://localhost:3000/invitations/invite-token-123/accept",
        ),
      ).not.toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Alpha HOA")).toBeInTheDocument();
  });

  it("clears the invitation link when the selected role changes", async () => {
    const user = userEvent.setup();

    await renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Beta HOA")).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText("Email address"),
      "boardmember@example.com",
    );
    await user.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "http://localhost:3000/invitations/invite-token-123/accept",
        ),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("combobox", { name: /invitation role/i }),
    );
    await user.click(screen.getByRole("option", { name: "Viewer" }));

    await waitFor(() => {
      expect(
        screen.queryByText(
          "http://localhost:3000/invitations/invite-token-123/accept",
        ),
      ).not.toBeInTheDocument();
    });
  });

  it("preserves the submitted role after a successful invite", async () => {
    const user = userEvent.setup();

    await renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Beta HOA")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("combobox", { name: /invitation role/i }),
    );
    await user.click(screen.getByRole("option", { name: "Viewer" }));
    await user.type(
      screen.getByLabelText("Email address"),
      "boardmember@example.com",
    );
    await user.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "http://localhost:3000/invitations/invite-token-123/accept",
        ),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("combobox", { name: /invitation role/i }),
    ).toHaveTextContent("Viewer");
  });

  it("deletes the account after explicit confirmation", async () => {
    const user = userEvent.setup();

    await renderSettingsPage();

    await user.type(screen.getByLabelText("Password"), "current-password");
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(screen.getByRole("button", { name: /delete account/i }));

    await waitFor(() => {
      expect(mockDeleteUser).toHaveBeenCalledWith({
        password: "current-password",
      });
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "account_deletion_requested",
      {
        credential_provided: true,
        source: "settings",
      },
    );
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "account_deletion_completed",
      {
        source: "settings",
      },
    );
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "current-password",
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("Account deleted.");
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/login", replace: true });
  });

  it("tracks account deletion failures without password or raw error text", async () => {
    const user = userEvent.setup();
    mockDeleteUser.mockRejectedValueOnce(new Error("provider detail"));

    await renderSettingsPage();

    await user.type(screen.getByLabelText("Password"), "current-password");
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(screen.getByRole("button", { name: /delete account/i }));

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "account_deletion_failed",
        {
          failure_type: "api_error",
          source: "settings",
        },
      );
    });
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("current-password");
    expect(calls).not.toContain("provider detail");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("tracks password changes and failures without password values", async () => {
    const user = userEvent.setup();

    await renderSettingsPage();

    await user.type(screen.getByLabelText("Current password"), "old-password");
    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "new-password",
    );
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        currentPassword: "old-password",
        newPassword: "new-password",
        revokeOtherSessions: true,
      });
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "account_password_changed",
      {
        source: "settings",
      },
    );

    mockChangePassword.mockRejectedValueOnce(new Error("password detail"));
    await user.type(screen.getByLabelText("Current password"), "old-password");
    await user.type(screen.getByLabelText("New password"), "next-password");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "next-password",
    );
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "account_password_change_failed",
        {
          failure_type: "api_error",
          source: "settings",
        },
      );
    });
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("old-password");
    expect(calls).not.toContain("next-password");
    expect(calls).not.toContain("password detail");
  });

  it("tracks invite link copies without the token or URL", async () => {
    const user = userEvent.setup();

    await renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Beta HOA")).toBeInTheDocument();
    });
    await user.type(
      screen.getByLabelText("Email address"),
      "boardmember@example.com",
    );
    await user.click(screen.getByRole("button", { name: /^invite$/i }));
    await screen.findByText(
      "http://localhost:3000/invitations/invite-token-123/accept",
    );
    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "member_invite_link_copied",
      {
        community_id: "community-2",
        role: "treasurer",
        source: "settings",
      },
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("boardmember@example.com");
    expect(calls).not.toContain("invite-token-123");
    expect(calls).not.toContain("/invitations/");
  });

  it("does not track invite link copy when clipboard write fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("clipboard detail")),
      },
    });

    await renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Beta HOA")).toBeInTheDocument();
    });
    await user.type(
      screen.getByLabelText("Email address"),
      "boardmember@example.com",
    );
    await user.click(screen.getByRole("button", { name: /^invite$/i }));
    await screen.findByText(
      "http://localhost:3000/invitations/invite-token-123/accept",
    );
    await user.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to copy link.");
    });
    expect(mockTrackDashboardEvent).not.toHaveBeenCalledWith(
      "member_invite_link_copied",
      expect.anything(),
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("clipboard detail");
    expect(calls).not.toContain("invite-token-123");
  });

  it("requires DELETE confirmation before deleting the account", async () => {
    const user = userEvent.setup();

    await renderSettingsPage();

    await user.type(screen.getByLabelText("Password"), "current-password");
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "delete");
    await user.click(screen.getByRole("button", { name: /delete account/i }));

    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Type DELETE to confirm account deletion"),
    ).toBeInTheDocument();
  });
});
