import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
import type { RouterContext } from "./__root";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Menu,
  LogOut,
  LayoutDashboard,
  Landmark,
  BookOpen,
  PiggyBank,
  Users,
  Settings,
  BarChart3,
  Building2,
  CreditCard,
  Banknote,
  FileText,
  ClipboardCheck,
  Scale,
  AlertTriangle,
  CalendarDays,
  RefreshCw,
  Layers,
  ChevronDown,
  CircleHelp,
} from "lucide-react";
import { authClient } from "@/lib/auth";
import { api } from "@/lib/api";
import { CommunitySwitcher } from "@/components/community-switcher";
import { CommunityProvider, useCommunity } from "@/lib/community-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { CrmFeedbackWidget } from "@/components/crm-feedback-widget";
import { AiCsSupportWidget } from "@/components/ai-cs-support-widget";
import { BreadcrumbList } from "@/components/ui/breadcrumbs";
import { buildBreadcrumbs } from "@/lib/breadcrumb-config";
import { qk } from "@/lib/query-keys";
import { BrandLogo } from "@/components/brand-logo";
import {
  identifyDashboardUser,
  resetDashboardAnalytics,
  trackDashboardRoute,
} from "@/lib/analytics";
import {
  FEATURE_MINIMUM_TIER,
  GUARANTEE_CONFIG,
  roleCan,
  tierAllowsFeature,
  type BoardRole,
  type RoleCapability,
  type Tier,
  type TierFeature,
} from "@boardstack/shared";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context }: { context: RouterContext }) => {
    if (!context.session) {
      const redirectTarget =
        typeof window === "undefined"
          ? "/dashboard"
          : `${window.location.pathname}${window.location.search}${window.location.hash}`;
      throw redirect({
        to: "/login",
        search: { redirect: redirectTarget },
      });
    }
  },
  component: AppLayout,
});
const trialDurationLabel = `${GUARANTEE_CONFIG.days}-day`;

type NavLink = {
  label: string;
  to: string;
  icon: React.ElementType;
  feature?: TierFeature;
  capability?: RoleCapability;
};
type NavSection = { label: string; icon: React.ElementType; links: NavLink[] };

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Finance",
    icon: Landmark,
    links: [
      { label: "Reserves", to: "/finance/reserves", icon: PiggyBank },
      { label: "Dues", to: "/finance/dues", icon: CreditCard },
      { label: "Journal", to: "/finance/journal", icon: BookOpen },
      { label: "Chart of Accounts", to: "/finance/accounts", icon: FileText },
      {
        label: "Month-End Close",
        to: "/close",
        icon: ClipboardCheck,
        feature: "month-end-close",
      },
    ],
  },
  {
    label: "Banking",
    icon: Banknote,
    links: [
      { label: "Statements", to: "/bank/statements", icon: FileText },
      { label: "Reconcile", to: "/bank/reconcile", icon: RefreshCw },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    links: [
      {
        label: "Balance Sheet",
        to: "/reports/balance-sheet",
        icon: Scale,
        feature: "reports",
        capability: "report:read",
      },
      {
        label: "Income Statement",
        to: "/reports/income-statement",
        icon: BarChart3,
        feature: "reports",
        capability: "report:read",
      },
      {
        label: "Trial Balance",
        to: "/reports/trial-balance",
        icon: Layers,
        feature: "reports",
        capability: "report:read",
      },
      {
        label: "General Ledger",
        to: "/reports/general-ledger",
        icon: BookOpen,
        feature: "reports",
        capability: "report:read",
      },
      {
        label: "Audit Pack",
        to: "/reports/audit-pack",
        icon: FileText,
        feature: "audit-pack",
        capability: "report:export",
      },
    ],
  },
  {
    label: "Governance",
    icon: Building2,
    links: [
      { label: "Homeowners", to: "/governance/homeowners", icon: Users },
      {
        label: "Violations",
        to: "/governance/violations",
        icon: AlertTriangle,
        feature: "governance-workflows",
      },
      {
        label: "Arch Requests",
        to: "/governance/arch-requests",
        icon: ClipboardCheck,
        feature: "governance-workflows",
      },
      {
        label: "Meetings",
        to: "/governance/meetings",
        icon: CalendarDays,
        feature: "governance-workflows",
      },
      {
        label: "Transitions",
        to: "/governance/transitions",
        icon: RefreshCw,
      },
    ],
  },
  {
    label: "Admin",
    icon: Settings,
    links: [
      {
        label: "Portfolio",
        to: "/portfolio",
        icon: Layers,
        feature: "portfolio-rollups",
      },
      { label: "Billing", to: "/billing", icon: CreditCard },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

function getInitials(name: string | null | undefined, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function trialDaysRemaining(trialEndsAt: string): number {
  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

function NavSectionItem({
  section,
  onNavigate,
  currentPath,
  tier,
  role,
}: {
  section: NavSection;
  onNavigate: () => void;
  currentPath: string;
  tier: Tier | null;
  role: BoardRole | null;
}) {
  const SectionIcon = section.icon;
  const visibleLinks = section.links.filter(
    ({ capability }) =>
      capability === undefined || (role !== null && roleCan(role, capability)),
  );
  if (visibleLinks.length === 0) {
    return null;
  }

  const isCurrentSection = visibleLinks.some((link) =>
    currentPath.startsWith(link.to),
  );
  return (
    <Collapsible defaultOpen={isCurrentSection}>
      <CollapsibleTrigger className="group flex min-h-9 w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <SectionIcon className="h-3.5 w-3.5" />
          <span className="truncate">{section.label}</span>
        </span>
        <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-0.5 space-y-0.5">
          {visibleLinks.map(({ label, to, icon: Icon, feature }) => {
            const gated =
              feature !== undefined && !tierAllowsFeature(tier, feature);
            return (
              <li key={to}>
                <Link
                  to={to as Parameters<typeof Link>[0]["to"]}
                  className="flex min-h-9 min-w-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground [&.active]:bg-primary/10 [&.active]:font-medium [&.active]:text-primary"
                  onClick={onNavigate}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                  {gated && (
                    <span
                      className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground"
                      aria-label={`Requires ${FEATURE_MINIMUM_TIER[feature]} plan`}
                    >
                      {FEATURE_MINIMUM_TIER[feature]}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SidebarContent({
  onNavigate,
  currentPath,
  tier,
  role,
}: {
  onNavigate: () => void;
  currentPath: string;
  tier: Tier | null;
  role: BoardRole | null;
}) {
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1 p-3">
      <Link
        to="/dashboard"
        className="mb-1 flex min-h-9 min-w-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground [&.active]:bg-primary/10 [&.active]:font-medium [&.active]:text-primary"
        onClick={onNavigate}
      >
        <LayoutDashboard className="h-4 w-4 shrink-0" />
        <span className="truncate">Dashboard</span>
      </Link>
      <Link
        to="/help"
        search={{ role: undefined }}
        className="mb-1 flex min-h-9 min-w-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground [&.active]:bg-primary/10 [&.active]:font-medium [&.active]:text-primary"
        onClick={onNavigate}
      >
        <CircleHelp className="h-4 w-4 shrink-0" />
        <span className="truncate">Help</span>
      </Link>
      <div className="space-y-3">
        {NAV_SECTIONS.map((section) => (
          <NavSectionItem
            key={section.label}
            section={section}
            onNavigate={onNavigate}
            currentPath={currentPath}
            tier={tier}
            role={role}
          />
        ))}
      </div>
    </nav>
  );
}

function AppLayout() {
  const { data: session } = authClient.useSession();
  const { data: communitiesData, isError: communitiesError } = useQuery({
    queryKey: qk.communities.list(),
    queryFn: () => api.communities.list(),
    enabled: !!session,
  });

  return (
    <CommunityProvider
      initialId={communitiesData?.communities[0]?.community.id ?? null}
    >
      <AppShell
        communitiesData={communitiesData}
        communitiesError={communitiesError}
      />
    </CommunityProvider>
  );
}

function AppShell({
  communitiesData,
  communitiesError,
}: {
  communitiesData: Awaited<ReturnType<typeof api.communities.list>> | undefined;
  communitiesError: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    selectedCommunityId,
    setSelectedCommunityId,
    selectedCommunityTier,
    selectedCommunityRole,
    setSelectedCommunityAccess,
  } = useCommunity();
  const { data: session } = authClient.useSession();
  const communitiesLoading = communitiesData === undefined && !communitiesError;
  const communities = communitiesData?.communities ?? [];

  const currentCommunity =
    communities.find((entry) => entry.community.id === selectedCommunityId)
      ?.community ?? communities[0]?.community;
  const currentMembership = communities.find(
    (entry) => entry.community.id === currentCommunity?.id,
  );

  const { data: billingStatus } = useQuery({
    queryKey: qk.billing.status(currentCommunity?.id ?? ""),
    queryFn: () => api.billing.getStatus(currentCommunity!.id),
    enabled: !!currentCommunity,
  });

  async function handleSignOut() {
    // Clear all cached tenant data before navigating away so a subsequent
    // sign-in on the same device cannot briefly see the previous user's PII.
    queryClient.clear();
    resetDashboardAnalytics();
    await authClient.signOut();
    await navigate({ to: "/login" });
  }

  const user = session?.user;
  const initials = user ? getInitials(user.name, user.email) : "??";

  const trialEndsAt =
    billingStatus?.status === "trialing" ? billingStatus.trialEndsAt : null;
  const daysLeft = trialEndsAt ? trialDaysRemaining(trialEndsAt) : null;
  const isPendingTrial = billingStatus?.status === "pending_trial";
  const isExpired = billingStatus?.status === "expired";

  useEffect(() => {
    setSelectedCommunityAccess({
      role: currentMembership?.role ?? null,
      tier: billingStatus?.tier ?? null,
    });
  }, [
    billingStatus?.tier,
    currentMembership?.role,
    setSelectedCommunityAccess,
  ]);

  useEffect(() => {
    if (!user?.id) return;
    identifyDashboardUser({
      user_id: user.id,
      community_id: currentCommunity?.id,
      role: currentMembership?.role,
      tier: billingStatus?.tier ?? undefined,
    });
  }, [
    billingStatus?.tier,
    currentCommunity?.id,
    currentMembership?.role,
    user?.email,
    user?.id,
  ]);

  useEffect(() => {
    trackDashboardRoute(location.pathname, location.searchStr);
  }, [location.pathname, location.searchStr]);

  useEffect(() => {
    if (communities.length === 0) {
      return;
    }

    const selectedExists =
      selectedCommunityId !== null &&
      communities.some((entry) => entry.community.id === selectedCommunityId);

    if (!selectedExists) {
      setSelectedCommunityId(communities[0]!.community.id);
    }
  }, [communities, selectedCommunityId, setSelectedCommunityId]);

  useEffect(() => {
    if (communitiesData && communities.length === 0) {
      void navigate({ to: "/setup", replace: true });
    }
  }, [communitiesData, communities.length, navigate]);

  useEffect(() => {
    if ((!isPendingTrial && !isExpired) || location.pathname === "/billing") {
      return;
    }
    void navigate({ to: "/billing", replace: true });
  }, [isExpired, isPendingTrial, location.pathname, navigate]);

  // Once the queries resolve we may immediately redirect (to /setup for an
  // empty account, or /billing for a paused trial). Keep the skeleton up while
  // that redirect is in flight so the dashboard never flashes for a frame.
  const isRedirectingToSetup =
    communitiesData !== undefined && communities.length === 0;
  const isRedirectingToBilling =
    (isPendingTrial || isExpired) && location.pathname !== "/billing";
  const showContentSkeleton =
    communitiesLoading || isRedirectingToSetup || isRedirectingToBilling;

  const breadcrumbs = buildBreadcrumbs(location.pathname);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-card overflow-y-auto">
          <div className="flex h-14 items-center border-b px-4 gap-2.5">
            <Link
              to="/dashboard"
              aria-label="Gavelhouse home"
              className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandLogo className="h-9 w-auto" />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <SidebarContent
              currentPath={location.pathname}
              onNavigate={() => {}}
              tier={selectedCommunityTier as Tier | null}
              role={selectedCommunityRole as BoardRole | null}
            />
          </div>
        </aside>

        {/* Mobile sidebar via Sheet */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent id="mobile-nav" side="left" className="w-60 p-0">
            <div className="flex h-14 items-center border-b px-4 gap-2.5">
              <SheetTitle className="sr-only">Gavelhouse</SheetTitle>
              <BrandLogo className="h-9 w-auto" />
            </div>
            <div className="overflow-y-auto py-2">
              <SidebarContent
                currentPath={location.pathname}
                onNavigate={() => setSidebarOpen(false)}
                tier={selectedCommunityTier as Tier | null}
                role={selectedCommunityRole as BoardRole | null}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-14 shrink-0 items-center border-b bg-card px-4 gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Toggle navigation"
              aria-expanded={sidebarOpen}
              aria-controls="mobile-nav"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="flex-1 flex items-center gap-3 min-w-0">
              <CommunitySwitcher
                communities={communitiesData?.communities ?? []}
                isLoading={communitiesLoading}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  aria-label="User menu"
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {user && (
                  <>
                    <div
                      data-ph-mask="true"
                      className="px-2 py-1.5 text-xs text-muted-foreground truncate"
                    >
                      {user.email}
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem asChild>
                  <Link
                    to="/settings"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/help"
                    search={{ role: undefined }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <CircleHelp className="h-4 w-4" />
                    Help
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => void handleSignOut()}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* Breadcrumbs */}
          {breadcrumbs.length > 1 && (
            <div className="border-b bg-card/50 px-6 py-2">
              <BreadcrumbList items={breadcrumbs} />
            </div>
          )}

          {/* Page content */}
          <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-6">
            {daysLeft !== null && (
              <Alert variant="warning" className="mb-6">
                <AlertDescription>
                  You have{" "}
                  <strong>
                    {daysLeft} {daysLeft === 1 ? "day" : "days"}
                  </strong>{" "}
                  left in your trial.{" "}
                  <Link to="/billing" className="underline font-medium">
                    Upgrade now
                  </Link>{" "}
                  to keep access when your trial ends.
                </AlertDescription>
              </Alert>
            )}
            {isPendingTrial && location.pathname === "/billing" && (
              <Alert variant="info" className="mb-6">
                <AlertDescription>
                  Start your {trialDurationLabel} free trial with Scale
                  features. You can choose a plan later.
                </AlertDescription>
              </Alert>
            )}
            {isExpired && location.pathname === "/billing" && (
              <Alert variant="warning" className="mb-6">
                <AlertDescription>
                  Your free trial has ended. Choose a paid plan to restore
                  access.
                </AlertDescription>
              </Alert>
            )}
            {communitiesError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>
                  We could not load your communities. Refresh the page to try
                  again.
                </AlertDescription>
              </Alert>
            ) : showContentSkeleton ? (
              <div className="space-y-4" aria-live="polite" aria-busy="true">
                <span className="sr-only">Loading your community</span>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
      <Toaster position="top-right" />
      <CrmFeedbackWidget />
      <AiCsSupportWidget userId={user?.id} currentPath={location.pathname} />
    </>
  );
}
