import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let selectedCommunityId = "community-1";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/lib/community-context", () => ({
  // Portfolio tier so the TierUpgradeGate around the portfolio page lets the
  // create form render — this suite checks the input's accessible label for an
  // entitled user.
  useCommunity: () => ({
    selectedCommunityId,
    selectedCommunityTier: "portfolio",
    selectedCommunityRole: "owner",
  }),
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "u-1", email: "owner@example.com" } },
    }),
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    finance: {
      accounts: {
        list: vi.fn().mockResolvedValue({
          accounts: [
            {
              id: "account-1",
              code: "1000",
              name: "Operating cash",
              fundType: "operating",
            },
          ],
        }),
      },
      journal: {
        list: vi.fn().mockResolvedValue({ entries: [] }),
        create: vi.fn(),
      },
    },
    governance: {
      homeowners: {
        list: vi.fn().mockResolvedValue({ homeowners: [] }),
        import: vi.fn(),
      },
      portal: {
        createSession: vi.fn(),
      },
    },
    portfolio: {
      list: vi.fn().mockResolvedValue({ portfolios: [] }),
      create: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      getRollup: vi.fn(),
    },
  },
}));

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("route field labels", () => {
  beforeEach(() => {
    selectedCommunityId = "community-1";
  });

  it("labels every journal composer field, including repeated line amounts", async () => {
    const mod = await import("@/routes/_app.finance.journal");
    const JournalPage = mod.Route as unknown as React.ComponentType;
    renderWithQueryClient(<JournalPage />);

    expect(screen.getByLabelText("Journal date")).toBeInTheDocument();
    expect(screen.getByLabelText("Journal memo")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Line 1 account")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Line 1 debit amount")).toBeInTheDocument();
    expect(screen.getByLabelText("Line 1 credit amount")).toBeInTheDocument();
    expect(screen.getByLabelText("Line 2 account")).toBeInTheDocument();
    expect(screen.getByLabelText("Line 2 debit amount")).toBeInTheDocument();
    expect(screen.getByLabelText("Line 2 credit amount")).toBeInTheDocument();
  });

  it("uses an icon button to remove extra journal lines", async () => {
    const mod = await import("@/routes/_app.finance.journal");
    const JournalPage = mod.Route as unknown as React.ComponentType;
    renderWithQueryClient(<JournalPage />);

    await waitFor(() => {
      expect(screen.getByText("Add line")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Add line"));

    const removeButtons = screen.getAllByRole("button", {
      name: /Remove line \d+/,
    });
    expect(removeButtons[0]).toHaveAttribute("type", "button");
    expect(removeButtons[0]).toHaveClass("h-9");
  });

  it("labels homeowner search", async () => {
    const mod = await import("@/routes/_app.governance.homeowners");
    const HomeownersPage = mod.Route as unknown as React.ComponentType;
    renderWithQueryClient(<HomeownersPage />);

    expect(screen.getByLabelText("Search homeowners")).toBeInTheDocument();
  });

  it("labels portfolio create input", async () => {
    const mod = await import("@/routes/_app.portfolio.index");
    const PortfolioPage = mod.Route as unknown as React.ComponentType;
    renderWithQueryClient(<PortfolioPage />);

    expect(screen.getByLabelText("New portfolio name")).toBeInTheDocument();
  });
});
