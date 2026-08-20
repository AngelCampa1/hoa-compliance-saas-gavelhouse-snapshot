import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getPageHelpForRoute } from "@boardstack/shared";
import { PageHeader } from "@/components/ui/page-header";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TierUpgradeGate } from "@/components/tier-upgrade-gate";

export const Route = createFileRoute("/_app/reports/")({
  component: ReportsIndexPage,
});

const REPORTS = [
  {
    label: "Trial Balance",
    to: "/reports/trial-balance" as const,
    description: "Verify debits equal credits for a given date.",
    actionLabel: "Review balance",
    tooltip:
      "A report listing all account balances to verify total debits equal total credits.",
  },
  {
    label: "Balance Sheet",
    to: "/reports/balance-sheet" as const,
    description: "View assets, liabilities, and equity at a point in time.",
    actionLabel: "View position",
    tooltip:
      "A snapshot of what the association owns, owes, and has left over on a specific date.",
  },
  {
    label: "Income Statement",
    to: "/reports/income-statement" as const,
    description: "Review income and expenses over a period.",
    actionLabel: "Review activity",
    tooltip:
      "A report showing money received and money spent during the selected period.",
  },
  {
    label: "General Ledger",
    to: "/reports/general-ledger" as const,
    description: "Full transaction history by account.",
    actionLabel: "Open ledger",
    tooltip:
      "A complete chronological record of every transaction in your accounts.",
  },
  {
    label: "Audit Pack",
    to: "/reports/audit-pack" as const,
    description:
      "Download your financial reports as a ZIP for board records or your auditor.",
    actionLabel: "Download pack",
    tooltip:
      "Get a ZIP file with your main financial reports. Share it with your board or auditor.",
  },
];

function ReportsIndexPage() {
  return (
    <TierUpgradeGate
      feature="reports"
      featureName="Reports"
      capability="report:read"
    >
      <ReportsIndexContent />
    </TierUpgradeGate>
  );
}

function ReportsIndexContent() {
  const navigate = useNavigate();
  const pageHelp = getPageHelpForRoute("/reports");

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          title="Reports"
          description="Generate financial reports for your community."
        />
        {pageHelp && <PageHelpPanel help={pageHelp} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {REPORTS.map(({ label, to, description, tooltip, actionLabel }) => (
            <Card key={to}>
              <CardHeader>
                <CardTitle className="text-base">
                  {tooltip ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted">
                          {label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {tooltip}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    label
                  )}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void navigate({ to })}
                >
                  {actionLabel}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
