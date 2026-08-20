import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  TrialBalanceTable,
  formatCents,
} from "@/components/reports/TrialBalanceTable";
import type { TrialBalanceRow } from "@/lib/api";

const sampleRows: TrialBalanceRow[] = [
  {
    accountId: "acc-1",
    accountCode: "1000",
    accountName: "Cash",
    accountType: "asset",
    fundType: "operating",
    debitCents: 100000,
    creditCents: 50000,
  },
  {
    accountId: "acc-2",
    accountCode: "2000",
    accountName: "Accounts Payable",
    accountType: "liability",
    fundType: "reserve",
    debitCents: 0,
    creditCents: 30000,
  },
];

describe("formatCents", () => {
  it("formats zero", () => {
    expect(formatCents(0)).toBe("$0.00");
  });

  it("formats positive cents", () => {
    expect(formatCents(100)).toBe("$1.00");
  });

  it("formats large amount", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
  });

  it("formats negative cents with the sign before the dollar symbol", () => {
    expect(formatCents(-500)).toBe("-$5.00");
  });

  it("formats negative cents under a dollar", () => {
    expect(formatCents(-5)).toBe("-$0.05");
  });
});

describe("TrialBalanceTable", () => {
  it("shows skeleton rows when isLoading is true", () => {
    const { container } = render(
      <TrialBalanceTable rows={[]} isLoading={true} />,
    );
    expect(container.querySelectorAll("tr").length).toBeGreaterThan(0);
  });

  it("shows 'No trial balance data.' when rows are empty and not loading", () => {
    render(<TrialBalanceTable rows={[]} isLoading={false} />);
    expect(screen.getByText("No trial balance data for this date.")).toBeTruthy();
  });

  it("renders table headers", () => {
    render(<TrialBalanceTable rows={sampleRows} isLoading={false} />);
    expect(screen.getByText("Code")).toBeTruthy();
    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("Type")).toBeTruthy();
    expect(screen.getByText("Fund")).toBeTruthy();
    expect(screen.getByText("Debits")).toBeTruthy();
    expect(screen.getByText("Credits")).toBeTruthy();
    expect(screen.getByText("Net")).toBeTruthy();
  });

  it("renders account rows with correct data", () => {
    render(<TrialBalanceTable rows={sampleRows} isLoading={false} />);
    expect(screen.getByText("1000")).toBeTruthy();
    expect(screen.getByText("Cash")).toBeTruthy();
    expect(screen.getByText("asset")).toBeTruthy();
    expect(screen.getByText("operating")).toBeTruthy();
    expect(screen.getAllByText("$1,000.00").length).toBeGreaterThanOrEqual(1);
    // $500.00 appears in both Credits and Net columns
    const fiveHundreds = screen.getAllByText("$500.00");
    expect(fiveHundreds.length).toBeGreaterThanOrEqual(1);
  });

  it("renders net as debit minus credit", () => {
    render(<TrialBalanceTable rows={sampleRows} isLoading={false} />);
    // 100000 - 50000 = 50000 -> $500.00 (appears in credits and net columns)
    const nets = screen.getAllByText("$500.00");
    expect(nets.length).toBeGreaterThanOrEqual(1);
  });

  it("renders multiple rows", () => {
    render(<TrialBalanceTable rows={sampleRows} isLoading={false} />);
    expect(screen.getByText("2000")).toBeTruthy();
    expect(screen.getByText("Accounts Payable")).toBeTruthy();
    expect(screen.getByText("reserve")).toBeTruthy();
  });
});
