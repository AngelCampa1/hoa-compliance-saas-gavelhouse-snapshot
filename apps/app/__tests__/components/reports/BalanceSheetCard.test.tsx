import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  BalanceSheetCard,
  groupBalanceSheet,
} from "@/components/reports/BalanceSheetCard";
import type { BalanceSheetRow } from "@/lib/api";

const sampleRows: BalanceSheetRow[] = [
  { accountType: "asset", fundType: "operating", balanceCents: 200000 },
  { accountType: "liability", fundType: "operating", balanceCents: 50000 },
  { accountType: "asset", fundType: "reserve", balanceCents: 500000 },
];

describe("groupBalanceSheet", () => {
  it("groups rows by fundType", () => {
    const grouped = groupBalanceSheet(sampleRows);
    expect(grouped["operating"]).toHaveLength(2);
    expect(grouped["reserve"]).toHaveLength(1);
  });

  it("returns empty record for empty rows", () => {
    expect(groupBalanceSheet([])).toEqual({});
  });

  it("preserves type and balanceCents on each item", () => {
    const grouped = groupBalanceSheet(sampleRows);
    expect(grouped["operating"][0]).toEqual({
      type: "asset",
      balanceCents: 200000,
    });
  });
});

describe("BalanceSheetCard", () => {
  it("shows skeleton rows when isLoading is true", () => {
    const { container } = render(
      <BalanceSheetCard rows={[]} isLoading={true} />,
    );
    expect(container.querySelectorAll("tr").length).toBeGreaterThan(0);
  });

  it("renders operating and reserve fund sections", () => {
    render(<BalanceSheetCard rows={sampleRows} isLoading={false} />);
    expect(screen.getAllByText("Operating Fund").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getAllByText("Reserve Fund").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("renders 'No entries.' for empty fund section", () => {
    // Only operating rows, no reserve rows
    const rows: BalanceSheetRow[] = [
      { accountType: "asset", fundType: "operating", balanceCents: 100000 },
    ];
    render(<BalanceSheetCard rows={rows} isLoading={false} />);
    expect(screen.getByText("No entries.")).toBeTruthy();
  });

  it("renders account types and balances", () => {
    render(<BalanceSheetCard rows={sampleRows} isLoading={false} />);
    // "asset" appears in both operating and reserve sections
    const assetItems = screen.getAllByText("asset");
    expect(assetItems.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("$2,000.00")).toBeTruthy();
  });

  it("renders totals for each fund", () => {
    render(<BalanceSheetCard rows={sampleRows} isLoading={false} />);
    // Operating total: 200000 + 50000 = 250000 -> $2,500.00
    expect(screen.getAllByText("$2,500.00").length).toBeGreaterThanOrEqual(1);
    // Reserve total: 500000 -> $5,000.00; also appears as item balance
    const fiveThousands = screen.getAllByText("$5,000.00");
    expect(fiveThousands.length).toBeGreaterThanOrEqual(1);
  });
});
