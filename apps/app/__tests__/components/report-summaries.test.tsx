import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrialBalanceTable } from "@/components/reports/TrialBalanceTable";
import { BalanceSheetCard } from "@/components/reports/BalanceSheetCard";
import { IncomeStatementCard } from "@/components/reports/IncomeStatementCard";

describe("report scan summaries", () => {
  it("summarizes trial balance totals before account rows", () => {
    render(
      <TrialBalanceTable
        isLoading={false}
        rows={[
          {
            accountId: "a-1",
            accountCode: "1000",
            accountName: "Cash",
            accountType: "asset",
            fundType: "operating",
            debitCents: 50000,
            creditCents: 0,
          },
          {
            accountId: "a-2",
            accountCode: "4000",
            accountName: "Assessments",
            accountType: "revenue",
            fundType: "operating",
            debitCents: 0,
            creditCents: 50000,
          },
        ]}
      />,
    );

    expect(screen.getByText("Total Debits")).toBeInTheDocument();
    expect(screen.getByText("Total Credits")).toBeInTheDocument();
    expect(screen.getByText("Balanced")).toBeInTheDocument();
  });

  it("summarizes balance sheet fund totals before fund sections", () => {
    render(
      <BalanceSheetCard
        isLoading={false}
        rows={[
          {
            accountType: "asset",
            fundType: "operating",
            balanceCents: 125000,
          },
          {
            accountType: "liability",
            fundType: "reserve",
            balanceCents: -25000,
          },
        ]}
      />,
    );

    expect(screen.getAllByText("Operating Fund").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1,250.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reserve Fund").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-$250.00").length).toBeGreaterThan(0);
  });

  it("summarizes income statement revenue, expenses, and net income", () => {
    render(
      <IncomeStatementCard
        isLoading={false}
        rows={[
          {
            fundType: "operating",
            revenue: 200000,
            expenses: 125000,
          },
          {
            fundType: "reserve",
            revenue: 50000,
            expenses: 10000,
          },
        ]}
      />,
    );

    expect(screen.getAllByText("Revenue").length).toBeGreaterThan(0);
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    expect(screen.getAllByText("Expenses").length).toBeGreaterThan(0);
    expect(screen.getByText("$1,350.00")).toBeInTheDocument();
    expect(screen.getAllByText("Net Income").length).toBeGreaterThan(0);
    expect(screen.getByText("$1,150.00")).toBeInTheDocument();
  });
});
