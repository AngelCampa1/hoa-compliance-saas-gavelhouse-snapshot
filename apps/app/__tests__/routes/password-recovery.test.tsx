import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockNavigate = vi.fn();
const mockRequestPasswordReset = vi.fn();
const mockResetPassword = vi.fn();
const mockTrackDashboardEvent = vi.fn();
let resetToken: string | undefined = "reset-token-123";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) => {
      const route = Object.assign(component, {
        useSearch: () => ({ token: resetToken }),
      });
      return route;
    },
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    requestPasswordReset: (data: unknown) => mockRequestPasswordReset(data),
    resetPassword: (data: unknown) => mockResetPassword(data),
  },
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

vi.mock("@/lib/sentry", () => ({
  reportUserFacingError: (_err: unknown, fallback: string) => fallback,
}));

async function renderForgotPasswordPage() {
  const mod = await import("@/routes/forgot-password");
  const ForgotPasswordPage = mod.Route as unknown as React.ComponentType;
  render(<ForgotPasswordPage />);
}

async function renderResetPasswordPage() {
  const mod = await import("@/routes/reset-password");
  const ResetPasswordPage = mod.Route as unknown as React.ComponentType;
  render(<ResetPasswordPage />);
}

describe("password recovery analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetToken = "reset-token-123";
    mockNavigate.mockResolvedValue(undefined);
    mockRequestPasswordReset.mockResolvedValue({ data: null, error: null });
    mockResetPassword.mockResolvedValue({ data: null, error: null });
  });

  it("tracks password reset requests without email", async () => {
    const user = userEvent.setup();

    await renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith({
        email: "owner@example.com",
        redirectTo: "/reset-password",
      });
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "password_reset_requested",
      {
        source: "forgot_password",
      },
    );
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "owner@example.com",
    );
  });

  it("tracks password reset request failures without raw error text", async () => {
    const user = userEvent.setup();
    mockRequestPasswordReset.mockRejectedValueOnce(new Error("mail detail"));

    await renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "We could not send your reset email. Please try again.",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("mail detail")).not.toBeInTheDocument();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "password_reset_request_failed",
      {
        failure_type: "api_error",
        source: "forgot_password",
      },
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("owner@example.com");
    expect(calls).not.toContain("mail detail");
  });

  it("tracks resolved password reset request errors as failures", async () => {
    const user = userEvent.setup();
    mockRequestPasswordReset.mockResolvedValueOnce({
      data: null,
      error: { message: "mail detail" },
    });

    await renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText("mail detail")).toBeInTheDocument();
    });
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "password_reset_request_failed",
      {
        failure_type: "api_error",
        source: "forgot_password",
      },
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("owner@example.com");
    expect(calls).not.toContain("mail detail");
  });

  it("tracks password reset completion without token or password", async () => {
    const user = userEvent.setup();

    await renderResetPasswordPage();

    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith({
        newPassword: "new-password",
        token: "reset-token-123",
      });
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "password_reset_completed",
      {
        source: "reset_password",
      },
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("new-password");
    expect(calls).not.toContain("reset-token-123");
  });

  it("tracks password reset failures without token, password, or raw errors", async () => {
    const user = userEvent.setup();
    mockResetPassword.mockRejectedValueOnce(new Error("reset detail"));

    await renderResetPasswordPage();

    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => {
      expect(
        screen.getByText("We could not reset your password. Please try again."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("reset detail")).not.toBeInTheDocument();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "password_reset_failed",
      {
        failure_type: "api_error",
        source: "reset_password",
      },
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("new-password");
    expect(calls).not.toContain("reset-token-123");
    expect(calls).not.toContain("reset detail");
  });

  it("tracks resolved password reset errors without navigating", async () => {
    const user = userEvent.setup();
    mockResetPassword.mockResolvedValueOnce({
      data: null,
      error: { message: "reset detail" },
    });

    await renderResetPasswordPage();

    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => {
      expect(screen.getByText("reset detail")).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "password_reset_failed",
      {
        failure_type: "api_error",
        source: "reset_password",
      },
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("new-password");
    expect(calls).not.toContain("reset-token-123");
    expect(calls).not.toContain("reset detail");
  });
});
