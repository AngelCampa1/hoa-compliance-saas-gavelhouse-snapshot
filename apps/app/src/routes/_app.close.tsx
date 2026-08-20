import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getPageHelpForRoute } from "@boardstack/shared";
import { api } from "@/lib/api";
import { CloseChecklist } from "@/components/close/CloseChecklist";
import { useCommunity } from "@/lib/community-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";
import { reportUserFacingError } from "@/lib/sentry";
import { SummaryStat, SummaryStatGrid } from "@/components/ui/stat-card";
import { TierUpgradeGate } from "@/components/tier-upgrade-gate";
import { getCloseStepLabel } from "@/lib/finance-labels";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/_app/close")({
  component: MonthEndClosePage,
});

function MonthEndClosePage() {
  return (
    <TierUpgradeGate feature="month-end-close" featureName="Month-end close">
      <MonthEndCloseContent />
    </TierUpgradeGate>
  );
}

function MonthEndCloseContent() {
  const queryClient = useQueryClient();
  const { selectedCommunityId } = useCommunity();
  const communityId = selectedCommunityId ?? "";
  const [selectedCloseId, setSelectedCloseId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startCloseError, setStartCloseError] = useState<string | null>(null);
  const pageHelp = getPageHelpForRoute("/close");

  const { data: closesData, isError: closesError } = useQuery({
    queryKey: ["closes", communityId],
    queryFn: () => api.close.list(communityId),
    enabled: !!communityId,
  });

  const closes = closesData?.closes ?? [];
  const openCloses = closes.filter((close) => close.status === "open");
  const completedCloses = closes.filter((close) => close.status === "complete");
  const activeClose =
    closes.find((close) => close.id === selectedCloseId) ??
    openCloses[0] ??
    closes[0] ??
    null;
  const historicalCloses = closes.filter(
    (close) => close.id !== activeClose?.id,
  );
  const checklistCloseId = selectedCloseId ?? activeClose?.id ?? null;
  const {
    data: checklistData,
    isLoading: checklistLoading,
    isError: checklistError,
  } = useQuery({
    queryKey: ["close-checklist", checklistCloseId, communityId],
    queryFn: () => api.close.getChecklist(checklistCloseId!, communityId),
    enabled: !!checklistCloseId && !!communityId,
  });
  const checklistItems = checklistData?.items ?? [];
  const completedSteps = checklistItems.filter((item) => item.completed).length;
  const nextBlockedStep = checklistItems.find((item) => !item.completed);
  const progressLabel =
    activeClose && checklistItems.length > 0
      ? `${completedSteps}/${checklistItems.length}`
      : activeClose?.status === "complete"
        ? "Complete"
        : "Not started";

  async function handleStartClose() {
    if (!communityId) return;
    setIsStarting(true);
    setStartCloseError(null);
    try {
      const now = new Date();
      const { closeId } = await api.close.start(
        communityId,
        now.getFullYear(),
        now.getMonth() + 1,
      );
      setSelectedCloseId(closeId);
      await queryClient.invalidateQueries({
        queryKey: ["closes", communityId],
      });
    } catch (err) {
      const msg = reportUserFacingError(
        err,
        "We could not start this close. Please try again.",
        { tags: { source: "close-start" } },
      );
      setStartCloseError(msg);
      toast.error(msg);
    } finally {
      setIsStarting(false);
    }
  }

  function handleComplete() {
    void queryClient.invalidateQueries({ queryKey: ["closes", communityId] });
    setSelectedCloseId(null);
  }

  function closePeriodLabel(close: (typeof closes)[number]) {
    return `${close.periodYear}-${String(close.periodMonth).padStart(2, "0")}`;
  }

  return (
    <PageContainer>
      <PageHeader
        title="Month-End Close"
        description="Complete the monthly checklist and lock the period."
        actions={
          <Button
            onClick={() => void handleStartClose()}
            disabled={isStarting || !communityId}
          >
            {isStarting ? "Starting…" : "Start New Close"}
          </Button>
        }
      />
      {pageHelp && <PageHelpPanel help={pageHelp} />}

      {startCloseError && (
        <Alert variant="destructive">
          <AlertDescription>{startCloseError}</AlertDescription>
        </Alert>
      )}

      {closesError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            We could not load your month-end closes. Refresh the page to try
            again.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <SummaryStatGrid>
            <SummaryStat label="Total periods" value={closes.length} />
            <SummaryStat
              label="Open closes"
              value={openCloses.length}
              tone={openCloses.length > 0 ? "warning" : "default"}
              detail="Checklist review needed"
            />
            <SummaryStat
              label="Completed"
              value={completedCloses.length}
              tone={completedCloses.length > 0 ? "success" : "default"}
              detail="Locked periods"
            />
            <SummaryStat
              label="Next action"
              value={
                nextBlockedStep
                  ? getCloseStepLabel(nextBlockedStep.step)
                  : activeClose?.status === "open"
                    ? "Complete close"
                    : "Start new close"
              }
              detail={activeClose ? "Current close period" : "No close started"}
            />
          </SummaryStatGrid>

          {activeClose && (
            <section className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Current period
                  </p>
                  <h2 className="text-xl font-semibold">
                    {activeClose.periodYear}-
                    {String(activeClose.periodMonth).padStart(2, "0")}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      activeClose.status === "complete" ? "success" : "warning"
                    }
                  >
                    {activeClose.status === "complete"
                      ? "Complete"
                      : "In Progress"}
                  </Badge>
                  {activeClose.status === "complete" &&
                    activeClose.auditPackKey && (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={api.close.auditPackUrl(
                            activeClose.id,
                            communityId,
                          )}
                          aria-label={`Download audit pack for ${closePeriodLabel(activeClose)}`}
                        >
                          Download audit pack
                        </a>
                      </Button>
                    )}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Progress
                  </p>
                  <p className="text-sm font-medium">{progressLabel}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Next step
                  </p>
                  <p className="text-sm font-medium">
                    {nextBlockedStep
                      ? getCloseStepLabel(nextBlockedStep.step)
                      : activeClose.status === "open"
                        ? "Ready to complete"
                        : "All done"}
                  </p>
                </div>
              </div>
            </section>
          )}

          {activeClose && selectedCloseId !== activeClose.id && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedCloseId(activeClose.id)}
            >
              Open checklist for this period
            </Button>
          )}

          {historicalCloses.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Past periods
              </h2>
              {historicalCloses.map((c) => (
                <div
                  key={c.id}
                  className={`flex flex-col gap-3 rounded border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${selectedCloseId === c.id ? "border-primary bg-primary/10" : ""}`}
                >
                  <button
                    type="button"
                    aria-pressed={selectedCloseId === c.id}
                    onClick={() =>
                      setSelectedCloseId(selectedCloseId === c.id ? null : c.id)
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="font-medium">{closePeriodLabel(c)}</span>
                    <Badge
                      variant={c.status === "complete" ? "success" : "warning"}
                    >
                      {c.status === "complete" ? "Complete" : "In Progress"}
                    </Badge>
                  </button>
                  {c.status === "complete" && c.auditPackKey && (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={api.close.auditPackUrl(c.id, communityId)}
                        aria-label={`Download audit pack for ${closePeriodLabel(c)}`}
                      >
                        Download audit pack
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {checklistCloseId && (
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-4">Close checklist</h2>
          {checklistLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : checklistError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                We could not load this checklist. Refresh the page to try again.
              </AlertDescription>
            </Alert>
          ) : (
            <CloseChecklist
              closeId={checklistCloseId}
              communityId={communityId}
              periodYear={
                closes.find((c) => c.id === checklistCloseId)?.periodYear ??
                new Date().getFullYear()
              }
              periodMonth={
                closes.find((c) => c.id === checklistCloseId)?.periodMonth ??
                new Date().getMonth() + 1
              }
              items={checklistItems}
              onComplete={handleComplete}
            />
          )}
        </div>
      )}
    </PageContainer>
  );
}
