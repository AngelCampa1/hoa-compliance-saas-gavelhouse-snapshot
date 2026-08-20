import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  StatementUpload,
  parseBalanceCents,
} from "@/components/bank/StatementUpload";

const trackDashboardEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: trackDashboardEventMock,
}));

vi.mock("@/lib/api", () => ({
  api: {
    bank: {
      importStatement: vi.fn(),
    },
  },
}));

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

import { api } from "@/lib/api";

describe("parseBalanceCents", () => {
  it("parses plain decimal", () => {
    expect(parseBalanceCents("1234.56")).toBe(123456);
  });

  it("parses with dollar sign", () => {
    expect(parseBalanceCents("$1234.56")).toBe(123456);
  });

  it("parses with comma separators", () => {
    expect(parseBalanceCents("$1,234.56")).toBe(123456);
  });

  it("parses zero", () => {
    expect(parseBalanceCents("0")).toBe(0);
  });

  it("parses whole number", () => {
    expect(parseBalanceCents("100")).toBe(10000);
  });

  it("returns null for empty string", () => {
    expect(parseBalanceCents("")).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(parseBalanceCents("abc")).toBeNull();
  });

  it("returns null for string with only symbols", () => {
    expect(parseBalanceCents("$,")).toBeNull();
  });

  it("returns null for Infinity string", () => {
    expect(parseBalanceCents("Infinity")).toBeNull();
  });
});

describe("StatementUpload", () => {
  const mockImport = api.bank.importStatement as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockImport.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    trackDashboardEventMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderForm() {
    const onSuccess = vi.fn();
    render(
      <StatementUpload
        communityId="comm-1"
        accountId="acc-1"
        onSuccess={onSuccess}
      />,
    );
    return { onSuccess };
  }

  it("renders all form fields", () => {
    renderForm();
    expect(screen.getByLabelText("Beginning Balance")).toBeTruthy();
    expect(screen.getByLabelText("Ending Balance")).toBeTruthy();
    expect(screen.getByLabelText("Statement Date")).toBeTruthy();
    expect(screen.getByLabelText("CSV Data")).toBeTruthy();
    expect(screen.getByText("Import Statement")).toBeTruthy();
  });

  it("shows error for invalid beginning balance", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Beginning Balance"), {
      target: { value: "notanumber" },
    });
    fireEvent.change(screen.getByLabelText("Ending Balance"), {
      target: { value: "100.00" },
    });
    fireEvent.change(screen.getByLabelText("Statement Date"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.change(screen.getByLabelText("CSV Data"), {
      target: { value: "date,description,amount\n2026-01-01,Dues,100.00" },
    });
    fireEvent.submit(screen.getByText("Import Statement").closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Invalid beginning balance.")).toBeTruthy();
    });
    expect(trackDashboardEventMock).toHaveBeenCalledWith(
      "bank_statement_upload_failed",
      {
        account_id: "acc-1",
        community_id: "comm-1",
        failure_type: "validation",
        field: "beginning_balance",
      },
    );
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("shows error for invalid ending balance", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Beginning Balance"), {
      target: { value: "100.00" },
    });
    fireEvent.change(screen.getByLabelText("Ending Balance"), {
      target: { value: "xyz" },
    });
    fireEvent.change(screen.getByLabelText("Statement Date"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.change(screen.getByLabelText("CSV Data"), {
      target: { value: "date,description,amount\n2026-01-01,Dues,100.00" },
    });
    fireEvent.submit(screen.getByText("Import Statement").closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Invalid ending balance.")).toBeTruthy();
    });
    expect(trackDashboardEventMock).toHaveBeenCalledWith(
      "bank_statement_upload_failed",
      {
        account_id: "acc-1",
        community_id: "comm-1",
        failure_type: "validation",
        field: "ending_balance",
      },
    );
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("blocks submit until statement date is provided", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Beginning Balance"), {
      target: { value: "100.00" },
    });
    fireEvent.change(screen.getByLabelText("Ending Balance"), {
      target: { value: "200.00" },
    });
    fireEvent.change(screen.getByLabelText("CSV Data"), {
      target: { value: "date,description,amount\n2026-01-01,Dues,100.00" },
    });

    fireEvent.submit(screen.getByText("Import Statement").closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Statement date is required.",
      );
      expect(mockImport).not.toHaveBeenCalled();
    });
    expect(trackDashboardEventMock).toHaveBeenCalledWith(
      "bank_statement_upload_failed",
      {
        account_id: "acc-1",
        community_id: "comm-1",
        failure_type: "validation",
        field: "statement_date",
      },
    );
  });

  it("blocks submit until CSV data is provided", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Beginning Balance"), {
      target: { value: "100.00" },
    });
    fireEvent.change(screen.getByLabelText("Ending Balance"), {
      target: { value: "200.00" },
    });
    fireEvent.change(screen.getByLabelText("Statement Date"), {
      target: { value: "2026-01-31" },
    });

    fireEvent.submit(screen.getByText("Import Statement").closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "CSV data is required.",
      );
      expect(mockImport).not.toHaveBeenCalled();
    });
    expect(trackDashboardEventMock).toHaveBeenCalledWith(
      "bank_statement_upload_failed",
      {
        account_id: "acc-1",
        community_id: "comm-1",
        failure_type: "validation",
        field: "csv",
      },
    );
  });

  it("calls api.bank.importStatement on valid submit", async () => {
    mockImport.mockResolvedValueOnce({ statementId: "stmt-1" });
    const { onSuccess } = renderForm();

    fireEvent.change(screen.getByLabelText("Beginning Balance"), {
      target: { value: "1000.00" },
    });
    fireEvent.change(screen.getByLabelText("Ending Balance"), {
      target: { value: "1200.00" },
    });
    fireEvent.change(screen.getByLabelText("Statement Date"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.change(screen.getByLabelText("CSV Data"), {
      target: { value: "date,desc,amount" },
    });

    fireEvent.submit(screen.getByText("Import Statement").closest("form")!);

    await waitFor(() => {
      expect(mockImport).toHaveBeenCalledWith({
        communityId: "comm-1",
        accountId: "acc-1",
        beginningBalanceCents: 100000,
        endingBalanceCents: 120000,
        statementDate: "2026-01-31",
        csv: "date,desc,amount",
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("does not duplicate server-side successful statement import analytics", async () => {
    mockImport.mockResolvedValueOnce({ statementId: "stmt-1" });
    renderForm();

    fireEvent.change(screen.getByLabelText("Beginning Balance"), {
      target: { value: "$1,000.00" },
    });
    fireEvent.change(screen.getByLabelText("Ending Balance"), {
      target: { value: "$1,250.00" },
    });
    fireEvent.change(screen.getByLabelText("Statement Date"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.change(screen.getByLabelText("CSV Data"), {
      target: {
        value:
          "date,description,amount\n2026-01-01,Dues,100.00\n2026-01-02,Repair,-25.00",
      },
    });

    fireEvent.submit(screen.getByText("Import Statement").closest("form")!);

    await waitFor(() => {
      expect(mockImport).toHaveBeenCalled();
    });

    const calls = JSON.stringify(trackDashboardEventMock.mock.calls);
    expect(trackDashboardEventMock).not.toHaveBeenCalled();
    expect(calls).not.toContain("Dues");
    expect(calls).not.toContain("Repair");
    expect(calls).not.toContain("$1,000.00");
  });

  it("notifies external submit controls while upload is pending", async () => {
    let resolveImport: (value: unknown) => void = () => {};
    mockImport.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveImport = resolve;
      }),
    );
    const onPendingChange = vi.fn();
    const onSuccess = vi.fn();
    render(
      <StatementUpload
        communityId="comm-1"
        accountId="acc-1"
        onSuccess={onSuccess}
        submitPlacement="external"
        onPendingChange={onPendingChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Beginning Balance"), {
      target: { value: "1000.00" },
    });
    fireEvent.change(screen.getByLabelText("Ending Balance"), {
      target: { value: "1200.00" },
    });
    fireEvent.change(screen.getByLabelText("Statement Date"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.change(screen.getByLabelText("CSV Data"), {
      target: { value: "date,desc,amount" },
    });

    fireEvent.submit(document.getElementById("statement-upload-form")!);

    await waitFor(() => {
      expect(onPendingChange).toHaveBeenCalledWith(true);
    });

    resolveImport({ statementId: "stmt-1" });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onPendingChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows error message when api call fails", async () => {
    mockImport.mockRejectedValueOnce(new Error("Server error"));
    renderForm();

    fireEvent.change(screen.getByLabelText("Beginning Balance"), {
      target: { value: "100.00" },
    });
    fireEvent.change(screen.getByLabelText("Ending Balance"), {
      target: { value: "200.00" },
    });
    fireEvent.change(screen.getByLabelText("Statement Date"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.change(screen.getByLabelText("CSV Data"), {
      target: { value: "date,description,amount\n2026-01-01,Dues,100.00" },
    });

    fireEvent.submit(screen.getByText("Import Statement").closest("form")!);

    await waitFor(() => {
      expect(
        screen.getByText(
          /We could not import this statement\. Check the file and try again\. Tracking ID:/,
        ),
      ).toBeTruthy();
    });
    expect(trackDashboardEventMock).not.toHaveBeenCalled();
    const calls = JSON.stringify(trackDashboardEventMock.mock.calls);
    expect(calls).not.toContain("Server error");
    expect(calls).not.toContain("Dues");
    expect(calls).not.toContain("100.00");
  });

  it("shows generic error message when non-Error thrown", async () => {
    mockImport.mockRejectedValueOnce("string error");
    renderForm();

    fireEvent.change(screen.getByLabelText("Beginning Balance"), {
      target: { value: "100.00" },
    });
    fireEvent.change(screen.getByLabelText("Ending Balance"), {
      target: { value: "200.00" },
    });
    fireEvent.change(screen.getByLabelText("Statement Date"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.change(screen.getByLabelText("CSV Data"), {
      target: { value: "date,description,amount\n2026-01-01,Dues,100.00" },
    });

    fireEvent.submit(screen.getByText("Import Statement").closest("form")!);

    await waitFor(() => {
      expect(
        screen.getByText(
          /We could not import this statement\. Check the file and try again\. Tracking ID:/,
        ),
      ).toBeTruthy();
    });
  });

  it("calls toast.error when import fails", async () => {
    mockImport.mockRejectedValueOnce(new Error("Upload error"));
    renderForm();

    fireEvent.change(screen.getByLabelText("Beginning Balance"), {
      target: { value: "100.00" },
    });
    fireEvent.change(screen.getByLabelText("Ending Balance"), {
      target: { value: "200.00" },
    });
    fireEvent.change(screen.getByLabelText("Statement Date"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.change(screen.getByLabelText("CSV Data"), {
      target: { value: "date,description,amount\n2026-01-01,Dues,100.00" },
    });

    fireEvent.submit(screen.getByText("Import Statement").closest("form")!);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled();
    });
  });
});
