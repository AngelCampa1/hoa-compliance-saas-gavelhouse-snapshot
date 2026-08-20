import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mockUseSearch = vi.fn(() => ({ token: undefined }));
const mockUseNavigate = vi.fn(() => vi.fn());
const mockResetPassword = vi.fn();
const mockTrackDashboardEvent = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mockUseNavigate(),
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    resetPassword: (data: unknown) => mockResetPassword(data),
  },
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

// We need to intercept Route.useSearch — spy on the module after import
async function renderResetPasswordPage() {
  const mod = await import("@/routes/reset-password");
  // Patch useSearch on the exported Route object so the component reads no token
  (mod.Route as unknown as { useSearch: () => { token?: string } }).useSearch =
    mockUseSearch;
  const Page = mod.Route as unknown as React.ComponentType;
  render(<Page />);
  return mod;
}

describe("ResetPasswordPage — invalid token branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue({ token: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
  });

  it("shows Request a new reset link (href=/forgot-password) when no token", async () => {
    await renderResetPasswordPage();

    expect(
      screen.getByRole("link", { name: "Request a new reset link" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("shows Back to sign in (href=/login) when no token", async () => {
    await renderResetPasswordPage();

    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/login");
  });
});
