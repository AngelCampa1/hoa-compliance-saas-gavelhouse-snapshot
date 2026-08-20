import * as React from "react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type ResponsiveDataListColumn<T> = {
  key: string;
  header: string;
  primary?: boolean;
  align?: "left" | "right";
  className?: string;
  render: (row: T) => React.ReactNode;
};

type ResponsiveDataListProps<T> = {
  ariaLabel: string;
  columns: Array<ResponsiveDataListColumn<T>>;
  rows: T[];
  getRowKey: (row: T) => React.Key;
  emptyTitle?: string;
  emptyDescription?: string;
  renderActions?: (row: T) => React.ReactNode;
  actionLabel?: string;
  className?: string;
};

function ResponsiveDataList<T>({
  ariaLabel,
  columns,
  rows,
  getRowKey,
  emptyTitle = "No records found",
  emptyDescription,
  renderActions,
  actionLabel = "Actions",
  className,
}: ResponsiveDataListProps<T>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const primaryColumn = columns.find((column) => column.primary) ?? columns[0];
  const detailColumns = columns.filter((column) => column !== primaryColumn);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="hidden overflow-x-auto md:block">
        <Table aria-label={ariaLabel}>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  {column.header}
                </TableHead>
              ))}
              {renderActions && <TableHead>{actionLabel}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      column.primary && "font-medium",
                      column.align === "right" &&
                        "text-right font-mono tabular-nums",
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </TableCell>
                ))}
                {renderActions && <TableCell>{renderActions(row)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div
        aria-label={`${ariaLabel} mobile list`}
        className="space-y-3 md:hidden"
        role="list"
      >
        {rows.map((row) => {
          const primary = primaryColumn.render(row);
          return (
            <article
              key={getRowKey(row)}
              aria-label={String(primary)}
              className="rounded-lg border bg-card p-4 text-sm shadow-sm"
              role="listitem"
            >
              <div className="min-w-0 break-words font-medium">{primary}</div>
              <dl className="mt-3 grid gap-2">
                {detailColumns.map((column) => (
                  <div
                    key={column.key}
                    className="grid grid-cols-[minmax(5.5rem,32%)_minmax(0,1fr)] gap-3"
                  >
                    <dt className="break-words text-muted-foreground">
                      {column.header}
                    </dt>
                    <dd
                      className={cn(
                        "min-w-0 break-words",
                        column.align === "right" && "font-mono tabular-nums",
                      )}
                    >
                      {column.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
              {renderActions && (
                <div
                  aria-label={actionLabel}
                  className="mt-4 flex min-w-0 flex-wrap gap-2"
                >
                  {renderActions(row)}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export { ResponsiveDataList };
