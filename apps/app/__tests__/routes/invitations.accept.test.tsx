import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockNavigate = vi.fn();
const mockAcceptInvitation = vi.fn();
const mockUseSession = vi.fn();
const mockUseParams = vi.fn(() => ({ token: "invite-token-123" }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) => {
      (
        component as React.ComponentType & { useParams?: typeof mockUseParams }
      ).useParams = mockUseParams;
      return component;
    },
  useNavigate: () => mockNavigate,
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    useSession: mockUseSession,
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    communities: {
      acceptInvitation: mockAcceptInvitation,
    },
  },
}));

async function renderInvitationPage() {
  const mod = await import("@/routes/invitations.$token.accept");
  const InvitationPage = mod.Route as unknown as React.ComponentType;
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <InvitationPage />
    </QueryClientProvider>,
  );
}

describe("AcceptInvitationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    mockUseParams.mockReturnValue({ token: "invite-token-123" });
  });

  it("prompts signed-out users to sign in or create an account", async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue({ data: null });

    await renderInvitationPage();

    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/login",
      search: { redirect: "/invitations/invite-token-123/accept" },
    });

    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/signup",
      search: { redirect: "/invitations/invite-token-123/accept" },
    });
  });

  it("shows the actionable message for a 4xx failure (e.g. expired link)", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "u-1", email: "invitee@example.com" } },
    });
    // Production API failures are ApiError instances carrying a status. A 4xx
    // expired/invalid-link message is actionable and must pass through.
    mockAcceptInvitation.mockRejectedValue(
      Object.assign(new Error("Invitation expired."), { status: 410 }),
    );

    await renderInvitationPage();

    await waitFor(() => {
      expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    });
    // The optimistic "Accepting your invitation…" heading must not linger
    // once the request has failed.
    expect(
      screen.queryByText("Accepting your invitation…"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Invitation expired.");
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("shows friendly fallback copy for a server error, not the raw message", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "u-1", email: "invitee@example.com" } },
    });
    mockAcceptInvitation.mockRejectedValue(
      Object.assign(new Error("ECONNRESET at db.pool"), { status: 500 }),
    );

    await renderInvitationPage();

    await waitFor(() => {
      expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "We could not accept this invitation. Please try again.",
    );
    expect(alert).not.toHaveTextContent("ECONNRESET");
  });

  it("accepts the invitation automatically for signed-in users", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "u-1", email: "invitee@example.com" } },
    });
    mockAcceptInvitation.mockResolvedValue({ ok: true });

    await renderInvitationPage();

    await waitFor(() => {
      expect(mockAcceptInvitation).toHaveBeenCalledWith("invite-token-123");
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
    });
  });
});
