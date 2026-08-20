import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import {
  CloseChecklist,
  allStepsCompleted,
} from "@/components/close/CloseChecklist";
import type { CloseChecklistItem } from "@/lib/api";

vi.mock("@/lib/sentry", () => ({
  reportUserFacingError: (_err: unknown, fallback: string) => fallback,
}));

vi.mock("@/lib/api", () => ({
  api: {
    close: {
      advanceStep: vi.fn(),
      complete: vi.fn(),
      auditPackUrl: vi.fn(
        (closeId: string, communityId: string) =>
          `https://api.test/close/${closeId}/pack-url?communityId=${communityId}`,
      ),
    },
  },
}));

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

import { api } from "@/lib/api";
import posthog from "posthog-js";

function confirmCompleteClose() {
  fireEvent.click(screen.getByText("Complete Close"));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Complete close",
    }),
  );
}

describe("allStepsCompleted", () => {
  const makeItem = (completed: boolean, id = "1"): CloseChecklistItem => ({
    id,
    step: `step_${id}`,
    completed,
    completedAt: completed ? "2026-01-01T00:00:00Z" : null,
  });

  it("returns false for empty array", () => {
    expect(allStepsCompleted([])).toBe(false);
  });

  it("returns true when all items are completed", () => {
    expect(allStepsCompleted([makeItem(true, "1"), makeItem(true, "2")])).toBe(
      true,
    );
  });

  it("returns false when some items are not completed", () => {
    expect(allStepsCompleted([makeItem(true, "1"), makeItem(false, "2")])).toBe(
      false,
    );
  });

  it("returns false when no items are completed", () => {
    expect(
      allStepsCompleted([makeItem(false, "1"), makeItem(false, "2")]),
    ).toBe(false);
  });
});

describe("CloseChecklist", () => {
  const mockAdvanceStep = api.close.advanceStep as ReturnType<typeof vi.fn>;
  const mockComplete = api.close.complete as ReturnType<typeof vi.fn>;
  const mockPosthogCapture = posthog.capture as ReturnType<typeof vi.fn>;

  // These step keys map via CLOSE_STEP_LABELS in finance-labels.ts
  const items: CloseChecklistItem[] = [
    { id: "i1", step: "bank_rec", completed: false, completedAt: null },
    { id: "i2", step: "review_journal", completed: false, completedAt: null },
    { id: "i3", step: "sign_off", completed: false, completedAt: null },
    { id: "i4", step: "fund_transfer", completed: false, completedAt: null },
    { id: "i5", step: "archive_docs", completed: false, completedAt: null },
  ];

  beforeEach(() => {
    mockAdvanceStep.mockReset();
    mockComplete.mockReset();
    mockPosthogCapture.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders all checklist steps with human-readable labels", () => {
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={items}
        onComplete={vi.fn()}
      />,
    );
    // Labels are rendered via getCloseStepLabel(), not raw step keys
    expect(screen.getByLabelText("Reconcile bank statements")).toBeTruthy();
    expect(screen.getByLabelText("Review journal entries")).toBeTruthy();
    expect(screen.getByLabelText("Approve period close")).toBeTruthy();
    expect(screen.getByLabelText("Transfer funds")).toBeTruthy();
    expect(screen.getByLabelText("Archive documents")).toBeTruthy();
  });

  it("renders Complete Close button as disabled when not all checked", () => {
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={items}
        onComplete={vi.fn()}
      />,
    );
    const button = screen.getByText("Complete Close") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("calls advanceStep when a checkbox is checked", async () => {
    mockAdvanceStep.mockResolvedValueOnce({ ok: true });
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={items}
        onComplete={vi.fn()}
      />,
    );
    const checkbox = screen.getByLabelText(
      "Reconcile bank statements",
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(mockAdvanceStep).toHaveBeenCalledWith(
        "close-1",
        "comm-1",
        "bank_rec",
        true,
      );
    });
  });

  it("enables Complete Close button when all items are checked", async () => {
    const allCompletedItems: CloseChecklistItem[] = items.map((item) => ({
      ...item,
      completed: true,
      completedAt: "2026-01-01T00:00:00Z",
    }));
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={allCompletedItems}
        onComplete={vi.fn()}
      />,
    );
    const button = screen.getByText("Complete Close") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("calls close.complete and shows pack URL on completion", async () => {
    const allCompletedItems: CloseChecklistItem[] = items.map((item) => ({
      ...item,
      completed: true,
      completedAt: "2026-01-01T00:00:00Z",
    }));
    mockComplete.mockResolvedValueOnce({
      closeId: "close-1",
      status: "complete",
      auditPackKey: "comm-1/2026-01/audit-pack.zip",
    });
    const onComplete = vi.fn();
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={allCompletedItems}
        onComplete={onComplete}
      />,
    );
    confirmCompleteClose();
    await waitFor(() => {
      expect(mockComplete).toHaveBeenCalledWith("close-1", "comm-1");
      expect(onComplete).toHaveBeenCalled();
      expect(screen.getByText("Download audit pack")).toBeTruthy();
    });
  });

  it("does not show pack link when completion returns no audit pack key", async () => {
    const allCompletedItems: CloseChecklistItem[] = items.map((item) => ({
      ...item,
      completed: true,
      completedAt: "2026-01-01T00:00:00Z",
    }));
    mockComplete.mockResolvedValueOnce({
      closeId: "close-1",
      status: "complete",
      auditPackKey: null,
    });
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={allCompletedItems}
        onComplete={vi.fn()}
      />,
    );
    confirmCompleteClose();
    await waitFor(() => {
      expect(mockComplete).toHaveBeenCalledWith("close-1", "comm-1");
    });
    expect(screen.queryByText("Download audit pack")).toBeNull();
  });

  it("captures close_completed PostHog event on successful completion", async () => {
    const allCompletedItems: CloseChecklistItem[] = items.map((item) => ({
      ...item,
      completed: true,
      completedAt: "2026-01-01T00:00:00Z",
    }));
    mockComplete.mockResolvedValueOnce({
      closeId: "close-1",
      status: "complete",
      auditPackKey: "comm-1/2026-03/audit-pack.zip",
    });
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={3}
        items={allCompletedItems}
        onComplete={vi.fn()}
      />,
    );
    confirmCompleteClose();
    await waitFor(() => {
      expect(mockPosthogCapture).toHaveBeenCalledWith("close_completed", {
        period_year: 2026,
        period_month: 3,
        community_id: "comm-1",
      });
    });
  });

  it("shows error when advanceStep fails", async () => {
    mockAdvanceStep.mockRejectedValueOnce(new Error("Step failed"));
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={items}
        onComplete={vi.fn()}
      />,
    );
    const checkbox = screen.getByLabelText(
      "Reconcile bank statements",
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(
        screen.getByText("We could not update this step. Please try again."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Step failed")).toBeNull();
  });

  it("shows generic error when advanceStep throws non-Error", async () => {
    mockAdvanceStep.mockRejectedValueOnce("string error");
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={items}
        onComplete={vi.fn()}
      />,
    );
    const checkbox = screen.getByLabelText(
      "Reconcile bank statements",
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(
        screen.getByText("We could not update this step. Please try again."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Failed to update step.")).toBeNull();
  });

  it("keeps completed steps one-way and does not uncheck them", async () => {
    const partialItems: CloseChecklistItem[] = [
      ...items.slice(1),
      {
        id: "i1",
        step: "bank_rec",
        completed: true,
        completedAt: "2026-01-01T00:00:00Z",
      },
    ];
    mockAdvanceStep.mockResolvedValueOnce({ ok: true });
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={partialItems}
        onComplete={vi.fn()}
      />,
    );
    const checkbox = screen.getByLabelText("Reconcile bank statements");
    // Radix Checkbox renders a <button role="checkbox"> with aria-checked
    expect(checkbox).toHaveAttribute("aria-checked", "true");
    expect(checkbox).toHaveProperty("disabled", true);
    fireEvent.click(checkbox);
    expect(mockAdvanceStep).not.toHaveBeenCalled();
  });

  it("shows error when complete fails", async () => {
    const allCompletedItems: CloseChecklistItem[] = items.map((item) => ({
      ...item,
      completed: true,
      completedAt: "2026-01-01T00:00:00Z",
    }));
    mockComplete.mockRejectedValueOnce(new Error("Complete failed"));
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={allCompletedItems}
        onComplete={vi.fn()}
      />,
    );
    confirmCompleteClose();
    await waitFor(() => {
      expect(
        screen.getByText("We could not complete this close. Please try again."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Complete failed")).toBeNull();
  });

  it("does not complete when confirmation is cancelled", async () => {
    const allCompletedItems: CloseChecklistItem[] = items.map((item) => ({
      ...item,
      completed: true,
      completedAt: "2026-01-01T00:00:00Z",
    }));
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={allCompletedItems}
        onComplete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Complete Close"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(mockComplete).not.toHaveBeenCalled();
    });
  });

  it("shows generic error when complete throws non-Error", async () => {
    const allCompletedItems: CloseChecklistItem[] = items.map((item) => ({
      ...item,
      completed: true,
      completedAt: "2026-01-01T00:00:00Z",
    }));
    mockComplete.mockRejectedValueOnce("string error");
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={allCompletedItems}
        onComplete={vi.fn()}
      />,
    );
    confirmCompleteClose();
    await waitFor(() => {
      expect(
        screen.getByText("We could not complete this close. Please try again."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Failed to complete close.")).toBeNull();
  });

  it("renders progress bar showing completed/total steps", () => {
    const partialItems: CloseChecklistItem[] = [
      {
        id: "i1",
        step: "bank_rec",
        completed: true,
        completedAt: "2026-01-01T00:00:00Z",
      },
      { id: "i2", step: "review_journal", completed: false, completedAt: null },
      { id: "i3", step: "sign_off", completed: false, completedAt: null },
    ];
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={partialItems}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText("1 of 3 steps complete")).toBeTruthy();
    expect(screen.getByText("33%")).toBeTruthy();
  });

  it("shows Done badge on completed steps and Pending on incomplete", () => {
    const partialItems: CloseChecklistItem[] = [
      {
        id: "i1",
        step: "bank_rec",
        completed: true,
        completedAt: "2026-01-01T00:00:00Z",
      },
      { id: "i2", step: "review_journal", completed: false, completedAt: null },
    ];
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={partialItems}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
  });

  it("renders 0% progress when items list is empty", () => {
    render(
      <CloseChecklist
        closeId="close-1"
        communityId="comm-1"
        periodYear={2026}
        periodMonth={1}
        items={[]}
        onComplete={vi.fn()}
      />,
    );
    // totalCount is 0, so progressPercent falls to 0 (the else branch on line 41)
    expect(screen.getByText("0 of 0 steps complete")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
  });
});
