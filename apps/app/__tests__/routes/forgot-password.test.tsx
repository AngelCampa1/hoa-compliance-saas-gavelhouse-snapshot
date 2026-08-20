import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

const mockRequestPasswordReset = vi.fn();
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
    requestPasswordReset: (data: unknown) => mockRequestPasswordReset(data),
  },
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

async function renderForgotPasswordPage() {
  const mod = await import("@/routes/forgot-password");
  const Page = mod.Route as unknown as React.ComponentType;
  render(<Page />);
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("form state has a Back to sign in link pointing to /login", async () => {
    await renderForgotPasswordPage();

    const links = screen.getAllByRole("link", { name: "Back to sign in" });
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", "/login");
    });
  });

  it("success state has a Back to sign in link pointing to /login", async () => {
    mockRequestPasswordReset.mockResolvedValueOnce({ error: null });

    await renderForgotPasswordPage();

    const emailInput = screen.getByLabelText("Email");
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    await user.type(emailInput, "test@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });

    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/login");
  });
});
