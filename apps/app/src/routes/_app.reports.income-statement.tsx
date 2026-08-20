import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { IncomeStatementCard } from "@/components/reports/IncomeStatementCard";
import { useCommunity } from "@/lib/community-context";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { getPeriodPresets } from "@/lib/period-presets";
import { TierUpgradeGate } from "@/components/tier-upgrade-gate";
import { trackDashboardEvent } from "@/lib/analytics";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/_app/reports/income-statement")({
  component: IncomeStatementPage,
});

function IncomeStatementPage() {
  return (
    <TierUpgradeGate
      feature="reports"
      featureName="Reports"
      capability="report:read"
    >
      <IncomeStatementReport />
    </TierUpgradeGate>
  );
}

function IncomeStatementReport() {
  const { selectedCommunityId } = useCommunity();
  const communityId = selectedCommunityId ?? "";
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  const periodPresets = getPeriodPresets();

  useEffect(() => {
    if (!communityId) return;
    trackDashboardEvent("report_viewed", {
      report_type: "income_statement",
      community_id: communityId,
    });
  }, [communityId]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["income-statement", communityId, from, to],
    queryFn: () => api.reports.incomeStatement(communityId, from, to),
    enabled: !!communityId,
  });

  useEffect(() => {
    if (!communityId || !isError) return;
    trackDashboardEvent("report_load_failed", {
      community_id: communityId,
      failure_type: "api_error",
      report_type: "income_statement",
    });
  }, [communityId, isError]);

  return (
    <PageContainer variant="report">
      <PageHeader
        title="Income Statement"
        description="Review income and expenses over a period."
      />
      <div className="space-y-3">
        <div className="flex items-end gap-4 flex-wrap">
          <DatePicker label="From" value={from} onChange={setFrom} />
          <DatePicker label="To" value={to} onChange={setTo} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {periodPresets.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom(preset.from);
                setTo(preset.to);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Unable to load the income statement. Please try again or adjust the
            date range.
          </AlertDescription>
        </Alert>
      ) : (
        <IncomeStatementCard rows={data?.rows ?? []} isLoading={isLoading} />
      )}
    </PageContainer>
  );
}
