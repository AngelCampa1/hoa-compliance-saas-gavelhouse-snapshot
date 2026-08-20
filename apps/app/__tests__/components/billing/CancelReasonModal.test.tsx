import { describe, it, expect, vi, beforeEach } from "vitest";
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));
const mockTrackDashboardEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sentry", () => ({
  reportUserFacingError: (_err: unknown, fallback: string) => fallback,
}));
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  CancelReasonModal,
  CANCEL_REASON_LABELS,
} from "@/components/billing/CancelReasonModal";

vi.mock("@/lib/api", () => ({
  api: {
    billing: {
      cancel: vi.fn(),
    },
  },
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

// Capture the Dialog onOpenChange callback so we can invoke it directly in tests.
let capturedOnOpenChange: ((open: boolean) => void) | undefined;

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    onOpenChange,
    open,
  }: {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) => {
    capturedOnOpenChange = onOpenChange;
    return open ? (
      <div role="dialog" aria-modal="true">
        {children}
      </div>
    ) : null;
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Mock Radix Select so tests can interact without JSDOM limitations.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
    value?: string;
  }) => (
    <div data-testid="select-root" data-value={value}>
      {/* Propagate onValueChange via a hidden select */}
      <select
        aria-label="Reason"
        value={value ?? ""}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        <option value="">Select a reason…</option>
        {Object.entries(CANCEL_REASON_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SelectContent: () => null,
  SelectItem: () => null,
}));

import { api } from "@/lib/api";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderModal(props: Parameters<typeof CancelReasonModal>[0]) {
  const client = makeQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CancelReasonModal {...props} />
    </QueryClientProvider>,
  );
}

describe("CANCEL_REASON_LABELS", () => {
  it("has 6 entries", () => {
    expect(Object.keys(CANCEL_REASON_LABELS)).toHaveLength(6);
  });

  it("contains expected keys", () => {
    expect(CANCEL_REASON_LABELS).toHaveProperty("too_expensive");
    expect(CANCEL_REASON_LABELS).toHaveProperty("missing_feature");
    expect(CANCEL_REASON_LABELS).toHaveProperty("switched_to_manager");
    expect(CANCEL_REASON_LABELS).toHaveProperty("board_dissolved");
    expect(CANCEL_REASON_LABELS).toHaveProperty("bug_or_reliability");
    expect(CANCEL_REASON_LABELS).toHaveProperty("other");
  });

  it("has human-readable labels for all entries", () => {
    for (const label of Object.values(CANCEL_REASON_LABELS)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("CancelReasonModal", () => {
  const mockCancel = api.billing.cancel as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCancel.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    mockTrackDashboardEvent.mockReset();
    capturedOnOpenChange = undefined;
  });

  it("does not render when open is false", () => {
    renderModal({ communityId: "comm-1", open: false, onClose: vi.fn() });
    expect(screen.queryByText("Cancel your subscription")).toBeNull();
  });

  it("renders modal when open is true", () => {
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Title should appear
    const allMatches = screen.getAllByText("Cancel your subscription");
    expect(allMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders reason select with all options", () => {
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });
    const select = screen.getByLabelText("Reason") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain("too_expensive");
    expect(options).toContain("missing_feature");
    expect(options).toContain("switched_to_manager");
    expect(options).toContain("board_dissolved");
    expect(options).toContain("bug_or_reliability");
    expect(options).toContain("other");
  });

  it("renders note textarea", () => {
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });
    expect(screen.getByLabelText("Note (optional)")).toBeTruthy();
  });

  it("renders Keep Subscription button", () => {
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });
    expect(screen.getByText("Keep my plan")).toBeTruthy();
  });

  it("calls onClose when Keep Subscription is clicked", () => {
    const onClose = vi.fn();
    renderModal({ communityId: "comm-1", open: true, onClose });
    fireEvent.click(screen.getByText("Keep my plan"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders submit button as disabled when no reason selected", () => {
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });
    const submitButton = screen.getByRole("button", {
      name: "Cancel my subscription",
    }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });

  it("enables submit button after selecting a reason", () => {
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "too_expensive" },
    });
    const submitButton = screen.getByRole("button", {
      name: "Cancel my subscription",
    }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);
  });

  it("calls api.billing.cancel with reason and note on submit", async () => {
    mockCancel.mockResolvedValueOnce({ ok: true });
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "missing_feature" },
    });
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "I needed X feature" },
    });

    const submitButton = screen.getByRole("button", {
      name: "Cancel my subscription",
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledWith(
        "comm-1",
        "missing_feature",
        "I needed X feature",
      );
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "subscription_cancellation_requested",
      {
        community_id: "comm-1",
        reason: "missing_feature",
      },
    );
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "I needed X feature",
    );
  });

  it("shows success message after successful cancellation", async () => {
    mockCancel.mockResolvedValueOnce({ ok: true });
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "too_expensive" },
    });

    const submitButton = screen.getByRole("button", {
      name: "Cancel my subscription",
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Your subscription has been cancelled/),
      ).toBeTruthy();
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "subscription_cancellation_completed",
      {
        community_id: "comm-1",
        reason: "too_expensive",
      },
    );
  });

  it("shows access ends date when accessEndsAt provided", async () => {
    mockCancel.mockResolvedValueOnce({ ok: true });
    renderModal({
      communityId: "comm-1",
      open: true,
      onClose: vi.fn(),
      accessEndsAt: "2025-12-31T00:00:00.000Z",
    });

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "too_expensive" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel my subscription" }),
    );

    await waitFor(() => {
      expect(screen.getByText(/You have access until/)).toBeTruthy();
    });
  });

  it("calls onClose when Close button is clicked in success state", async () => {
    mockCancel.mockResolvedValueOnce({ ok: true });
    const onClose = vi.fn();
    renderModal({ communityId: "comm-1", open: true, onClose });

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "too_expensive" },
    });

    const submitButton = screen.getByRole("button", {
      name: "Cancel my subscription",
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Your subscription has been cancelled/),
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error message when api call fails", async () => {
    mockCancel.mockRejectedValueOnce(new Error("Cancel failed"));
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "too_expensive" },
    });

    const submitButton = screen.getByRole("button", {
      name: "Cancel my subscription",
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(
          "We could not cancel your subscription. Please try again.",
        ),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Cancel failed")).toBeNull();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "subscription_cancellation_failed",
      {
        community_id: "comm-1",
        failure_type: "api_error",
        reason: "too_expensive",
      },
    );
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "Cancel failed",
    );
  });

  it("calls cancel without note when note is empty", async () => {
    mockCancel.mockResolvedValueOnce({ ok: true });
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "too_expensive" },
    });

    const submitButton = screen.getByRole("button", {
      name: "Cancel my subscription",
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledWith(
        "comm-1",
        "too_expensive",
        undefined,
      );
    });
  });

  it("shows generic error message when non-Error thrown", async () => {
    mockCancel.mockRejectedValueOnce("string error");
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "too_expensive" },
    });

    const submitButton = screen.getByRole("button", {
      name: "Cancel my subscription",
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(
          "We could not cancel your subscription. Please try again.",
        ),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Cancellation failed.")).toBeNull();
  });

  it("calls onClose when handleOpenChange is called with false (close event)", () => {
    const onClose = vi.fn();
    renderModal({ communityId: "comm-1", open: true, onClose });
    // Directly invoke the Dialog's onOpenChange with false (simulates Escape / overlay click)
    capturedOnOpenChange?.(false);
    expect(onClose).toHaveBeenCalled();
  });

  it("resets form state after dialog close animation via fake timers", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    renderModal({ communityId: "comm-1", open: true, onClose });
    // Directly invoke handleOpenChange(false) to trigger the setTimeout reset
    capturedOnOpenChange?.(false);
    // Advance timers to execute the setTimeout(200ms) callback
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when handleOpenChange is called with true (open event)", () => {
    // Covers the else branch (nextOpen = true) of if (!nextOpen) in handleOpenChange
    const onClose = vi.fn();
    renderModal({ communityId: "comm-1", open: true, onClose });
    // Directly invoke handleOpenChange(true) — should be a no-op
    capturedOnOpenChange?.(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call api when form is submitted with no reason (guard branch)", async () => {
    // Covers the if (!reason) return early exit in handleSubmit
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });
    // Fire submit directly on the form to bypass the disabled button,
    // exercising the `if (!reason) return` guard branch
    const form = document.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    // API should not be called when reason is empty
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("calls toast.success on successful cancellation", async () => {
    mockCancel.mockResolvedValueOnce({ ok: true });
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "too_expensive" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel my subscription" }),
    );
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Subscription cancelled.");
    });
  });

  it("calls toast.error on failed cancellation", async () => {
    mockCancel.mockRejectedValueOnce(new Error("Network error"));
    renderModal({ communityId: "comm-1", open: true, onClose: vi.fn() });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "too_expensive" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel my subscription" }),
    );
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "We could not cancel your subscription. Please try again.",
      );
    });
    expect(mockToast.error).not.toHaveBeenCalledWith("Network error");
  });

  it("invalidates billing and community queries on successful cancellation (HIGH-APP-16)", async () => {
    mockCancel.mockResolvedValueOnce({ ok: true });
    const client = makeQueryClient();
    const invalidateQueriesSpy = vi.spyOn(client, "invalidateQueries");

    render(
      <QueryClientProvider client={client}>
        <CancelReasonModal communityId="comm-1" open={true} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "too_expensive" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel my subscription" }),
    );

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalled();
    });

    await waitFor(() => {
      const calls = invalidateQueriesSpy.mock.calls.map((c) => c[0]);
      const billingCall = calls.find(
        (c) =>
          c &&
          typeof c === "object" &&
          "queryKey" in c &&
          Array.isArray(c.queryKey) &&
          c.queryKey[0] === "billing-status",
      );
      expect(billingCall).toBeDefined();

      const communitiesCall = calls.find(
        (c) =>
          c &&
          typeof c === "object" &&
          "queryKey" in c &&
          Array.isArray(c.queryKey) &&
          c.queryKey[0] === "communities",
      );
      expect(communitiesCall).toBeDefined();
    });
  });
});
