import type { TrialBalanceRow } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryStat, SummaryStatGrid } from "@/components/ui/stat-card";
import { formatCents } from "@/lib/money";

export { formatCents } from "@/lib/money";

type Props = { rows: TrialBalanceRow[]; isLoading: boolean };

export function TrialBalanceTable({ rows, isLoading }: Props) {
  if (isLoading) return <TableSkeleton rows={6} columns={7} />;
  if (rows.length === 0) return <EmptyState title="No trial balance data for this date." />;

  const totalDebits = rows.reduce((sum, row) => sum + row.debitCents, 0);
  const totalCredits = rows.reduce((sum, row) => sum + row.creditCents, 0);
  const balanceDelta = totalDebits - totalCredits;

  return (
    <div className="space-y-4">
      <SummaryStatGrid>
        <SummaryStat label="Total Debits" value={formatCents(totalDebits)} />
        <SummaryStat label="Total Credits" value={formatCents(totalCredits)} />
        <SummaryStat
          label="Balance Check"
          value={balanceDelta === 0 ? "Balanced" : formatCents(balanceDelta)}
          detail={
            balanceDelta === 0
              ? "Debits equal credits"
              : "Debits and credits differ"
          }
          tone={balanceDelta === 0 ? "success" : "destructive"}
        />
        <SummaryStat label="Accounts" value={rows.length} />
      </SummaryStatGrid>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Fund</TableHead>
            <TableHead className="text-right">Debits</TableHead>
            <TableHead className="text-right">Credits</TableHead>
            <TableHead className="text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.accountId}>
              <TableCell className="font-mono">{row.accountCode}</TableCell>
              <TableCell>{row.accountName}</TableCell>
              <TableCell>{row.accountType}</TableCell>
              <TableCell>{row.fundType}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatCents(row.debitCents)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatCents(row.creditCents)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatCents(row.debitCents - row.creditCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
