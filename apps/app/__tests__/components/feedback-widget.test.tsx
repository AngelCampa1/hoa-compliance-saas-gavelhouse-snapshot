import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: {
    feedback: {
      submit: vi.fn().mockResolvedValue({ ok: true }),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { FeedbackWidget } from "@/components/feedback-widget";
import { api } from "@/lib/api";
import { toast } from "sonner";

const mockSubmit = api.feedback.submit as ReturnType<typeof vi.fn>;
const mockToastSuccess = toast.success as ReturnType<typeof vi.fn>;
const mockToastError = toast.error as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmit.mockResolvedValue({ ok: true });
  Object.defineProperty(window, "location", {
    value: { href: "https://my.gavelhouse.app/dashboard" },
    writable: true,
    configurable: true,
  });
});

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Open feedback form" }));
}

function selectCategory(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

function fillMessage(text: string) {
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: text },
  });
}

async function submitForm() {
  await act(async () => {
    fireEvent.submit(
      screen.getByRole("button", { name: "Submit Feedback" }).closest("form")!,
    );
  });
}

describe("FeedbackWidget", () => {
  it("renders a floating feedback trigger button", () => {
    render(<FeedbackWidget />);
    expect(
      screen.getByRole("button", { name: "Open feedback form" }),
    ).toBeDefined();
  });

  it("trigger has minimum 44px touch target classes", () => {
    render(<FeedbackWidget />);
    const btn = screen.getByRole("button", { name: "Open feedback form" });
    expect(btn.className).toContain("min-h-11");
    expect(btn.className).toContain("min-w-11");
  });

  it("trigger is positioned fixed at bottom-right", () => {
    render(<FeedbackWidget />);
    const btn = screen.getByRole("button", { name: "Open feedback form" });
    expect(btn.className).toContain("fixed");
    expect(btn.className).toContain("bottom-6");
    expect(btn.className).toContain("right-6");
  });

  it("opens the sheet on trigger click", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => {
      expect(screen.getByText("Send Feedback")).toBeDefined();
    });
  });

  it("shows category options Bug, Idea, Other", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Bug" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Idea" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Other" })).toBeDefined();
    });
  });

  it("marks selected category with aria-pressed=true", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    const bugBtn = screen.getByRole("button", { name: "Bug" });
    expect(bugBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(bugBtn);
    expect(bugBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("submit button is disabled without category", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByLabelText("Message"));
    fillMessage("some text");
    const submitBtn = screen.getByRole("button", {
      name: "Submit Feedback",
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("submit button is disabled without message", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    selectCategory("Bug");
    const submitBtn = screen.getByRole("button", {
      name: "Submit Feedback",
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("submit button is disabled when message is only whitespace", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    selectCategory("Bug");
    fillMessage("");
    const submitBtn = screen.getByRole("button", {
      name: "Submit Feedback",
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("submit button is enabled with category and non-empty message", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    selectCategory("Bug");
    fillMessage("broken thing");
    const submitBtn = screen.getByRole("button", {
      name: "Submit Feedback",
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
  });

  it("shows character count for message", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByText("0/2000"));
    fillMessage("hello");
    expect(screen.getByText("5/2000")).toBeDefined();
  });

  it("enforces 2000 character max on message textarea", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByLabelText("Message"));
    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "x".repeat(2500) },
    });
    expect(textarea.value.length).toBe(2000);
  });

  it("calls api.feedback.submit with correct payload on success", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    selectCategory("Bug");
    fillMessage("something broke");
    await submitForm();
    expect(mockSubmit).toHaveBeenCalledWith({
      category: "bug",
      message: "something broke",
      pageUrl: "https://my.gavelhouse.app/dashboard",
    });
  });

  it("trims whitespace from message before submitting", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Idea" }));
    selectCategory("Idea");
    fillMessage("  cool idea");
    await submitForm();
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ message: "cool idea" }),
    );
  });

  it("shows success toast and closes panel on successful submit", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Idea" }));
    selectCategory("Idea");
    fillMessage("great idea");
    await submitForm();
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Feedback sent. Thank you!",
      );
    });
    // Sheet should be closed after a successful submit.
    await waitFor(() => {
      expect(screen.queryByText("Send Feedback")).toBeNull();
    });
  });

  it("shows error toast when api.feedback.submit rejects", async () => {
    mockSubmit.mockRejectedValueOnce(new Error("network failure"));
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Other" }));
    selectCategory("Other");
    fillMessage("this failed");
    await submitForm();
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Could not send feedback. Please try again.",
      );
    });
  });

  it("re-enables submit after an error", async () => {
    mockSubmit.mockRejectedValueOnce(new Error("fail"));
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    selectCategory("Bug");
    fillMessage("oops");
    await submitForm();
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    const submitBtn = screen.getByRole("button", {
      name: "Submit Feedback",
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
  });

  it("resets form state when sheet is closed and reopened", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    selectCategory("Bug");
    fillMessage("something");
    const bugBtn = screen.getByRole("button", { name: "Bug" });
    expect(bugBtn.getAttribute("aria-pressed")).toBe("true");

    // Close via the sheet's built-in close button (SheetClose)
    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);

    // Reopen
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    expect(
      screen.getByRole("button", { name: "Bug" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByText("0/2000")).toBeDefined();
  });

  it("shows Sending… and disables submit while request is in flight", async () => {
    let resolve: (v: { ok: boolean }) => void;
    mockSubmit.mockReturnValueOnce(
      new Promise<{ ok: boolean }>((r) => {
        resolve = r;
      }),
    );
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    selectCategory("Bug");
    fillMessage("testing");

    await act(async () => {
      fireEvent.submit(
        screen
          .getByRole("button", { name: "Submit Feedback" })
          .closest("form")!,
      );
    });

    expect(screen.getByText("Sending…")).toBeDefined();
    const submitBtn = screen.getByRole("button", {
      name: "Sending…",
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    await act(async () => {
      resolve!({ ok: true });
    });
  });

  it("does not call api when form is submitted without a category", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByLabelText("Message"));
    fillMessage("some message");
    await act(async () => {
      fireEvent.submit(
        screen
          .getByRole("button", { name: "Submit Feedback" })
          .closest("form")!,
      );
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("does not call api when form is submitted without a message", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    selectCategory("Bug");
    await act(async () => {
      fireEvent.submit(
        screen
          .getByRole("button", { name: "Submit Feedback" })
          .closest("form")!,
      );
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("closes the sheet when Escape is pressed", async () => {
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByText("Send Feedback"));
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText("Send Feedback")).toBeNull();
    });
  });

  it("does not call api a second time when a submit is already in flight", async () => {
    let resolve: (v: { ok: boolean }) => void;
    mockSubmit.mockReturnValueOnce(
      new Promise<{ ok: boolean }>((r) => {
        resolve = r;
      }),
    );
    render(<FeedbackWidget />);
    openPanel();
    await waitFor(() => screen.getByRole("button", { name: "Bug" }));
    selectCategory("Bug");
    fillMessage("testing");

    // Submit once — request hangs.
    await act(async () => {
      fireEvent.submit(
        screen
          .getByRole("button", { name: "Submit Feedback" })
          .closest("form")!,
      );
    });

    // Try to submit again while in flight — guard should block it.
    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Sending…" }).closest("form")!,
      );
    });

    // Only one call should have been made.
    expect(mockSubmit).toHaveBeenCalledTimes(1);

    // Resolve so React can clean up.
    await act(async () => {
      resolve!({ ok: true });
    });
  });
});
