import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListAccounts = vi.fn();
const mockListStatements = vi.fn();

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
  useCommunity: () => ({ selectedCommunityId: "comm-1" }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    bank: {
      listStatements: (communityId: string) => mockListStatements(communityId),
    },
    finance: {
      accounts: {
        list: (communityId: string) => mockListAccounts(communityId),
      },
    },
  },
}));

vi.mock("@boardstack/shared", () => ({
  getPageHelpForRoute: () => undefined,
}));

vi.mock("@/components/help/HelpCallout", () => ({
  HelpCallout: () => null,
}));

vi.mock("@/components/bank/StatementUpload", () => ({
  StatementUpload: ({
    onPendingChange,
  }: {
    onPendingChange?: (pending: boolean) => void;
  }) => (
    <form id="statement-upload-form">
      <button type="button" onClick={() => onPendingChange?.(true)}>
        Start import
      </button>
    </form>
  ),
}));

function renderBankStatementsPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return import("@/routes/_app.bank.statements").then((mod) => {
    const BankStatementsPage = mod.Route as unknown as React.ComponentType;
    return render(
      <QueryClientProvider client={client}>
        <BankStatementsPage />
      </QueryClientProvider>,
    );
  });
}

describe("BankStatementsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAccounts.mockResolvedValue({
      accounts: [
        {
          id: "account-1",
          code: "1000",
          name: "Operating cash",
          fundType: "operating",
        },
      ],
    });
    mockListStatements.mockResolvedValue({ statements: [] });
  });

  it("disables all external import actions while an upload is pending", async () => {
    await renderBankStatementsPage();

    await screen.findByText("No statements yet");
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Import statement" }),
      ).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "Start import" }));

    const pendingButtons = screen.getAllByRole("button", {
      name: "Importing…",
    });
    expect(pendingButtons).toHaveLength(2);
    pendingButtons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });
});
