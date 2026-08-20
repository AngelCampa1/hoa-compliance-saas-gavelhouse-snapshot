import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockNavigate = vi.fn();
const mockTrackDashboardEvent = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
  useNavigate: () => mockNavigate,
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, string>;
  }) => {
    const href = search
      ? `${to}?${new URLSearchParams(search).toString()}`
      : to;
    return <a href={href}>{children}</a>;
  },
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
    signUp: {
      email: vi.fn(),
    },
    signOut: vi.fn(),
    useSession: vi.fn(() => ({ data: null, refetch: vi.fn() })),
  },
  getAuthProviders: vi.fn().mockResolvedValue({ google: true }),
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

import { authClient, getAuthProviders } from "@/lib/auth";

async function renderLoginPage() {
  const mod = await import("@/routes/login");
  const LoginPage = mod.Route as unknown as React.ComponentType;
  await act(async () => {
    render(<LoginPage />);
  });
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    vi.mocked(getAuthProviders).mockResolvedValue({ google: true });
    window.history.replaceState({}, "", "http://localhost:3000/login");
  });

  it("shows error and restores Google button when signIn.social resolves with error", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signIn.social).mockResolvedValue({
      data: null,
      error: { message: "Google sign-in failed." },
    });

    await renderLoginPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue with google/i }),
      ).toBeEnabled();
    });

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Google sign-in failed.")).toBeInTheDocument();
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "oauth_login_started",
      {
        has_redirect: false,
        provider: "google",
      },
    );
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("oauth_login_failed", {
      failure_type: "provider_error",
      has_redirect: false,
      provider: "google",
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "Google sign-in failed.",
    );

    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
  });

  it("uses fallback message when social error.message is undefined", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signIn.social).mockResolvedValue({
      data: null,
      error: { message: undefined },
    });

    await renderLoginPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue with google/i }),
      ).toBeEnabled();
    });

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Google sign-in failed.")).toBeInTheDocument();
    });
  });

  it("tracks Google sign-in exceptions and restores the button", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signIn.social).mockRejectedValue(
      new Error("oauth detail"),
    );

    await renderLoginPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue with google/i }),
      ).toBeEnabled();
    });

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Google sign-in failed.")).toBeInTheDocument();
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "oauth_login_started",
      {
        has_redirect: false,
        provider: "google",
      },
    );
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("oauth_login_failed", {
      failure_type: "unexpected_error",
      has_redirect: false,
      provider: "google",
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "oauth detail",
    );
    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeEnabled();
  });

  it("shows an error alert when signIn.email resolves with an error", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: null,
      error: { message: "Invalid email or password." },
    });

    await renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "somepassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Invalid email or password."),
      ).toBeInTheDocument();
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("login_started", {
      has_redirect: false,
      method: "email",
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("login_failed", {
      failure_type: "invalid_credentials",
      has_redirect: false,
      method: "email",
    });
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("test@example.com");
    expect(calls).not.toContain("somepassword");
  });

  it("uses fallback message when authError.message is undefined", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: null,
      error: { message: undefined },
    });

    await renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "somepassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Invalid email or password."),
      ).toBeInTheDocument();
    });
  });

  it("navigates to /dashboard when signIn.email resolves with data", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "test@example.com" } },
      error: null,
    });

    await renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "somepassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("login_completed", {
      has_redirect: false,
      method: "email",
    });
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "test@example.com",
    );
  });

  it("shows a transition state and refetches the session after email sign-in", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({ data: null });
    vi.mocked(authClient.useSession).mockReturnValue({ data: null, refetch });

    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "test@example.com" } },
      error: null,
    });

    await renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "somepassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      screen.getByRole("button", { name: /opening dashboard/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(refetch).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
    });
  });

  it("continues to the dashboard when the post-login session refetch fails", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockRejectedValue(new Error("refresh failed"));
    vi.mocked(authClient.useSession).mockReturnValue({ data: null, refetch });

    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "test@example.com" } },
      error: null,
    });

    await renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "somepassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(refetch).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
    });
    expect(screen.queryByText("refresh failed")).not.toBeInTheDocument();
  });

  it("uses a safe redirect target after email sign-in when present", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/login?redirect=%2Finvitations%2Ftok-1%2Faccept",
    );

    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "test@example.com" } },
      error: null,
    });

    await renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "somepassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        href: "/invitations/tok-1/accept",
      });
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("login_started", {
      has_redirect: true,
      method: "email",
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("login_completed", {
      has_redirect: true,
      method: "email",
    });
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("tok-1");
    expect(calls).not.toContain("/invitations/");
  });

  it("does not use an unsafe external redirect after sign-in", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/login?redirect=https://evil.example",
    );

    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "test@example.com" } },
      error: null,
    });

    await renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "somepassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
    });
  });

  it("ignores auth-route redirect loops after sign-in", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/login?redirect=%2Flogin",
    );

    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "test@example.com" } },
      error: null,
    });

    await renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "somepassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
    });
  });

  it("preserves redirect when switching to signup", async () => {
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/login?redirect=%2Finvitations%2Ftok-1%2Faccept",
    );

    await renderLoginPage();

    expect(
      screen.getByRole("link", { name: /start free trial/i }),
    ).toHaveAttribute(
      "href",
      "/signup?redirect=%2Finvitations%2Ftok-1%2Faccept",
    );
  });

  it("redirects signed-in users with a safe redirect target", async () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: {
        user: { id: "u-1", email: "test@example.com", name: "Test User" },
      },
    });
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/login?redirect=%2Finvitations%2Ftok-1%2Faccept",
    );

    await renderLoginPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        href: "/invitations/tok-1/accept",
        replace: true,
      });
    });
  });

  it("redirects signed-in users to the dashboard by default", async () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: {
        user: { id: "u-1", email: "test@example.com", name: "Test User" },
      },
    });

    await renderLoginPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/dashboard",
        replace: true,
      });
    });
  });

  it("disables Google sign-in when the provider is unavailable", async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false });

    await renderLoginPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue with google/i }),
      ).toBeDisabled();
    });
    await waitFor(() => {
      expect(
        screen.getByText(/google sign-in is unavailable in this environment/i),
      ).toBeInTheDocument();
    });
  });

  it("shows friendly validation messages for empty fields", async () => {
    const user = userEvent.setup();

    await renderLoginPage();

    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByText("Enter a valid email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(authClient.signIn.email).not.toHaveBeenCalled();
  });

  it("exposes the show-password toggle state to assistive tech", async () => {
    const user = userEvent.setup();

    await renderLoginPage();

    const toggle = screen.getByRole("button", { name: /show password/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );

    await user.click(toggle);

    const hide = screen.getByRole("button", { name: /hide password/i });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  });

  it("disables the sign-in button while Google sign-in is in flight", async () => {
    const user = userEvent.setup();
    vi.mocked(authClient.signIn.social).mockImplementation(
      () => new Promise(() => {}),
    );

    await renderLoginPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue with google/i }),
      ).toBeEnabled();
    });

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^sign in$/i })).toBeDisabled();
    });
  });
});
