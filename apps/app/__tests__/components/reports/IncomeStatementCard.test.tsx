import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  IncomeStatementCard,
  computeNetIncome,
} from "@/components/reports/IncomeStatementCard";
import type { IncomeStatementRow } from "@/lib/api";

const sampleRows: IncomeStatementRow[] = [
  {
    fundType: "operating",
    revenue: 500000,
    expenses: 300000,
    netIncome: 200000,
  },
  {
    fundType: "reserve",
    revenue: 100000,
    expenses: 20000,
    netIncome: 80000,
  },
];

describe("computeNetIncome", () => {
  it("subtracts expenses from revenue", () => {
    expect(computeNetIncome(500000, 300000)).toBe(200000);
  });

  it("returns zero when revenue equals expenses", () => {
    expect(computeNetIncome(100000, 100000)).toBe(0);
  });

  it("returns negative when expenses exceed revenue", () => {
    expect(computeNetIncome(50000, 80000)).toBe(-30000);
  });
});

describe("IncomeStatementCard", () => {
  it("shows skeleton rows when isLoading is true", () => {
    const { container } = render(
      <IncomeStatementCard rows={[]} isLoading={true} />,
    );
    expect(container.querySelectorAll("tr").length).toBeGreaterThan(0);
  });

  it("shows 'No income statement data.' when rows are empty", () => {
    render(<IncomeStatementCard rows={[]} isLoading={false} />);
    expect(screen.getByText("No income statement data for this period.")).toBeTruthy();
  });

  it("renders Operating Fund section", () => {
    render(<IncomeStatementCard rows={sampleRows} isLoading={false} />);
    expect(screen.getByText("Operating Fund")).toBeTruthy();
  });

  it("renders Reserve Fund section", () => {
    render(<IncomeStatementCard rows={sampleRows} isLoading={false} />);
    expect(screen.getByText("Reserve Fund")).toBeTruthy();
  });

  it("renders revenue, expenses, and net income labels", () => {
    render(<IncomeStatementCard rows={sampleRows} isLoading={false} />);
    const revenues = screen.getAllByText("Revenue");
    const expenses = screen.getAllByText("Expenses");
    const nets = screen.getAllByText("Net Income");
    expect(revenues.length).toBeGreaterThanOrEqual(2);
    expect(expenses.length).toBeGreaterThanOrEqual(2);
    expect(nets.length).toBeGreaterThanOrEqual(2);
  });

  it("renders formatted revenue amount", () => {
    render(<IncomeStatementCard rows={sampleRows} isLoading={false} />);
    // 500000 cents -> $5,000.00
    expect(screen.getByText("$5,000.00")).toBeTruthy();
  });

  it("renders computed net income", () => {
    render(<IncomeStatementCard rows={sampleRows} isLoading={false} />);
    // net: 500000 - 300000 = 200000 -> $2,000.00
    expect(screen.getByText("$2,000.00")).toBeTruthy();
  });
});
