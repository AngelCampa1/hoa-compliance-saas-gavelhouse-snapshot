import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockNavigate = vi.fn();
const mockUseSession = vi.fn(() => ({
  data: { user: { id: "u-1", email: "owner@example.com", name: "Owner" } },
}));
const mockList = vi.fn();
const mockGetStatus = vi.fn();
const mockSignOut = vi.fn();
const mockIdentifyDashboardUser = vi.fn();
const mockTrackDashboardRoute = vi.fn();
const mockTrackDashboardEvent = vi.fn();
const mockResetDashboardAnalytics = vi.fn();

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
  Outlet: () => <div data-testid="app-outlet">Loaded route content</div>,
  redirect: vi.fn((value) => value),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/dashboard" }),
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signOut: () => mockSignOut(),
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    communities: {
      list: () => mockList(),
    },
    billing: {
      getStatus: (communityId: string) => mockGetStatus(communityId),
    },
  },
  getApiBase: () => "https://api.gavelhouse.app",
}));

// The AI-CS support widget is mounted in the shell; stub it so this test does
// not resolve the private widget package or pull in its SSE machinery.
vi.mock("@/components/ai-cs-support-widget", () => ({
  AiCsSupportWidget: () => <div data-testid="ai-cs-widget" />,
}));

vi.mock("@/lib/breadcrumb-config", () => ({
  buildBreadcrumbs: () => [{ label: "Dashboard", href: "/dashboard" }],
}));

vi.mock("@/lib/analytics", () => ({
  identifyDashboardUser: (...args: unknown[]) =>
    mockIdentifyDashboardUser(...args),
  trackDashboardRoute: (...args: unknown[]) => mockTrackDashboardRoute(...args),
  trackDashboardEvent: (...args: unknown[]) => mockTrackDashboardEvent(...args),
  resetDashboardAnalytics: (...args: unknown[]) =>
    mockResetDashboardAnalytics(...args),
}));

function renderAppLayout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return import("@/routes/_app").then((mod) => {
    const AppLayout = mod.Route as unknown as React.ComponentType;
    return render(
      <QueryClientProvider client={client}>
        <AppLayout />
      </QueryClientProvider>,
    );
  });
}

describe("AppShell community loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    mockNavigate.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      trialEndsAt: "2026-06-01T00:00:00.000Z",
    });
  });

  it("holds route content and hides No community while communities are loading", async () => {
    mockList.mockImplementation(() => new Promise<never>(() => {}));

    await renderAppLayout();

    expect(screen.getByText("Loading community...")).toBeInTheDocument();
    expect(screen.getByText("Loading your community")).toBeInTheDocument();
    expect(screen.queryByText("No community")).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reports$/i }),
    ).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith({
      to: "/setup",
      replace: true,
    });
  });

  it("shows an error state instead of a permanent skeleton when communities fail to load", async () => {
    mockList.mockRejectedValue(new Error("network down"));

    await renderAppLayout();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "We could not load your communities. Refresh the page to try again.",
    );
    // The infinite loading skeleton and the route outlet must both be gone.
    expect(
      screen.queryByText("Loading your community"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
    // A failed community fetch must not bounce the user to /setup.
    expect(mockNavigate).not.toHaveBeenCalledWith({
      to: "/setup",
      replace: true,
    });
  });

  it("renders route content after communities resolve", async () => {
    mockList.mockResolvedValue({
      communities: [
        {
          community: {
            id: "community-1",
            name: "Sunset HOA",
            slug: "sunset-hoa",
            state: "CA",
            ownerUserId: "u-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          role: "owner",
        },
      ],
    });

    await renderAppLayout();

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });
    expect(screen.queryByText("Loading community...")).not.toBeInTheDocument();
    expect(screen.getByText("Sunset HOA")).toBeInTheDocument();
  });

  it("keeps the skeleton (not route content) while redirecting an empty account to setup", async () => {
    mockList.mockResolvedValue({ communities: [] });

    await renderAppLayout();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/setup",
        replace: true,
      });
    });
    // The dashboard outlet must not flash while the redirect to /setup is in
    // flight — the loading skeleton stays up instead.
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
    expect(screen.getByText("Loading your community")).toBeInTheDocument();
  });

  it("tracks the dashboard route and authenticated user context", async () => {
    mockList.mockResolvedValue({
      communities: [
        {
          community: {
            id: "community-1",
            name: "Sunset HOA",
            slug: "sunset-hoa",
            state: "CA",
            ownerUserId: "u-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          role: "owner",
        },
      ],
    });
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "scale",
      trialEndsAt: "2026-06-01T00:00:00.000Z",
    });

    await renderAppLayout();

    await waitFor(() => {
      expect(mockTrackDashboardRoute).toHaveBeenCalledWith(
        "/dashboard",
        undefined,
      );
    });
    await waitFor(() => {
      expect(mockIdentifyDashboardUser).toHaveBeenCalledWith({
        user_id: "u-1",
        community_id: "community-1",
        role: "owner",
        tier: "scale",
      });
    });
  });

  it("masks the header email and resets dashboard analytics on sign out", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue({
      communities: [
        {
          community: {
            id: "community-1",
            name: "Sunset HOA",
            slug: "sunset-hoa",
            state: "CA",
            ownerUserId: "u-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          role: "owner",
        },
      ],
    });

    await renderAppLayout();
    await user.click(screen.getByRole("button", { name: /user menu/i }));

    const email = await screen.findByText("owner@example.com");
    expect(email).toHaveAttribute("data-ph-mask", "true");

    await user.click(await screen.findByText(/sign out/i));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce();
    });
    expect(mockResetDashboardAnalytics).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
  });

  it("hides the Reports sidebar section for roles without report access", async () => {
    mockList.mockResolvedValue({
      communities: [
        {
          community: {
            id: "community-1",
            name: "Sunset HOA",
            slug: "sunset-hoa",
            state: "CA",
            ownerUserId: "u-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          role: "secretary",
        },
      ],
    });
    mockGetStatus.mockResolvedValue({
      status: "trialing",
      tier: "scale",
      trialEndsAt: "2026-06-01T00:00:00.000Z",
    });

    await renderAppLayout();

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /^reports$/i }),
      ).not.toBeInTheDocument();
    });
  });
});
