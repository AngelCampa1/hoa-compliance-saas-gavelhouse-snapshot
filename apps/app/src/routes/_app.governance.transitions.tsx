import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  roleCan,
  tierAllowsFeature,
  type BoardRole,
  type Tier,
} from "@boardstack/shared";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { GovernanceBoardTransition } from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { authClient } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";
import { SummaryStat, SummaryStatGrid } from "@/components/ui/stat-card";
import { TierUpgradeGate } from "@/components/tier-upgrade-gate";
import { ArrowRightLeft, Download } from "lucide-react";
import { reportUserFacingError } from "@/lib/sentry";

export const Route = createFileRoute("/_app/governance/transitions")({
  component: BoardTransitionsPage,
});

const STATUS_VARIANTS: Record<
  string,
  "default" | "info" | "success" | "warning" | "destructive" | "neutral"
> = {
  pending: "warning",
  acknowledged: "info",
  complete: "success",
};

const STATUS_LABELS: Record<GovernanceBoardTransition["status"], string> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  complete: "Complete",
};
const REPORTABLE_ROLES = new Set<GovernanceBoardTransition["role"]>([
  "treasurer",
  "secretary",
]);

function BoardTransitionsPage() {
  return (
    <TierUpgradeGate
      feature="governance-workflows"
      featureName="Board transitions"
    >
      <BoardTransitionsContent />
    </TierUpgradeGate>
  );
}

function BoardTransitionsContent() {
  const { selectedCommunityId, selectedCommunityRole, selectedCommunityTier } =
    useCommunity();
  const communityId = selectedCommunityId ?? "";
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.governance.transitions(communityId),
    queryFn: () => api.governance.transitions.list(communityId),
    enabled: !!communityId,
  });

  // Track which transition IDs have an in-flight mutation so we can disable
  // only that row's buttons rather than all rows (HIGH-APP-14).
  const [pendingAcknowledgeIds, setPendingAcknowledgeIds] = useState<
    Set<string>
  >(new Set());
  const [pendingCompleteIds, setPendingCompleteIds] = useState<Set<string>>(
    new Set(),
  );

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => api.governance.transitions.acknowledge(id),
    onMutate: (id) => {
      setPendingAcknowledgeIds((prev) => new Set(prev).add(id));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.governance.transitions(communityId),
      });
    },
    onError: (err, id) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not acknowledge this transition. Please try again.",
          { tags: { source: "transition-ack" } },
        ),
        { id: `ack-error-${id}` },
      );
    },
    onSettled: (_data, _err, id) => {
      setPendingAcknowledgeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  const transitions: GovernanceBoardTransition[] = data?.transitions ?? [];
  const canAcknowledgeTransition = (t: GovernanceBoardTransition) =>
    t.status === "pending" && t.toUserId === session?.user.id;
  const canCompleteTransition = (t: GovernanceBoardTransition) =>
    t.status === "acknowledged" &&
    [t.fromUserId, t.toUserId].includes(session?.user.id ?? "");
  const canDownloadReport = (t: GovernanceBoardTransition) =>
    REPORTABLE_ROLES.has(t.role) &&
    roleCan(selectedCommunityRole as BoardRole | null, "report:export") &&
    tierAllowsFeature(selectedCommunityTier as Tier | null, "reports");
  const downloadReport = (transition: GovernanceBoardTransition) => {
    if (!communityId || !transition.id) return;
    void api.reports.downloadRoleHandoff(communityId, transition.id);
  };
  const completeMutation = useMutation({
    mutationFn: (id: string) => api.governance.transitions.complete(id),
    onMutate: (id) => {
      setPendingCompleteIds((prev) => new Set(prev).add(id));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.governance.transitions(communityId),
      });
    },
    onError: (err, id) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not complete this transition. Please try again.",
          { tags: { source: "transition-complete" } },
        ),
        { id: `complete-error-${id}` },
      );
    },
    onSettled: (_data, _err, id) => {
      setPendingCompleteIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });
  const openCount = transitions.filter((t) => t.status !== "complete").length;
  const completedCount = transitions.filter(
    (t) => t.status === "complete",
  ).length;
  const nextTransition = transitions.find((t) => t.status === "pending");

  return (
    <PageContainer>
      <PageHeader
        title="Board Transitions"
        description="Track handoffs when the treasurer or secretary role changes to a new person."
      />

      <SummaryStatGrid>
        <SummaryStat label="Total transitions" value={transitions.length} />
        <SummaryStat
          label="Needs attention"
          value={openCount}
          tone={openCount > 0 ? "warning" : "default"}
          detail="Pending or in progress"
        />
        <SummaryStat
          label="Completed"
          value={completedCount}
          tone={completedCount > 0 ? "success" : "default"}
          detail="Finished handoffs"
        />
        <SummaryStat
          label="Next action"
          value={nextTransition ? "Acknowledge" : "No action needed"}
          detail={nextTransition?.role ?? "No pending transitions"}
        />
      </SummaryStatGrid>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            We could not load your board transitions. Refresh the page to try
            again.
          </AlertDescription>
        </Alert>
      ) : transitions.length === 0 ? (
        <EmptyState
          icon={<ArrowRightLeft className="h-6 w-6" />}
          title="No board transitions"
          description="A transition is created when a board role changes to a new person. None are active."
        />
      ) : (
        <ResponsiveDataList
          ariaLabel="Board transitions"
          rows={transitions}
          getRowKey={(t) => t.id}
          columns={[
            {
              key: "role",
              header: "Role",
              primary: true,
              render: (t) => <span className="capitalize">{t.role}</span>,
            },
            {
              key: "status",
              header: "Status",
              render: (t) => (
                <Badge variant={STATUS_VARIANTS[t.status] ?? "neutral"}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </Badge>
              ),
            },
            {
              key: "completed",
              header: "Completed",
              render: (t) =>
                t.completedAt
                  ? new Date(t.completedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "-",
            },
            {
              key: "pending",
              header: "Pending items",
              render: (t) =>
                t.pendingItems && t.pendingItems.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4">
                    {t.pendingItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  "-"
                ),
            },
          ]}
          renderActions={(t) => (
            <div className="flex flex-wrap gap-2">
              {canDownloadReport(t) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadReport(t)}
                  aria-label={`Download ${t.role} handoff report`}
                  disabled={!communityId}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Report
                </Button>
              ) : null}
              {canAcknowledgeTransition(t) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => acknowledgeMutation.mutate(t.id)}
                  disabled={pendingAcknowledgeIds.has(t.id)}
                >
                  Acknowledge
                </Button>
              ) : null}
              {canCompleteTransition(t) ? (
                <Button
                  size="sm"
                  onClick={() => completeMutation.mutate(t.id)}
                  disabled={pendingCompleteIds.has(t.id)}
                >
                  Complete
                </Button>
              ) : null}
            </div>
          )}
        />
      )}
    </PageContainer>
  );
}
