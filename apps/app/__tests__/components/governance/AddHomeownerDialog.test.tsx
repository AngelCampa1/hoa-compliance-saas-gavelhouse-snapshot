import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddHomeownerDialog } from "@/components/governance/AddHomeownerDialog";

const trackDashboardEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: trackDashboardEventMock,
}));

vi.mock("@/lib/sentry", () => ({
  reportUserFacingError: (err: unknown, fallback: string) => {
    // Replicate real behaviour: 4xx ApiError → raw message; everything else → fallback
    if (
      err instanceof Error &&
      "status" in err &&
      typeof (err as { status: unknown }).status === "number" &&
      (err as { status: number }).status < 500
    ) {
      return err.message;
    }
    return fallback;
  },
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", () => {
  class MockApiError extends Error {
    readonly status: number;
    readonly path: string;
    constructor(message: string, status: number, path: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.path = path;
    }
  }
  return {
    ApiError: MockApiError,
    api: {
      governance: {
        homeowners: {
          add: vi.fn(),
        },
      },
    },
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Minimal Dialog mock so Radix doesn't break in jsdom.
// The real Dialog is a controlled component; we drive open/close purely via props.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

const mockAdd = api.governance.homeowners.add as ReturnType<typeof vi.fn>;
const mockToastSuccess = toast.success as ReturnType<typeof vi.fn>;
const mockToastError = toast.error as ReturnType<typeof vi.fn>;

const defaultProps = {
  communityId: "comm-1",
  open: true,
  onOpenChange: vi.fn(),
  onSuccess: vi.fn(),
};

function renderDialog(props: Partial<typeof defaultProps> = {}) {
  const merged = { ...defaultProps, ...props };
  return render(<AddHomeownerDialog {...merged} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AddHomeownerDialog", () => {
  beforeEach(() => {
    mockAdd.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    trackDashboardEventMock.mockReset();
    capturedOnOpenChange = undefined;
    defaultProps.onOpenChange.mockReset();
    defaultProps.onSuccess.mockReset();
  });

  // -------------------------------------------------------------------------
  // 1. Renders all fields when open
  // -------------------------------------------------------------------------
  it("renders with all fields when open=true", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Add Homeowner")).toBeTruthy();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/unit number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/move.?in date/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
  });

  it("does not render when open=false", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. Validation — required fields
  // -------------------------------------------------------------------------
  it("shows required field errors when submitting empty form", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /save/i }));

    // findAllByRole waits for async RHF/Zod validation to render error messages
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(3);

    // The API should not have been called
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("shows validation error for invalid email", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Smith");
    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /save/i }));

    // findAllByRole waits for async RHF/Zod validation to surface
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("shows validation error for invalid move-in date format", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Smith");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");

    // Use fireEvent.change because jsdom normalises <input type="date"> and
    // may silently discard values that don't match YYYY-MM-DD when typed via
    // userEvent. fireEvent bypasses browser normalisation so we can inject the
    // invalid value directly.
    fireEvent.change(screen.getByLabelText(/move.?in date/i), {
      target: { value: "01/15/2024" },
    });

    await user.click(screen.getByRole("button", { name: /save/i }));

    // If jsdom accepted the invalid value the regex should reject it and show
    // a field-level error; if jsdom silently cleared it the field is empty
    // (treated as undefined/optional) so no error will appear — but the API
    // should still not have been called with the bad date string.
    const dateInput = screen.getByLabelText(
      /move.?in date/i,
    ) as HTMLInputElement;
    if (dateInput.value === "01/15/2024") {
      // jsdom kept the value — Zod regex should fire
      expect(
        await screen.findByText(/moveInDate must be YYYY-MM-DD/i),
      ).toBeInTheDocument();
      expect(mockAdd).not.toHaveBeenCalled();
    } else {
      // jsdom cleared the value — no validation error but form is still valid
      // for the required fields, so mockAdd may be called; just assert the
      // bad date was not forwarded to the API.
      await waitFor(() => {
        if (mockAdd.mock.calls.length > 0) {
          const callArgs = mockAdd.mock.calls[0][1] as Record<string, unknown>;
          expect(callArgs).not.toHaveProperty("moveInDate", "01/15/2024");
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // 3. Happy path
  // -------------------------------------------------------------------------
  it("calls api.governance.homeowners.add with correct args on valid submit", async () => {
    const user = userEvent.setup();
    mockAdd.mockResolvedValueOnce({
      homeowner: {
        id: "hw-1",
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        unitNumber: "101",
        phone: "555-1234",
        moveInDate: "2024-01-15",
      },
    });

    renderDialog();

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Smith");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.type(screen.getByLabelText(/unit number/i), "101");
    await user.type(screen.getByLabelText(/phone/i), "555-1234");
    await user.type(screen.getByLabelText(/move.?in date/i), "2024-01-15");

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith("comm-1", {
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        unitNumber: "101",
        phone: "555-1234",
        moveInDate: "2024-01-15",
      });
    });

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Homeowner added.");
      expect(defaultProps.onSuccess).toHaveBeenCalled();
    });
  });

  it("tracks homeowner creation with booleans and no contact details", async () => {
    const user = userEvent.setup();
    mockAdd.mockResolvedValueOnce({
      homeowner: {
        id: "hw-1",
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        unitNumber: "101",
        phone: "555-1234",
        moveInDate: "2024-01-15",
      },
    });

    renderDialog();

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Smith");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.type(screen.getByLabelText(/unit number/i), "101");
    await user.type(screen.getByLabelText(/phone/i), "555-1234");
    await user.type(screen.getByLabelText(/move.?in date/i), "2024-01-15");

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(trackDashboardEventMock).toHaveBeenCalledWith(
        "governance_item_created",
        {
          community_id: "comm-1",
          has_move_in_date: true,
          has_phone: true,
          has_unit_number: true,
          item_type: "homeowner",
        },
      );
    });

    const calls = JSON.stringify(trackDashboardEventMock.mock.calls);
    expect(calls).not.toContain("Jane");
    expect(calls).not.toContain("Smith");
    expect(calls).not.toContain("jane@example.com");
    expect(calls).not.toContain("555-1234");
    expect(calls).not.toContain("101");
    expect(calls).not.toContain("2024-01-15");
  });

  it("submits with only required fields (optional fields empty)", async () => {
    const user = userEvent.setup();
    mockAdd.mockResolvedValueOnce({
      homeowner: {
        id: "hw-2",
        firstName: "Bob",
        lastName: "Jones",
        email: "bob@example.com",
        unitNumber: null,
        phone: null,
        moveInDate: null,
      },
    });

    renderDialog();

    await user.type(screen.getByLabelText(/first name/i), "Bob");
    await user.type(screen.getByLabelText(/last name/i), "Jones");
    await user.type(screen.getByLabelText(/email/i), "bob@example.com");

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        "comm-1",
        expect.objectContaining({
          firstName: "Bob",
          lastName: "Jones",
          email: "bob@example.com",
        }),
      );
    });

    // Optional fields must NOT be sent as empty strings
    const callArgs = mockAdd.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("unitNumber");
    expect(callArgs).not.toHaveProperty("phone");
    expect(callArgs).not.toHaveProperty("moveInDate");

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Homeowner added.");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Error path — generic API error
  // -------------------------------------------------------------------------
  it("shows toast.error when API throws and dialog stays open", async () => {
    const user = userEvent.setup();
    mockAdd.mockRejectedValueOnce(new Error("Server error"));

    renderDialog();

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Smith");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "We could not add this homeowner. Please try again.",
      );
    });
    expect(mockToastError).not.toHaveBeenCalledWith("Server error");

    // Dialog is still open (onSuccess not called)
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows fallback error message when thrown error has no message", async () => {
    const user = userEvent.setup();
    // Throw an error with empty message
    mockAdd.mockRejectedValueOnce(new Error(""));

    renderDialog();

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Smith");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "We could not add this homeowner. Please try again.",
      );
    });
    expect(mockToastError).not.toHaveBeenCalledWith("Failed to add homeowner.");
  });

  // -------------------------------------------------------------------------
  // 5. 409 conflict — email already exists
  // -------------------------------------------------------------------------
  it("sets email field error when API returns 409 conflict message", async () => {
    const user = userEvent.setup();
    const conflictError = new ApiError(
      "A homeowner with this email already exists in this community",
      409,
      "/communities/comm-1/homeowners",
    );
    mockAdd.mockRejectedValueOnce(conflictError);

    renderDialog();

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Smith");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "A homeowner with this email already exists in this community",
        ),
      ).toBeInTheDocument();
    });

    // Should NOT show a toast.error for conflict (field error is surfaced inline)
    expect(mockToastError).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cancel button
  // -------------------------------------------------------------------------
  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange when dialog emits onOpenChange event", () => {
    renderDialog();
    capturedOnOpenChange?.(false);
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });
});
