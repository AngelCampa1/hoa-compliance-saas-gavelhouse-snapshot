import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  description?: string;
  meta?: React.ReactNode;
  trend?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  valueClassName?: string;
}

function StatCard({
  label,
  value,
  description,
  meta,
  trend,
  action,
  icon,
  className,
  valueClassName,
}: StatCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="min-w-0 break-words text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon !== undefined && (
          <div className="h-4 w-4 shrink-0 text-muted-foreground">{icon}</div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <div
          className={cn(
            "break-words text-2xl font-semibold leading-tight tabular-nums",
            valueClassName,
          )}
        >
          {value}
        </div>
        {description !== undefined && (
          <p className="break-words text-xs text-muted-foreground">
            {description}
          </p>
        )}
        {(meta !== undefined || trend !== undefined) && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {meta !== undefined && <p className="break-words">{meta}</p>}
            {trend !== undefined && <p className="break-words">{trend}</p>}
          </div>
        )}
        {action !== undefined && <div className="pt-1">{action}</div>}
      </CardContent>
    </Card>
  );
}

interface SummaryStatGridProps {
  children: React.ReactNode;
  className?: string;
}

function SummaryStatGrid({ children, className }: SummaryStatGridProps) {
  return (
    <section
      className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}
    >
      {children}
    </section>
  );
}

interface SummaryStatProps {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "info" | "gold";
  action?: React.ReactNode;
  className?: string;
}

function SummaryStat({
  label,
  value,
  detail,
  tone = "default",
  action,
  className,
}: SummaryStatProps) {
  const toneClass = {
    default: "",
    success: "text-success",
    warning: "text-warning-foreground",
    destructive: "text-destructive",
    info: "text-info",
    gold: "text-gold-foreground",
  }[tone];

  return (
    <Card className={cn("shadow-sm", className)}>
      <CardContent className="space-y-2 p-4">
        <p className="break-words text-xs font-semibold uppercase text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            "break-words text-2xl font-semibold leading-tight tabular-nums",
            toneClass,
          )}
        >
          {value}
        </div>
        {detail !== undefined && (
          <div className="break-words text-sm text-muted-foreground">
            {detail}
          </div>
        )}
        {action !== undefined && <div className="pt-1">{action}</div>}
      </CardContent>
    </Card>
  );
}

export { StatCard, SummaryStat, SummaryStatGrid };
export type { StatCardProps, SummaryStatProps, SummaryStatGridProps };
