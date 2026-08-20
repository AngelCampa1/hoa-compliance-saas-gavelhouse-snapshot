import type { BreadcrumbItem } from "@/components/ui/breadcrumbs";

const ROUTE_LABELS: Record<string, string> = {"/dashboard": "Dashboard","/help": "Help","/finance": "Finance","/finance/reserves": "Reserves","/finance/dues": "Dues","/finance/journal": "Journal","/finance/accounts": "Chart of Accounts","/close": "Month-End Close","/bank": "Banking","/bank/statements": "Statements","/bank/reconcile": "Reconcile","/reports": "Reports","/reports/balance-sheet": "Balance Sheet","/reports/income-statement": "Income Statement","/reports/trial-balance": "Trial Balance","/reports/general-ledger": "General Ledger","/reports/audit-pack": "Audit Pack","/governance": "Governance","/governance/homeowners": "Homeowners","/governance/violations": "Violations","/governance/arch-requests": "Arch Requests","/governance/meetings": "Meetings","/governance/transitions": "Transitions","/portfolio": "Portfolio","/billing": "Billing","/settings": "Settings",
};

export function buildBreadcrumbs(
  pathname: string,
  routeLabels: Record<string, string> = ROUTE_LABELS,
): BreadcrumbItem[] {
  const label = routeLabels[pathname];
  if (!label) return [];

  const segments = pathname.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [];

  if (segments.length >= 2) {
    const parentPath = `/${segments[0]}`;
    const parentLabel = routeLabels[parentPath];
    if (parentLabel !== undefined) {
      items.push({ label: parentLabel, href: parentPath });
    }
  }
  items.push({ label, href: pathname });
  return items;
}
