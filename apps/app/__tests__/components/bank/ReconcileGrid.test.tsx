import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ReconcileGrid,
  formatStatementAmount,
} from "@/components/bank/ReconcileGrid";
import type { ReconciliationRow, StatementLineRow } from "@/lib/api";

const trackDashboardEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: trackDashboardEventMock,
}));

vi.mock("@/lib/api", () => ({
  api: {
    bank: {
      finalizeReconciliation: vi.fn(),
      addMatch: vi.fn(),
      deleteMatch: vi.fn(),
    },
  },
}));

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

import { api } from "@/lib/api";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function confirmFinalize() {
  fireEvent.click(screen.getByText("Finalize Reconciliation"));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Finalize reconciliation",
    }),
  );
}

describe("formatStatementAmount", () => {
  it("formats positive amount with + prefix", () => {
    expect(formatStatementAmount(1234)).toBe("+$12.34");
  });

  it("formats negative amount with - prefix", () => {
    expect(formatStatementAmount(-1234)).toBe("-$12.34");
  });

  it("formats zero as positive", () => {
    expect(formatStatementAmount(0)).toBe("+$0.00");
  });

  it("formats large positive amount", () => {
    expect(formatStatementAmount(100000)).toBe("+$1,000.00");
  });

  it("formats large negative amount", () => {
    expect(formatStatementAmount(-100000)).toBe("-$1,000.00");
  });
});

describe("ReconcileGrid", () => {
  const mockFinalize = api.bank.finalizeReconciliation as ReturnType<
    typeof vi.fn
  >;
  const mockAddMatch = api.bank.addMatch as ReturnType<typeof vi.fn>;
  const mockDeleteMatch = api.bank.deleteMatch as ReturnType<typeof vi.fn>;

  const reconciliation: ReconciliationRow = {
    id: "rec-1",
    status: "open",
    statementId: "stmt-1",
  };

  const lines: StatementLineRow[] = [
    {
      id: "line-1",
      postedDate: "2026-01-10",
      description: "HOA dues",
      amountCents: 15000,
    },
    {
      id: "line-2",
      postedDate: "2026-01-15",
      description: "Landscaping",
      amountCents: -5000,
    },
  ];

  beforeEach(() => {
    mockFinalize.mockReset();
    mockAddMatch.mockReset();
    mockDeleteMatch.mockReset();
    trackDashboardEventMock.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    mockAddMatch.mockResolvedValue({ matchId: "m-1" });
    mockDeleteMatch.mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows loading state", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={[]}
        isLoading={true}
      />,
    );
    // Loading state now renders Skeleton elements instead of text
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders statement lines", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        isLoading={false}
      />,
    );
    expect(screen.getByText("HOA dues")).toBeTruthy();
    expect(screen.getByText("Landscaping")).toBeTruthy();
    expect(screen.getByText("+$150.00")).toBeTruthy();
    expect(screen.getByText("-$50.00")).toBeTruthy();
  });

  it("renders reconciliation status badge", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        isLoading={false}
      />,
    );
    expect(screen.getByText("open")).toBeTruthy();
  });

  it("promotes matched, unmatched, balance, and readiness metrics above lines", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
      />,
    );

    expect(screen.getAllByText("Matched").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+$150.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Unmatched")).toBeTruthy();
    expect(screen.getAllByText("-$50.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Balance Delta")).toBeTruthy();
    expect(screen.getByText("+$100.00")).toBeTruthy();
    expect(screen.getByText("Readiness")).toBeTruthy();
    expect(screen.getByText("1 of 2 ready")).toBeTruthy();
  });

  it("shows ready state when every line is matched", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
          {
            id: "match-2",
            statementLineId: "line-2",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
      />,
    );

    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("All lines matched")).toBeTruthy();
  });

  it("renders finalized status for finalized reconciliation", () => {
    const finalizedRec: ReconciliationRow = {
      ...reconciliation,
      status: "finalized",
    };
    renderWithClient(
      <ReconcileGrid
        reconciliation={finalizedRec}
        lines={lines}
        isLoading={false}
      />,
    );
    expect(screen.getByText("finalized")).toBeTruthy();
  });

  it("renders transaction match controls for unmatched lines", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        isLoading={false}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: "Match" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toBeDisabled();
    expect(screen.getByLabelText("Transaction ID for HOA dues")).toBeTruthy();
    expect(mockAddMatch).not.toHaveBeenCalled();
  });

  it("creates a payment match from a transaction id", async () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        isLoading={false}
        communityId="comm-1"
      />,
    );

    fireEvent.change(screen.getByLabelText("Transaction ID for HOA dues"), {
      target: { value: "pay-1" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Match" })[0]);

    await waitFor(() => {
      expect(mockAddMatch).toHaveBeenCalledWith("rec-1", {
        communityId: "comm-1",
        statementLineId: "line-1",
        paymentId: "pay-1",
        journalLineId: null,
      });
    });
    expect(screen.getByRole("button", { name: "Matched" })).toBeTruthy();
    expect(trackDashboardEventMock).not.toHaveBeenCalled();
  });

  it("creates a journal match from a transaction id", async () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        isLoading={false}
        communityId="comm-1"
      />,
    );

    fireEvent.change(screen.getByLabelText("Match type for HOA dues"), {
      target: { value: "journal" },
    });
    fireEvent.change(screen.getByLabelText("Transaction ID for HOA dues"), {
      target: { value: "jl-1" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Match" })[0]);

    await waitFor(() => {
      expect(mockAddMatch).toHaveBeenCalledWith("rec-1", {
        communityId: "comm-1",
        statementLineId: "line-1",
        paymentId: null,
        journalLineId: "jl-1",
      });
    });
  });

  it("shows persist error when addMatch fails", async () => {
    mockAddMatch.mockRejectedValueOnce(new Error("Match persist failed"));
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        isLoading={false}
        communityId="comm-1"
      />,
    );
    fireEvent.change(screen.getByLabelText("Transaction ID for HOA dues"), {
      target: { value: "pay-1" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Match" })[0]);
    await waitFor(() => {
      expect(
        screen.getByText("We could not save this match. Please try again."),
      ).toBeTruthy();
    });
    // The raw server error must never reach the treasurer.
    expect(screen.queryByText("Match persist failed")).toBeNull();
  });

  it("calls finalizeReconciliation with reconciliation id and communityId prop", async () => {
    mockFinalize.mockResolvedValueOnce({ ok: true });
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
          {
            id: "match-2",
            statementLineId: "line-2",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );
    confirmFinalize();
    await waitFor(() => {
      expect(mockFinalize).toHaveBeenCalledWith("rec-1", "comm-1");
    });
  });

  it("does not duplicate server reconciliation finalization analytics", async () => {
    mockFinalize.mockResolvedValueOnce({ ok: true });
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
          {
            id: "match-2",
            statementLineId: "line-2",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );

    confirmFinalize();

    await waitFor(() => {
      expect(mockFinalize).toHaveBeenCalledWith("rec-1", "comm-1");
    });

    const calls = JSON.stringify(trackDashboardEventMock.mock.calls);
    expect(trackDashboardEventMock).not.toHaveBeenCalled();
    expect(calls).not.toContain("HOA dues");
    expect(calls).not.toContain("Landscaping");
  });

  it("does not finalize when confirmation is cancelled", async () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
          {
            id: "match-2",
            statementLineId: "line-2",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
      />,
    );
    fireEvent.click(screen.getByText("Finalize Reconciliation"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(mockFinalize).not.toHaveBeenCalled();
    });
  });

  it("shows error when finalize fails", async () => {
    mockFinalize.mockRejectedValueOnce(new Error("Finalize failed"));
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
          {
            id: "match-2",
            statementLineId: "line-2",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
      />,
    );
    confirmFinalize();
    await waitFor(() => {
      expect(
        screen.getByText(
          "We could not finalize this reconciliation. Please try again.",
        ),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Finalize failed")).toBeNull();
    expect(trackDashboardEventMock).not.toHaveBeenCalled();
  });

  it("shows the same friendly error when a non-Error is thrown during finalize", async () => {
    mockFinalize.mockRejectedValueOnce("string error");
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
          {
            id: "match-2",
            statementLineId: "line-2",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
      />,
    );
    confirmFinalize();
    await waitFor(() => {
      expect(
        screen.getByText(
          "We could not finalize this reconciliation. Please try again.",
        ),
      ).toBeTruthy();
    });
  });

  it("disables finalize while lines remain unmatched", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Finalize Reconciliation" }),
    ).toBeDisabled();
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("leaves final balance validation to the API after every line is matched", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
          {
            id: "match-2",
            statementLineId: "line-2",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Finalize Reconciliation" }),
    ).not.toBeDisabled();
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("can un-match a server-matched line by clicking Matched button", async () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Matched" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Matched" })).toBeNull();
    });
  });

  it("initializes matched rows from server matches", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );

    expect(screen.getByRole("button", { name: "Matched" })).toBeTruthy();
    expect(screen.getAllByText("+$150.00").length).toBeGreaterThan(0);
  });

  it("persists unmatch with the server match id", async () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Matched" }));

    await waitFor(() => {
      expect(mockDeleteMatch).toHaveBeenCalledWith(
        "rec-1",
        "match-1",
        "comm-1",
      );
    });
    expect(trackDashboardEventMock).not.toHaveBeenCalled();
  });

  it("does not unmatch when a server match has no id", async () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Matched" }));

    expect(mockDeleteMatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Matched" })).toBeTruthy();
  });

  it("does not unmatch without a persisted reconciliation id", async () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={{ id: "", status: "open", statementId: "stmt-1" }}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Matched" }));

    expect(mockDeleteMatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Matched" })).toBeTruthy();
  });

  it("shows persist error when unmatch fails", async () => {
    mockDeleteMatch.mockRejectedValueOnce(new Error("Unmatch failed"));
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Matched" }));

    await waitFor(() => {
      expect(
        screen.getByText("We could not remove this match. Please try again."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Unmatch failed")).toBeNull();
    expect(screen.getByRole("button", { name: "Matched" })).toBeTruthy();
  });

  it("shows the same friendly error when unmatch throws a non-Error", async () => {
    mockDeleteMatch.mockRejectedValueOnce("network failure");
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Matched" }));

    await waitFor(() => {
      expect(
        screen.getByText("We could not remove this match. Please try again."),
      ).toBeTruthy();
    });
  });

  it("does not show Finalize button for finalized reconciliation", () => {
    const finalizedRec: ReconciliationRow = {
      ...reconciliation,
      status: "finalized",
    };
    renderWithClient(
      <ReconcileGrid
        reconciliation={finalizedRec}
        lines={lines}
        isLoading={false}
      />,
    );
    expect(screen.queryByText("Finalize Reconciliation")).toBeNull();
  });

  it("shows memory warning banner when reconciliation has no id", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={{ id: "", status: "open", statementId: "" }}
        lines={[]}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/not saved yet/)).toBeTruthy();
  });

  it("does not show memory warning banner when reconciliation has an id", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={[]}
        isLoading={false}
      />,
    );
    expect(screen.queryByText(/not saved yet/)).toBeNull();
  });

  it("has a remove-match hover hint on the Matched toggle", () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );
    // The visible label reads "Matched" (current state); the hover title tells
    // the user that clicking will remove the match.
    expect(screen.getByRole("button", { name: "Matched" })).toHaveAttribute(
      "title",
      "Remove this match",
    );
  });

  it("refreshes the reconciliation query after a successful finalize", async () => {
    mockFinalize.mockResolvedValueOnce({ ok: true });
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
          {
            id: "match-2",
            statementLineId: "line-2",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );
    confirmFinalize();
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["reconciliation", "rec-1", "comm-1"],
      });
    });
    invalidateSpy.mockRestore();
  });

  it("shows toast.success after successful finalize", async () => {
    mockFinalize.mockResolvedValueOnce({ ok: true });
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
          {
            id: "match-2",
            statementLineId: "line-2",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );
    confirmFinalize();
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        "Reconciliation finalized.",
      );
    });
  });

  it("shows toast.error after failed finalize", async () => {
    mockFinalize.mockRejectedValueOnce(new Error("Server error"));
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
          {
            id: "match-2",
            statementLineId: "line-2",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );
    confirmFinalize();
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "We could not finalize this reconciliation. Please try again.",
      );
    });
    expect(mockToast.error).not.toHaveBeenCalledWith("Server error");
  });

  it("shows toast.success after successful match", async () => {
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        isLoading={false}
        communityId="comm-1"
      />,
    );
    fireEvent.change(screen.getByLabelText("Transaction ID for HOA dues"), {
      target: { value: "pay-1" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Match" })[0]);
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Line matched.");
    });
  });

  it("shows toast.error after failed match", async () => {
    mockAddMatch.mockRejectedValueOnce(new Error("Match failed"));
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        isLoading={false}
        communityId="comm-1"
      />,
    );
    fireEvent.change(screen.getByLabelText("Transaction ID for HOA dues"), {
      target: { value: "pay-1" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Match" })[0]);
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "We could not save this match. Please try again.",
      );
    });
    expect(mockToast.error).not.toHaveBeenCalledWith("Match failed");
  });

  it("shows toast.error after failed unmatch", async () => {
    mockDeleteMatch.mockRejectedValueOnce(new Error("Unmatch error"));
    renderWithClient(
      <ReconcileGrid
        reconciliation={reconciliation}
        lines={lines}
        matches={[
          {
            id: "match-1",
            statementLineId: "line-1",
            reconciliationId: "rec-1",
          },
        ]}
        isLoading={false}
        communityId="comm-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Matched" }));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "We could not remove this match. Please try again.",
      );
    });
    expect(mockToast.error).not.toHaveBeenCalledWith("Unmatch error");
  });
});
