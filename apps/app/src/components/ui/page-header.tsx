import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  React.useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="break-words text-2xl font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {description !== undefined && (
          <p className="max-w-3xl break-words text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export { PageHeader };
