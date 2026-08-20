import type { CommunityRollup } from "@/lib/api";
import { formatCents } from "@/components/reports/TrialBalanceTable";
import { Badge } from "@/components/ui/badge";

export function reserveHealthVariant(
  pct: number | null,
): "success" | "warning" | "destructive" {
  if (pct === null) return "destructive";
  if (pct >= 80) return "success";
  if (pct >= 50) return "warning";
  return "destructive";
}

type Props = {
  rollup: CommunityRollup;
};

export function RollupCard({ rollup }: Props) {
  const reserveVariant = reserveHealthVariant(rollup.reservePctFunded);
  const fannieVariant =
    rollup.fannieMaeCompliant === true
      ? "success"
      : rollup.fannieMaeCompliant === false
        ? "destructive"
        : "neutral";

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="break-words font-semibold">{rollup.communityName}</h3>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Reserve funded:</span>
        <Badge variant={reserveVariant}>
          {rollup.reservePctFunded !== null
            ? `${rollup.reservePctFunded.toFixed(1)}%`
            : "N/A"}
        </Badge>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Fannie Mae:</span>
        <Badge variant={fannieVariant}>
          {rollup.fannieMaeCompliant === true
            ? "Compliant"
            : rollup.fannieMaeCompliant === false
              ? "Non-compliant"
              : "Unknown"}
        </Badge>
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">Overdue assessments: </span>
        <span className="font-mono">
          {formatCents(rollup.overdueAssessmentsCents)}
        </span>
      </div>
      {rollup.lastCloseMonth && (
        <div className="text-sm">
          <span className="text-muted-foreground">Last close: </span>
          <span>{rollup.lastCloseMonth}</span>
        </div>
      )}
    </div>
  );
}
