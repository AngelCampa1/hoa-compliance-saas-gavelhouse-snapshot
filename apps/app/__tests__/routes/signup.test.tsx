import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockNavigate = vi.fn();
const trackDashboardEventMock = vi.fn();

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
    useSession: vi.fn(() => ({ data: null })),
  },
  getAuthProviders: vi.fn().mockResolvedValue({ google: true }),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: trackDashboardEventMock,
}));

import {
  authClient,
  getAuthProviders,
  sendVerificationEmail,
} from "@/lib/auth";

let sessionData: { user: { id: string; email: string; name?: string } } | null =
  null;

async function renderSignupPage() {
  const mod = await import("@/routes/signup");
  const SignupPage = mod.Route as unknown as React.ComponentType;
  await act(async () => {
    render(<SignupPage />);
  });
}

async function fillSignupForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { name?: string; email?: string; password?: string } = {},
) {
  await user.type(
    screen.getByLabelText(/your name/i),
    overrides.name ?? "Jane Doe",
  );
  await user.type(
    screen.getByLabelText(/work email/i),
    overrides.email ?? "jane@example.com",
  );
  await user.type(
    screen.getByLabelText("Password"),
    overrides.password ?? "securepassword",
  );
}

describe("SignupPage", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    vi.mocked(getAuthProviders).mockResolvedValue({ google: true });
    sessionData = null;
    vi.mocked(authClient.useSession).mockImplementation(() => ({
      data: sessionData,
    }));
    window.history.replaceState({}, "", "http://localhost:3000/signup");
  });

  it("renders a split-pane layout with the sales pitch and form fields", async () => {
    await renderSignupPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /personal liability/i,
    );
    expect(
      screen.getByText(/reserve fund compliance for self-managed boards/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /create your gavelhouse account/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/start your 30-day free trial/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Flat about $10-$50/mo with Y80OFF"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Flat \$20/)).not.toBeInTheDocument();
    expect(screen.getByText(/No credit card required/i)).toBeInTheDocument();

    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i }),
    ).toBeInTheDocument();
  });

  it("does not collect community name or state on the signup page", async () => {
    await renderSignupPage();

    expect(screen.queryByLabelText(/community name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^state$/i)).not.toBeInTheDocument();
  });

  it("creates the account and navigates to /setup on successful submit", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "jane@example.com" } },
      error: null,
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(authClient.signUp.email).toHaveBeenCalledWith({
        name: "Jane Doe",
        email: "jane@example.com",
        password: "securepassword",
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ href: "/setup" });
    });
  });

  it("tracks successful email signup without sending PII", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "jane@example.com" } },
      error: null,
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(trackDashboardEventMock).toHaveBeenCalledWith("signup_started", {
        method: "email",
        redirect_target: "setup",
      });
    });
    expect(trackDashboardEventMock).toHaveBeenCalledWith("signup_completed", {
      method: "email",
      redirect_target: "setup",
    });
    expect(JSON.stringify(trackDashboardEventMock.mock.calls)).not.toContain(
      "jane@example.com",
    );
  });

  it("shows the email confirmation reminder after a successful signup", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "jane@example.com" } },
      error: null,
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/jane@example\.com/i)).toBeInTheDocument();
  });

  it("resends the verification email from the confirmation reminder", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "jane@example.com" } },
      error: null,
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await user.click(
      await screen.findByRole("button", { name: /resend confirmation/i }),
    );

    expect(sendVerificationEmail).toHaveBeenCalledWith("jane@example.com");
    expect(
      await screen.findByText(/confirmation email sent/i),
    ).toBeInTheDocument();
  });

  it("shows an error when resend verification fails", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "jane@example.com" } },
      error: null,
    });
    vi.mocked(sendVerificationEmail).mockRejectedValueOnce(
      new Error("resend failed"),
    );

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await user.click(
      await screen.findByRole("button", { name: /resend confirmation/i }),
    );

    expect(
      await screen.findByText(/could not resend the confirmation email/i),
    ).toBeInTheDocument();
  });

  it("shows an error alert when signUp.email resolves with an error", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: null,
      error: { message: "Email already in use." },
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText("Email already in use.")).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("tracks duplicate email signup separately from generic failures", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: null,
      error: { message: "Email already in use." },
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(trackDashboardEventMock).toHaveBeenCalledWith("signup_duplicate", {
        failure_type: "auth_error",
        method: "email",
        redirect_target: "setup",
      });
    });
    expect(trackDashboardEventMock).not.toHaveBeenCalledWith(
      "signup_failed",
      expect.anything(),
    );
  });

  it("uses fallback message when signUpError.message is undefined", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: null,
      error: { message: undefined },
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText("Account creation failed.")).toBeInTheDocument();
    });
  });

  it("shows fallback when signUp.email resolves with no data and no error", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: null,
      error: null,
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText("Account creation failed.")).toBeInTheDocument();
    });
  });

  it("shows error and restores Google button when signIn.social resolves with error", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signIn.social).mockResolvedValue({
      data: null,
      error: { message: "Google sign-in failed." },
    });

    await renderSignupPage();
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

    await renderSignupPage();
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

  it("sends Google sign-in callback to /setup by default", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signIn.social).mockResolvedValue({
      data: null,
      error: { message: "Google sign-in failed." },
    });

    await renderSignupPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue with google/i }),
      ).toBeEnabled();
    });

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    expect(authClient.signIn.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/setup",
    });
  });

  it("tracks Google signup start and failure without provider error text", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signIn.social).mockResolvedValue({
      data: null,
      error: { message: "Google sign-in failed." },
    });

    await renderSignupPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue with google/i }),
      ).toBeEnabled();
    });

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    expect(trackDashboardEventMock).toHaveBeenCalledWith("signup_started", {
      method: "google",
      redirect_target: "setup",
    });
    await waitFor(() => {
      expect(trackDashboardEventMock).toHaveBeenCalledWith("signup_failed", {
        failure_type: "provider_error",
        method: "google",
        redirect_target: "setup",
      });
    });
    expect(JSON.stringify(trackDashboardEventMock.mock.calls)).not.toContain(
      "Google sign-in failed.",
    );
  });

  it("disables Google sign-up when the provider is unavailable", async () => {
    vi.mocked(getAuthProviders).mockResolvedValue({ google: false });

    await renderSignupPage();

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

  it("uses a safe redirect target after email signup when present", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/signup?redirect=%2Finvitations%2Ftok-1%2Faccept",
    );

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "jane@example.com" } },
      error: null,
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        href: "/invitations/tok-1/accept",
      });
    });
  });

  it("ignores unsafe redirect targets after signup", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/signup?redirect=https://evil.example",
    );

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "jane@example.com" } },
      error: null,
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ href: "/setup" });
    });
  });

  it("ignores auth-route redirect loops after signup", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/signup?redirect=%2Fsignup",
    );

    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { user: { id: "u-1", email: "jane@example.com" } },
      error: null,
    });

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ href: "/setup" });
    });
  });

  it("preserves redirect when switching back to login", async () => {
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/signup?redirect=%2Finvitations%2Ftok-1%2Faccept",
    );

    await renderSignupPage();

    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login?redirect=%2Finvitations%2Ftok-1%2Faccept",
    );
  });

  it("redirects already-signed-in users to the safe redirect target on mount", async () => {
    sessionData = {
      user: { id: "u-1", email: "jane@example.com", name: "Jane Doe" },
    };
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/signup?redirect=%2Finvitations%2Ftok-1%2Faccept",
    );

    await renderSignupPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        href: "/invitations/tok-1/accept",
        replace: true,
      });
    });
  });

  it("redirects already-signed-in users through /setup when no redirect is present", async () => {
    // /setup auto-bounces to /dashboard when the community already exists, so
    // a re-onboarded user transparently lands on the dashboard. Routing
    // through /setup also covers the edge case where a session exists but
    // the community-create hook left no community.
    sessionData = {
      user: { id: "u-1", email: "jane@example.com", name: "Jane Doe" },
    };

    await renderSignupPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        href: "/setup",
        replace: true,
      });
    });
  });

  it("reports a tracking ID when signUp.email throws an exception", async () => {
    const user = userEvent.setup();

    vi.mocked(authClient.signUp.email).mockRejectedValueOnce(
      new Error("network down"),
    );

    await renderSignupPage();
    await fillSignupForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/We could not create your account/i),
      ).toBeInTheDocument();
    });
    expect(trackDashboardEventMock).toHaveBeenCalledWith("signup_failed", {
      failure_type: "exception",
      method: "email",
      redirect_target: "setup",
    });
  });

  it("validates required form fields before submission", async () => {
    const user = userEvent.setup();

    await renderSignupPage();
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByText("Your name is required."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email.")).toBeInTheDocument();
    expect(
      screen.getByText("Password must be at least 8 characters."),
    ).toBeInTheDocument();
    expect(authClient.signUp.email).not.toHaveBeenCalled();
  });

  it("shows the password length hint up front", async () => {
    await renderSignupPage();

    expect(screen.getByText("At least 8 characters.")).toBeInTheDocument();
  });

  it("exposes the show-password toggle state to assistive tech", async () => {
    const user = userEvent.setup();

    await renderSignupPage();

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

  it("disables the create-account button while Google sign-in is in flight", async () => {
    const user = userEvent.setup();
    vi.mocked(authClient.signIn.social).mockImplementation(
      () => new Promise(() => {}),
    );

    await renderSignupPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue with google/i }),
      ).toBeEnabled();
    });

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /create account/i }),
      ).toBeDisabled();
    });
  });
});
