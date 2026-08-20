import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-8 py-16 text-center",
        className,
      )}
    >
      {icon !== undefined && (
        <div
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          {icon}
        </div>
      )}
      <div className="max-w-xl space-y-1.5">
        <h2 className="break-words text-sm font-semibold">{title}</h2>
        {description !== undefined && (
          <p className="break-words text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action !== undefined && (
        <div className="flex max-w-full flex-wrap justify-center gap-2">
          {action}
        </div>
      )}
    </div>
  );
}

export { EmptyState };
