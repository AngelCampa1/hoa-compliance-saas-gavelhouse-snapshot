import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getPageHelpForRoute } from "@boardstack/shared";
import { api } from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getPeriodPresets } from "@/lib/period-presets";
import { HelpCallout } from "@/components/help/HelpCallout";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";
import { TierUpgradeGate } from "@/components/tier-upgrade-gate";
import { trackDashboardEvent } from "@/lib/analytics";
import { reportUserFacingError } from "@/lib/sentry";

export const Route = createFileRoute("/_app/reports/audit-pack")({
  component: AuditPackPage,
});

function AuditPackPage() {
  return (
    <TierUpgradeGate
      feature="audit-pack"
      featureName="Audit pack"
      capability="report:export"
    >
      <AuditPackReport />
    </TierUpgradeGate>
  );
}

function AuditPackReport() {
  const { selectedCommunityId } = useCommunity();
  const communityId = selectedCommunityId ?? "";
  const now = new Date();
  const firstOfYear = new Date(now.getFullYear(), 0, 1)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(firstOfYear);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodPresets = getPeriodPresets();
  const pageHelp = getPageHelpForRoute("/reports/audit-pack");

  async function handleDownload() {
    if (!communityId) return;
    setError(null);
    setIsDownloading(true);
    try {
      await api.reports.downloadAuditPack(communityId, periodStart, periodEnd);
      trackDashboardEvent("audit_pack_downloaded", {
        period_start: periodStart,
        period_end: periodEnd,
        community_id: communityId,
      });
      trackDashboardEvent("report_export_downloaded", {
        community_id: communityId,
        report_type: "audit_pack",
      });
    } catch (err) {
      trackDashboardEvent("audit_pack_download_failed", {
        failure_type: "api_error",
        period_start: periodStart,
        period_end: periodEnd,
        community_id: communityId,
      });
      trackDashboardEvent("report_export_failed", {
        community_id: communityId,
        report_type: "audit_pack",
        failure_type: "api_error",
      });
      setError(
        reportUserFacingError(
          err,
          "We could not download your audit pack. Please try again.",
          { tags: { source: "audit-pack-download" } },
        ),
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <PageContainer variant="form">
      <PageHeader
        title="Audit Pack"
        description="Download your financial reports as a ZIP for board records or your auditor."
      />
      <HelpCallout topic="auditPack" />
      {pageHelp && <PageHelpPanel help={pageHelp} />}

      <Alert>
        <AlertDescription>
          Includes the trial balance, income statement, balance sheet, and
          general ledger for the selected period. Your reports downloaded as a
          ZIP file.
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        <div className="flex items-end gap-4 flex-wrap">
          <DatePicker
            label="Period Start"
            id="period-start"
            value={periodStart}
            onChange={setPeriodStart}
          />
          <DatePicker
            label="Period End"
            id="period-end"
            value={periodEnd}
            onChange={setPeriodEnd}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {periodPresets.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeriodStart(preset.from);
                setPeriodEnd(preset.to);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={() => void handleDownload()}
        disabled={isDownloading || !communityId}
        aria-busy={isDownloading}
      >
        {isDownloading ? "Preparing download…" : "Download Audit Pack"}
      </Button>
    </PageContainer>
  );
}
