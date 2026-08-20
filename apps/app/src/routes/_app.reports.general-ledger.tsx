import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { LedgerFilters } from "@/components/reports/LedgerFilters";
import { formatCents } from "@/components/reports/TrialBalanceTable";
import { useCommunity } from "@/lib/community-context";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";
import { getPeriodPresets } from "@/lib/period-presets";
import { FileText } from "lucide-react";
import { TierUpgradeGate } from "@/components/tier-upgrade-gate";
import { trackDashboardEvent } from "@/lib/analytics";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/_app/reports/general-ledger")({
  component: GeneralLedgerPage,
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function GeneralLedgerPage() {
  return (
    <TierUpgradeGate
      feature="reports"
      featureName="Reports"
      capability="report:read"
    >
      <GeneralLedgerReport />
    </TierUpgradeGate>
  );
}

function GeneralLedgerReport() {
  const { selectedCommunityId } = useCommunity();
  const communityId = selectedCommunityId ?? "";
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [fundType, setFundType] = useState("");

  const periodPresets = getPeriodPresets();

  useEffect(() => {
    if (!communityId) return;
    trackDashboardEvent("report_viewed", {
      report_type: "general_ledger",
      community_id: communityId,
    });
  }, [communityId]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["general-ledger", communityId, from, to, accountId, fundType],
    queryFn: () =>
      api.reports.generalLedger(
        communityId,
        from,
        to,
        accountId || undefined,
        fundType || undefined,
      ),
    enabled: !!communityId,
  });

  const rows = data?.rows ?? [];

  useEffect(() => {
    if (!communityId || !isError) return;
    trackDashboardEvent("report_load_failed", {
      community_id: communityId,
      failure_type: "api_error",
      report_type: "general_ledger",
    });
  }, [communityId, isError]);

  function trackFilterChange(filterType: string) {
    if (!communityId) return;
    trackDashboardEvent("report_filter_changed", {
      community_id: communityId,
      filter_type: filterType,
      report_type: "general_ledger",
    });
  }

  return (
    <PageContainer variant="report">
      <PageHeader
        title="General Ledger"
        description="Full transaction history by account."
      />
      <div className="space-y-3">
        <LedgerFilters
          from={from}
          to={to}
          onFromChange={(value) => {
            setFrom(value);
            trackFilterChange("period_start");
          }}
          onToChange={(value) => {
            setTo(value);
            trackFilterChange("period_end");
          }}
          accountId={accountId}
          onAccountIdChange={(value) => {
            setAccountId(value);
            trackFilterChange("account");
          }}
          fundType={fundType}
          onFundTypeChange={(value) => {
            setFundType(value);
            trackFilterChange("fund_type");
          }}
        />
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
            Unable to load the general ledger. Please try again or adjust the
            filters.
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No transactions found"
          description="Adjust the date range or filters to see ledger entries."
        />
      ) : (
        <ResponsiveDataList
          ariaLabel="General ledger"
          rows={rows}
          getRowKey={(row) => row.id}
          columns={[
            {
              key: "date",
              header: "Date",
              render: (row) => formatDate(row.entryDate),
            },
            {
              key: "memo",
              header: "Memo",
              primary: true,
              render: (row) => row.memo,
            },
            {
              key: "code",
              header: "Code",
              render: (row) => (
                <span className="font-mono">{row.accountCode}</span>
              ),
            },
            {
              key: "account",
              header: "Account",
              render: (row) => row.accountName,
            },
            {
              key: "fund",
              header: "Fund",
              render: (row) => (
                <span className="capitalize">{row.fundType}</span>
              ),
            },
            {
              key: "debit",
              header: "Debit",
              align: "right",
              render: (row) => formatCents(row.debitCents),
            },
            {
              key: "credit",
              header: "Credit",
              align: "right",
              render: (row) => formatCents(row.creditCents),
            },
            {
              key: "balance",
              header: "Balance",
              align: "right",
              render: (row) => formatCents(row.runningBalance),
            },
          ]}
        />
      )}
    </PageContainer>
  );
}
