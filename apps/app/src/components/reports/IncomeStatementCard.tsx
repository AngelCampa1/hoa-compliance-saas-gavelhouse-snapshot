import type { IncomeStatementRow } from "@/lib/api";
import { formatCents } from "./TrialBalanceTable";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryStat, SummaryStatGrid } from "@/components/ui/stat-card";

export function computeNetIncome(revenue: number, expenses: number): number {
  return revenue - expenses;
}

type Props = { rows: IncomeStatementRow[]; isLoading: boolean };

export function IncomeStatementCard({ rows, isLoading }: Props) {
  if (isLoading) return <TableSkeleton rows={3} columns={2} />;
  if (rows.length === 0)
    return <EmptyState title="No income statement data for this period." />;

  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalExpenses = rows.reduce((sum, row) => sum + row.expenses, 0);
  const totalNetIncome = computeNetIncome(totalRevenue, totalExpenses);

  return (
    <div className="space-y-4">
      <SummaryStatGrid>
        <SummaryStat label="Revenue" value={formatCents(totalRevenue)} />
        <SummaryStat label="Expenses" value={formatCents(totalExpenses)} />
        <SummaryStat
          label="Net Income"
          value={formatCents(totalNetIncome)}
          tone={totalNetIncome >= 0 ? "success" : "destructive"}
        />
        <SummaryStat label="Funds" value={rows.length} />
      </SummaryStatGrid>
      {rows.map((row) => (
        <div key={row.fundType} className="border rounded-lg p-4">
          <h2 className="font-semibold capitalize mb-3">
            {row.fundType === "operating" ? "Operating Fund" : "Reserve Fund"}
          </h2>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Revenue</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatCents(row.revenue)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Expenses</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatCents(row.expenses)}
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Net Income</TableCell>
                <TableCell className="text-right font-mono tabular-nums font-semibold">
                  {formatCents(computeNetIncome(row.revenue, row.expenses))}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ))}
    </div>
  );
}
