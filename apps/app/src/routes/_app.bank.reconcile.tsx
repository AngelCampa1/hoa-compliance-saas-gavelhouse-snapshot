import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPageHelpForRoute } from "@boardstack/shared";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { ReconcileGrid } from "@/components/bank/ReconcileGrid";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useCommunity } from "@/lib/community-context";
import { FriendlyEmptyState } from "@/components/help/FriendlyEmptyState";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";

type ReconcileSearch = {
  statement?: string;
};

export const Route = createFileRoute("/_app/bank/reconcile")({
  validateSearch: (search: Record<string, unknown>): ReconcileSearch => ({
    statement:
      typeof search["statement"] === "string" ? search["statement"] : undefined,
  }),
  component: BankReconcilePage,
});

function BankReconcilePage() {
  const { statement: reconciliationId } = Route.useSearch();
  const { selectedCommunityId } = useCommunity();
  const communityId = selectedCommunityId ?? "";
  const pageHelp = getPageHelpForRoute("/bank/reconcile");

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.bank.reconciliation(reconciliationId, communityId),
    queryFn: () => api.bank.getReconciliation(reconciliationId!, communityId),
    enabled: !!reconciliationId && !!communityId,
  });

  if (!reconciliationId) {
    return (
      <PageContainer>
        <PageHeader title="Bank Reconciliation" />
        {pageHelp && <PageHelpPanel help={pageHelp} />}
        <FriendlyEmptyState
          title="No statement selected"
          reason="Reconciliation starts from a specific bank statement, and none is selected right now."
          nextStep="Open Bank Statements, find the statement you want to review, and choose Reconcile."
          action={
            <Button asChild variant="outline">
              <Link to="/bank/statements">Go to Bank Statements</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Bank Reconciliation" />
      {pageHelp && <PageHelpPanel help={pageHelp} />}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : isError ? (
        <div role="alert">
          <FriendlyEmptyState
            title="We could not load this reconciliation"
            reason="Something went wrong while we loaded this page."
            nextStep="Refresh the page to try again."
            action={
              <Button asChild variant="outline">
                <Link to="/bank/statements">Go to Bank Statements</Link>
              </Button>
            }
          />
        </div>
      ) : data ? (
        <ReconcileGrid
          reconciliation={data.reconciliation}
          lines={data.lines}
          matches={data.matches}
          isLoading={false}
          communityId={communityId}
        />
      ) : (
        <FriendlyEmptyState
          title="We could not open this reconciliation"
          reason="This statement may have been removed, or the link may be wrong."
          nextStep="Go back to Bank Statements and choose Reconcile again."
          action={
            <Button asChild variant="outline">
              <Link to="/bank/statements">Go to Bank Statements</Link>
            </Button>
          }
        />
      )}
    </PageContainer>
  );
}
