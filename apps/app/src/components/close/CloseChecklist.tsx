import { useState, useEffect } from "react";
import { getFieldHelp } from "@boardstack/shared";
import { api } from "@/lib/api";
import { reportUserFacingError } from "@/lib/sentry";
import type { CloseChecklistItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmActionDialog } from "@/components/help/ConfirmActionDialog";
import { HelpHint } from "@/components/help/HelpHint";
import { getCloseStepLabel } from "@/lib/finance-labels";
import { CheckCircle2, Clock } from "lucide-react";
import { trackDashboardEvent } from "@/lib/analytics";

export function allStepsCompleted(items: CloseChecklistItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => item.completed);
}

type Props = {
  closeId: string;
  communityId: string;
  periodYear: number;
  periodMonth: number;
  items: CloseChecklistItem[];
  onComplete: () => void;
};

export function CloseChecklist({
  closeId,
  communityId,
  periodYear,
  periodMonth,
  items,
  onComplete,
}: Props) {
  const [localItems, setLocalItems] = useState<CloseChecklistItem[]>(items);
  const [isCompleting, setIsCompleting] = useState(false);

  // Keep localItems in sync with server state when the parent query refetches.
  // Without this, a concurrent board member completing a step would not be
  // reflected until the component is unmounted and remounted.
  useEffect(() => {
    setLocalItems(items);
  }, [items]);
  const [packUrl, setPackUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allDone = allStepsCompleted(localItems);
  const completedCount = localItems.filter((i) => i.completed).length;
  const totalCount = localItems.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  async function handleCheck(item: CloseChecklistItem, checked: boolean) {
    if (item.completed || !checked) return;
    try {
      await api.close.advanceStep(closeId, communityId, item.step, checked);
      setLocalItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                completed: checked,
                completedAt: new Date().toISOString(),
              }
            : i,
        ),
      );
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          "We could not update this step. Please try again.",
          { tags: { source: "close-step" } },
        ),
      );
    }
  }

  async function handleComplete() {
    setError(null);
    setIsCompleting(true);
    try {
      const result = await api.close.complete(closeId, communityId);
      trackDashboardEvent("close_completed", {
        period_year: periodYear,
        period_month: periodMonth,
        community_id: communityId,
      });
      setPackUrl(
        result.auditPackKey
          ? api.close.auditPackUrl(closeId, communityId)
          : null,
      );
      onComplete();
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          "We could not complete this close. Please try again.",
          { tags: { source: "close-complete" } },
        ),
      );
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {completedCount} of {totalCount} steps complete
          </span>
          <span className="font-medium">{progressPercent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <ul className="space-y-2">
        {localItems.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <Checkbox
              id={`step-${item.id}`}
              checked={item.completed}
              onCheckedChange={(checked) =>
                void handleCheck(item, checked === true)
              }
              disabled={item.completed}
              className="shrink-0"
            />
            <label htmlFor={`step-${item.id}`} className="flex-1 text-sm">
              {getCloseStepLabel(item.step)}
            </label>
            {item.completed ? (
              <Badge
                variant="success"
                icon={<CheckCircle2 className="h-3 w-3" />}
              >
                Done
              </Badge>
            ) : (
              <Badge variant="neutral" icon={<Clock className="h-3 w-3" />}>
                Pending
              </Badge>
            )}
            {item.completed && item.completedAt && (
              <span className="text-xs text-muted-foreground">
                {new Date(item.completedAt).toLocaleDateString()}
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {packUrl && (
        <Alert variant="success">
          <AlertDescription>
            Period locked.{" "}
            <a href={packUrl} className="font-medium underline">
              Download audit pack
            </a>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-2">
        <ConfirmActionDialog
          trigger={
            <Button type="button" disabled={!allDone || isCompleting}>
              {isCompleting ? "Completing…" : "Complete Close"}
            </Button>
          }
          title="Complete this month-end close?"
          description="This locks the period for board records. Only do this after you have reviewed the checklist."
          confirmLabel="Complete close"
          onConfirm={() => void handleComplete()}
          disabled={!allDone || isCompleting}
        />
        {getFieldHelp("close.complete") && (
          <HelpHint help={getFieldHelp("close.complete")!} />
        )}
      </div>
    </div>
  );
}
