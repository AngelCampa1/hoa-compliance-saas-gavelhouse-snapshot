import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BalanceSheetCard } from "@/components/reports/BalanceSheetCard";
import { useCommunity } from "@/lib/community-context";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { getSingleDatePresets } from "@/lib/period-presets";
import { TierUpgradeGate } from "@/components/tier-upgrade-gate";
import { trackDashboardEvent } from "@/lib/analytics";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/_app/reports/balance-sheet")({
  component: BalanceSheetPage,
});

function BalanceSheetPage() {
  return (
    <TierUpgradeGate
      feature="reports"
      featureName="Reports"
      capability="report:read"
    >
      <BalanceSheetReport />
    </TierUpgradeGate>
  );
}

function BalanceSheetReport() {
  const { selectedCommunityId } = useCommunity();
  const communityId = selectedCommunityId ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(today);

  const singleDatePresets = getSingleDatePresets();

  useEffect(() => {
    if (!communityId) return;
    trackDashboardEvent("report_viewed", {
      report_type: "balance_sheet",
      community_id: communityId,
    });
  }, [communityId]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["balance-sheet", communityId, asOf],
    queryFn: () => api.reports.balanceSheet(communityId, asOf),
    enabled: !!communityId,
  });

  useEffect(() => {
    if (!communityId || !isError) return;
    trackDashboardEvent("report_load_failed", {
      community_id: communityId,
      failure_type: "api_error",
      report_type: "balance_sheet",
    });
  }, [communityId, isError]);

  return (
    <PageContainer variant="report">
      <PageHeader
        title="Balance Sheet"
        description="View assets, liabilities, and equity at a point in time."
      />
      <div className="space-y-3">
        <DatePicker label="As of" value={asOf} onChange={setAsOf} />
        <div className="flex gap-2 flex-wrap">
          {singleDatePresets.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              onClick={() => setAsOf(preset.asOf)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Unable to load the balance sheet. Please try again or adjust the
            date.
          </AlertDescription>
        </Alert>
      ) : (
        <BalanceSheetCard rows={data?.rows ?? []} isLoading={isLoading} />
      )}
    </PageContainer>
  );
}
