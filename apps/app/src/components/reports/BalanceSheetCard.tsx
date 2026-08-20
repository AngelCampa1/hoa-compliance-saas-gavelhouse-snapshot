import type { BalanceSheetRow } from "@/lib/api";
import { formatCents } from "./TrialBalanceTable";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { SummaryStat, SummaryStatGrid } from "@/components/ui/stat-card";

export function groupBalanceSheet(
  rows: BalanceSheetRow[],
): Record<string, { type: string; balanceCents: number }[]> {
  const result: Record<string, { type: string; balanceCents: number }[]> = {};
  for (const row of rows) {
    const key = row.fundType;
    if (!result[key]) result[key] = [];
    result[key].push({ type: row.accountType, balanceCents: row.balanceCents });
  }
  return result;
}

type Props = { rows: BalanceSheetRow[]; isLoading: boolean };

export function BalanceSheetCard({ rows, isLoading }: Props) {
  if (isLoading) return <TableSkeleton rows={4} columns={2} />;

  const grouped = groupBalanceSheet(rows);
  const fundTypes: Array<"operating" | "reserve"> = ["operating", "reserve"];
  const fundTotals = Object.fromEntries(
    fundTypes.map((fund) => [
      fund,
      (grouped[fund] ?? []).reduce((sum, item) => sum + item.balanceCents, 0),
    ]),
  ) as Record<"operating" | "reserve", number>;
  const totalAssets = rows
    .filter((row) => row.accountType === "asset")
    .reduce((sum, row) => sum + row.balanceCents, 0);
  const totalLiabilitiesAndEquity = rows
    .filter((row) => row.accountType !== "asset")
    .reduce((sum, row) => sum + row.balanceCents, 0);

  return (
    <div className="space-y-6">
      <SummaryStatGrid>
        <SummaryStat
          label="Operating Fund"
          value={formatCents(fundTotals.operating)}
        />
        <SummaryStat
          label="Reserve Fund"
          value={formatCents(fundTotals.reserve)}
        />
        <SummaryStat label="Assets" value={formatCents(totalAssets)} />
        <SummaryStat
          label="Liabilities & Equity"
          value={formatCents(totalLiabilitiesAndEquity)}
        />
      </SummaryStatGrid>
      {fundTypes.map((fund) => {
        const items = grouped[fund] ?? [];
        const total = fundTotals[fund];
        return (
          <div key={fund} className="border rounded-lg p-4">
            <h2 className="font-semibold capitalize mb-3">
              {fund === "operating" ? "Operating Fund" : "Reserve Fund"}
            </h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries.</p>
            ) : (
              <Table>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={`${item.type}-${index}`}>
                      <TableCell className="capitalize">{item.type}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatCents(item.balanceCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-semibold">
                      {formatCents(total)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </div>
        );
      })}
    </div>
  );
}
