import type * as React from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

export function FriendlyEmptyState({
  title,
  reason,
  nextStep,
  action,
  className,
}: {
  title: string;
  reason: string;
  nextStep: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-8 py-12 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-primary">
        <CircleHelp className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="max-w-xl space-y-4">
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="grid gap-3 text-left sm:grid-cols-2">
          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase text-primary">
              Why this is empty
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{reason}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase text-primary">
              Next step
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{nextStep}</p>
          </div>
        </div>
      </div>
      {action !== undefined && <div>{action}</div>}
    </div>
  );
}
