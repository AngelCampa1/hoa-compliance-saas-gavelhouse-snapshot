import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth";
import { api, type CommunityUsageResponse } from "@/lib/api";
import { toast } from "sonner";
import { useCommunity } from "@/lib/community-context";
import { qk } from "@/lib/query-keys";
import {
  getDiscountedDisplayPrice,
  GUARANTEE_CONFIG,
  LIMITED_SUBSCRIPTION_PROMO,
  PRICING_CONFIG,
  PRICING_TIERS,
  TIER_LIMITS,
  tierCoversUsage,
  type Tier,
  type TierFeature,
} from "@boardstack/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { trackDashboardEvent } from "@/lib/analytics";
import { reportUserFacingError } from "@/lib/sentry";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CancelReasonModal } from "@/components/billing/CancelReasonModal";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

const STATUS_LABELS: Record<string, string> = {
  pending_trial: "Setup required",
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Cancelled",
  expired: "Expired",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "info" | "success" | "warning" | "destructive"
> = {
  pending_trial: "warning",
  trialing: "info",
  active: "success",
  past_due: "destructive",
  canceled: "warning",
  expired: "warning",
};

const FEATURE_LABEL: Record<TierFeature, string> = {
  "owner-operations": "Owner-portal operations",
  "governance-workflows": "Governance workflows",
  reports: "Reports access",
  "month-end-close": "Month-end close",
  "audit-pack": "Audit Pack export",
  "portfolio-rollups": "Portfolio rollups",
};
const trialDurationLabel = `${GUARANTEE_CONFIG.days}-day`;

function titleCaseTier(tier: Tier): string {
  return tier[0]!.toUpperCase() + tier.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function trialDaysRemaining(trialEndsAt: string): number {
  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

function parseSelectedCycle(value: string | null): "monthly" | "annual" {
  return value === "monthly" ? "monthly" : "annual";
}

function formatOfferPrice(tier: Tier, cycle: "monthly" | "annual"): string {
  const price = getDiscountedDisplayPrice(tier, cycle);
  return cycle === "annual" ? `${price} billed annually` : price;
}

const CHECKOUT_DISCLOSURE = `Limited offer: 80% off your first year. Use ${LIMITED_SUBSCRIPTION_PROMO.monthly.code} monthly or ${LIMITED_SUBSCRIPTION_PROMO.annual.code} yearly. ${GUARANTEE_CONFIG.label}.`;

type BillingPeriod = "monthly" | "annual";
type PricingSelectionType = "recommended" | "override" | "direct";

type LossSummary = {
  homesOver: number;
  seatsOver: number;
  missingFeatures: TierFeature[];
};

function summarizeLossAt(
  tier: Tier,
  usage: CommunityUsageResponse,
): LossSummary {
  const limits = TIER_LIMITS[tier];
  const homesOver =
    limits.homes !== null && usage.homes > limits.homes
      ? usage.homes - limits.homes
      : 0;
  const totalSeats = usage.boardUsers + usage.pendingInvites;
  const seatsOver =
    limits.boardUsers !== null && totalSeats > limits.boardUsers
      ? totalSeats - limits.boardUsers
      : 0;
  const missingFeatures = usage.featuresUsed.filter((feature) => {
    return !tierCoversUsage(tier, {
      homes: 0,
      boardUsers: 0,
      pendingInvites: 0,
      featuresUsed: [feature],
    });
  });
  return { homesOver, seatsOver, missingFeatures };
}

function lossSummaryToParts(loss: LossSummary): string[] {
  const parts: string[] = [];
  if (loss.homesOver > 0) {
    parts.push(`${loss.homesOver} homes over cap`);
  }
  if (loss.seatsOver > 0) {
    parts.push(`${loss.seatsOver} board seats over cap`);
  }
  for (const feature of loss.missingFeatures) {
    parts.push(FEATURE_LABEL[feature]);
  }
  return parts;
}

function BillingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { selectedCommunityId } = useCommunity();
  const { data: communitiesData, isError } = useQuery({
    queryKey: qk.communities.list(),
    queryFn: () => api.communities.list(),
    enabled: !!session,
  });
  const [cancelOpen, setCancelOpen] = useState(false);

  const selectedMembership =
    communitiesData?.communities.find(
      (c) => c.community.id === selectedCommunityId,
    ) ?? communitiesData?.communities[0];
  const firstCommunity = selectedMembership?.community;
  const canManagePlan =
    selectedMembership?.role === "owner" ||
    selectedMembership?.role === "admin";
  const search = new URLSearchParams(window.location.search);
  const hasSuccessfulCheckoutReturn = search.get("checkout") === "success";
  const [selectedCycle, setSelectedCycle] = useState<"monthly" | "annual">(() =>
    parseSelectedCycle(search.get("cycle")),
  );
  const trackedPricingViewKeyRef = useRef<string | null>(null);

  const { data: billingStatus, isLoading: billingLoading } = useQuery({
    queryKey: qk.billing.status(firstCommunity?.id ?? ""),
    queryFn: () => api.billing.getStatus(firstCommunity!.id),
    enabled: !!firstCommunity,
    refetchInterval: hasSuccessfulCheckoutReturn ? 2000 : false,
  });

  const { data: usage, isError: usageError } = useQuery({
    queryKey: ["community-usage", firstCommunity?.id],
    queryFn: () => api.communities.usage(firstCommunity!.id),
    enabled: !!firstCommunity,
  });

  const isAwaitingActivation =
    hasSuccessfulCheckoutReturn &&
    (billingStatus?.status === "trialing" ||
      billingStatus?.status === "active" ||
      billingStatus?.status === "expired");

  const startTrialMutation = useMutation({
    mutationFn: async () => {
      if (!firstCommunity || billingStatus?.status !== "pending_trial") {
        throw new Error("Cannot start trial from current state");
      }
      return api.billing.startTrial({ communityId: firstCommunity.id });
    },
    onSuccess: (nextStatus) => {
      if (firstCommunity) {
        queryClient.setQueryData(
          qk.billing.status(firstCommunity.id),
          nextStatus,
        );
      }
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not start your trial. Please try again.",
          { tags: { source: "billing-trial" } },
        ),
      );
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (tier: string) => {
      if (!firstCommunity) throw new Error("No community selected");
      const status = billingStatus?.status;
      if (status !== "trialing" && status !== "expired") {
        throw new Error("Cannot checkout from current billing state");
      }
      const cycle = selectedCycle;
      const { url } = await api.billing.checkout({
        communityId: firstCommunity.id,
        tier,
        cycle,
        successUrl: `${window.location.origin}/billing?checkout=success`,
        cancelUrl: `${window.location.origin}/billing`,
      });
      return { cycle, tier, url };
    },
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: (err, tier) => {
      trackDashboardEvent("billing_checkout_failed", {
        billing_period: selectedCycle,
        community_id: firstCommunity?.id,
        failure_type: "api_error",
        tier,
      });
      toast.error(
        reportUserFacingError(
          err,
          "We could not start your checkout. Please try again.",
          { tags: { source: "billing-checkout" } },
        ),
      );
    },
  });

  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      if (!firstCommunity) throw new Error("No community selected");
      const { url } = await api.billing.portal(
        firstCommunity.id,
        `${window.location.origin}/billing`,
      );
      return url;
    },
    onSuccess: (url) => {
      if (url) window.location.href = url;
    },
    onError: (err) => {
      if (firstCommunity) {
        trackDashboardEvent("billing_portal_failed", {
          community_id: firstCommunity.id,
          failure_type: "api_error",
        });
      }
      toast.error(
        reportUserFacingError(
          err,
          "We could not open your billing portal. Please try again.",
          { tags: { source: "billing-portal" } },
        ),
      );
    },
  });

  function trackPricingSelection(
    tier: string,
    selectionType: PricingSelectionType,
    billingPeriod: BillingPeriod,
  ) {
    if (!firstCommunity || !billingStatus) return;

    const properties = {
      billing_period: billingPeriod,
      billing_status: billingStatus.status,
      community_id: firstCommunity.id,
      ...(usage ? { recommended_tier: usage.recommendedTier } : {}),
      selection_type: selectionType,
      source: "billing_page",
      tier,
    };

    trackDashboardEvent("pricing_tier_selected", properties);
  }

  function handlePickTier(
    tier: string,
    selectionType: PricingSelectionType = recommendedTier === tier
      ? "recommended"
      : "direct",
  ) {
    if (!billingStatus) return;
    if (billingStatus.status === "pending_trial") {
      startTrialMutation.mutate();
      return;
    }
    trackPricingSelection(tier, selectionType, selectedCycle);
    checkoutMutation.mutate(tier);
  }

  function handleCycleChange(nextCycle: "monthly" | "annual") {
    if (selectedCycle === nextCycle) return;
    setSelectedCycle(nextCycle);
    if (firstCommunity) {
      trackDashboardEvent("billing_cycle_changed", {
        billing_period: nextCycle,
        community_id: firstCommunity.id,
        source: "billing_page",
      });
    }
  }

  const isPendingTrial = billingStatus?.status === "pending_trial";
  const isTrialing = billingStatus?.status === "trialing";
  const isExpired = billingStatus?.status === "expired";
  const showsPlanPicker = isPendingTrial || isTrialing || isExpired;
  const showsManagementState =
    billingStatus !== undefined && !showsPlanPicker && !billingLoading;
  const canCancelSubscription =
    billingStatus !== undefined &&
    canManagePlan &&
    (["active", "past_due"].includes(billingStatus.status) ||
      (billingStatus.status === "trialing" &&
        billingStatus.currentPeriodEnd !== null)) &&
    !billingStatus.cancelAtPeriodEnd;
  const canManageBilling =
    billingStatus !== undefined &&
    canManagePlan &&
    ["active", "past_due"].includes(billingStatus.status);
  const trialEndsAt =
    billingStatus?.status === "trialing" ? billingStatus.trialEndsAt : null;
  const daysLeft = trialEndsAt ? trialDaysRemaining(trialEndsAt) : null;
  const effectiveCycle = showsPlanPicker
    ? selectedCycle
    : (billingStatus?.cycle ?? null);
  const cycleLabel = selectedCycle === "annual" ? "annual" : "monthly";
  const canAddPaymentMethod =
    billingStatus?.status === "trialing" &&
    billingStatus.currentPeriodEnd === null;

  const recommendedTier = usage?.recommendedTier;

  useEffect(() => {
    if (!showsPlanPicker || isPendingTrial) return;
    if (!firstCommunity || !billingStatus || !usage) return;

    const viewKey = [
      firstCommunity.id,
      billingStatus.status,
      billingStatus.tier,
      usage.recommendedTier,
      usage.homes,
      usage.boardUsers,
      usage.pendingInvites,
      usage.featuresUsed.length,
    ].join(":");
    if (trackedPricingViewKeyRef.current === viewKey) return;
    trackedPricingViewKeyRef.current = viewKey;

    trackDashboardEvent("pricing_viewed", {
      billing_status: billingStatus.status,
      community_id: firstCommunity.id,
      current_tier: billingStatus.tier,
      features_used_count: usage.featuresUsed.length,
      homes: usage.homes,
      board_users: usage.boardUsers,
      pending_invites: usage.pendingInvites,
      recommended_tier: usage.recommendedTier,
      source: "billing_page",
    });
  }, [billingStatus, firstCommunity, isPendingTrial, showsPlanPicker, usage]);

  useEffect(() => {
    if (
      hasSuccessfulCheckoutReturn &&
      billingStatus &&
      billingStatus.status !== "pending_trial" &&
      billingStatus.status !== "expired"
    ) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [billingStatus, hasSuccessfulCheckoutReturn, navigate]);

  const planPickerHeading = useMemo(() => {
    if (isExpired) return "Restart your plan";
    if (isTrialing) return "Pick a plan to keep access after your trial";
    return "Start your Scale trial";
  }, [isExpired, isTrialing]);

  const planPickerDescription = useMemo(() => {
    if (isExpired) {
      return `Pick ${
        cycleLabel === "annual" ? "an" : "a"
      } ${cycleLabel} plan and add billing to restore access immediately.`;
    }
    if (isTrialing) {
      return `Scale features are on during your ${trialDurationLabel} trial. Pick a plan when you are ready. We will tell you if a cheaper plan fits your usage.`;
    }
    if (isPendingTrial) {
      return `You do not need to pick a plan now. Start your ${trialDurationLabel} free trial with Scale features on, then choose the right plan later.`;
    }
    return "";
  }, [cycleLabel, isExpired, isPendingTrial, isTrialing]);

  return (
    <PageContainer>
      <PageHeader
        title="Billing"
        description="Manage the current community plan, trial, and subscription status."
      />

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>
            {showsPlanPicker ? planPickerHeading : "Billing overview"}
          </CardTitle>
          <CardDescription>
            {showsPlanPicker
              ? planPickerDescription
              : "Review this community's plan. Cancel it here if you need to."}
          </CardDescription>
          {isAwaitingActivation && (
            <p className="text-sm text-muted-foreground">
              Stripe checkout is complete. Finalizing your billing setup now.
            </p>
          )}
        </CardHeader>
      </Card>

      {!firstCommunity && isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            We could not load your billing details. Refresh the page to try
            again.
          </AlertDescription>
        </Alert>
      )}

      {firstCommunity && (
        <Card>
          <CardHeader>
            <CardTitle>Your plan</CardTitle>
            <CardDescription>
              Active plan for {firstCommunity.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {billingLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : billingStatus ? (
              <dl className="space-y-2 text-sm">
                <div className="flex items-center gap-3">
                  <dt className="text-muted-foreground w-28 shrink-0">Tier</dt>
                  <dd className="font-medium capitalize">
                    {billingStatus.tier}
                  </dd>
                </div>
                <div className="flex items-center gap-3">
                  <dt className="text-muted-foreground w-28 shrink-0">
                    Status
                  </dt>
                  <dd>
                    <Badge
                      variant={
                        STATUS_VARIANTS[billingStatus.status] ?? "neutral"
                      }
                    >
                      {STATUS_LABELS[billingStatus.status] ??
                        billingStatus.status}
                    </Badge>
                  </dd>
                </div>
                {isPendingTrial && (
                  <div className="flex items-center gap-3">
                    <dt className="text-muted-foreground w-28 shrink-0">
                      Next step
                    </dt>
                    <dd>Start the Scale trial and choose a plan later.</dd>
                  </div>
                )}
                {isExpired && (
                  <div className="flex items-center gap-3">
                    <dt className="text-muted-foreground w-28 shrink-0">
                      Next step
                    </dt>
                    <dd>Add billing to restore access.</dd>
                  </div>
                )}
                {billingStatus.cycle && (
                  <div className="flex items-center gap-3">
                    <dt className="text-muted-foreground w-28 shrink-0">
                      Billing
                    </dt>
                    <dd className="capitalize">{billingStatus.cycle}</dd>
                  </div>
                )}
                {billingStatus.status === "trialing" &&
                  daysLeft !== null &&
                  trialEndsAt && (
                    <div className="flex items-center gap-3">
                      <dt className="text-muted-foreground w-28 shrink-0">
                        Trial ends
                      </dt>
                      <dd>
                        {formatDate(trialEndsAt)}{" "}
                        <span className="text-muted-foreground">
                          ({daysLeft} {daysLeft === 1 ? "day" : "days"} left)
                        </span>
                      </dd>
                    </div>
                  )}
                {billingStatus.status === "trialing" &&
                  billingStatus.currentPeriodEnd === null && (
                    <div className="flex items-center gap-3">
                      <dt className="text-muted-foreground w-28 shrink-0">
                        Billing
                      </dt>
                      <dd>
                        Add a payment method before the trial ends to keep
                        access.
                      </dd>
                    </div>
                  )}
                {billingStatus.currentPeriodEnd &&
                  billingStatus.status === "active" && (
                    <div className="flex items-center gap-3">
                      <dt className="text-muted-foreground w-28 shrink-0">
                        Renews
                      </dt>
                      <dd>{formatDate(billingStatus.currentPeriodEnd)}</dd>
                    </div>
                  )}
                {billingStatus.cancelAtPeriodEnd &&
                  billingStatus.currentPeriodEnd && (
                    <div className="flex items-center gap-3">
                      <dt className="text-muted-foreground w-28 shrink-0">
                        Access ends
                      </dt>
                      <dd className="text-destructive">
                        {formatDate(billingStatus.currentPeriodEnd)} (cancelled)
                      </dd>
                    </div>
                  )}
              </dl>
            ) : null}
          </CardContent>
        </Card>
      )}

      {isPendingTrial && firstCommunity && (
        <Card>
          <CardHeader>
            <CardTitle>Scale feature trial</CardTitle>
            <CardDescription>
              Scale features are on during the trial. Pick a plan when you are
              ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              onClick={() => startTrialMutation.mutate()}
              disabled={startTrialMutation.isPending}
            >
              {startTrialMutation.isPending ? "Starting…" : "Start free trial"}
            </Button>
          </CardContent>
        </Card>
      )}

      {showsPlanPicker && !isPendingTrial && (
        <>
          <div
            className="inline-flex w-fit rounded-full border bg-background p-1"
            aria-label="Billing cycle"
          >
            <Button
              type="button"
              size="sm"
              variant={selectedCycle === "monthly" ? "default" : "ghost"}
              onClick={() => handleCycleChange("monthly")}
            >
              {PRICING_CONFIG.monthlyToggleLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectedCycle === "annual" ? "default" : "ghost"}
              onClick={() => handleCycleChange("annual")}
            >
              {PRICING_CONFIG.annualToggleLabel}
            </Button>
          </div>
          {usageError && (
            <p className="text-sm text-muted-foreground">
              We could not load your usage. Plan suggestions may be incomplete.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PRICING_TIERS.map((tier) => {
              const limits = TIER_LIMITS[tier.slug];
              const loss = usage
                ? summarizeLossAt(tier.slug, usage)
                : { homesOver: 0, seatsOver: 0, missingFeatures: [] };
              const lossParts = lossSummaryToParts(loss);
              const exceedsTier = lossParts.length > 0;
              const isRecommended =
                usage !== undefined && recommendedTier === tier.slug;
              const showRecommendCta =
                exceedsTier &&
                recommendedTier !== undefined &&
                recommendedTier !== tier.slug;
              const cycleNoun = isExpired
                ? "Restore access"
                : "Switch to this plan";

              return (
                <Card
                  key={tier.slug}
                  className={
                    isRecommended || tier.highlighted
                      ? "border-primary"
                      : undefined
                  }
                  data-testid={`plan-card-${tier.slug}`}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>{tier.name}</CardTitle>
                      {isRecommended && (
                        <Badge variant="success">Recommended</Badge>
                      )}
                    </div>
                    <CardDescription>
                      {effectiveCycle === "annual"
                        ? formatOfferPrice(tier.slug, "annual")
                        : formatOfferPrice(tier.slug, "monthly")}
                    </CardDescription>
                    <p className="text-xs text-muted-foreground">
                      {effectiveCycle === "annual"
                        ? formatOfferPrice(tier.slug, "monthly")
                        : formatOfferPrice(tier.slug, "annual")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {tier.whoItsFor}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tier.outcome}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        <span className="font-medium text-foreground">
                          Homes:
                        </span>{" "}
                        {limits.homes === null
                          ? "Unlimited"
                          : `Up to ${limits.homes}`}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">
                          Board users:
                        </span>{" "}
                        {limits.boardUsers === null
                          ? "Unlimited"
                          : `Up to ${limits.boardUsers}`}
                      </p>
                    </div>
                    {exceedsTier && (
                      <div
                        className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
                        data-testid={`plan-card-loss-${tier.slug}`}
                      >
                        <p className="font-medium">
                          You&apos;d lose access to:
                        </p>
                        <ul className="mt-1 list-disc pl-4 space-y-0.5">
                          {lossParts.map((part) => (
                            <li key={part}>{part}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {showRecommendCta ? (
                      <div className="space-y-2">
                        <Button
                          className="w-full"
                          onClick={() =>
                            handlePickTier(recommendedTier!, "recommended")
                          }
                          disabled={
                            startTrialMutation.isPending ||
                            checkoutMutation.isPending
                          }
                          data-testid={`plan-card-use-recommended-${tier.slug}`}
                        >
                          Use {titleCaseTier(recommendedTier!)} instead
                          (recommended)
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => handlePickTier(tier.slug, "override")}
                          disabled={
                            startTrialMutation.isPending ||
                            checkoutMutation.isPending
                          }
                          data-testid={`plan-card-continue-${tier.slug}`}
                        >
                          Continue with {tier.name}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        className="w-full"
                        variant={
                          isRecommended || tier.highlighted
                            ? "default"
                            : "outline"
                        }
                        onClick={() => handlePickTier(tier.slug)}
                        disabled={
                          startTrialMutation.isPending ||
                          checkoutMutation.isPending
                        }
                        data-testid={`plan-card-confirm-${tier.slug}`}
                      >
                        {cycleNoun}
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {CHECKOUT_DISCLOSURE}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            Managing many communities? Ask about Portfolio on the contact page.
          </p>
        </>
      )}
      {firstCommunity && canAddPaymentMethod && billingStatus && (
        <div className="pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkoutMutation.mutate(billingStatus.tier)}
            disabled={checkoutMutation.isPending}
          >
            {checkoutMutation.isPending ? "Loading…" : "Add payment method"}
          </Button>
        </div>
      )}
      {firstCommunity &&
        showsManagementState &&
        (canManageBilling || canCancelSubscription) && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {canManageBilling && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => billingPortalMutation.mutate()}
                disabled={billingPortalMutation.isPending}
              >
                {billingPortalMutation.isPending
                  ? "Loading…"
                  : "Manage billing"}
              </Button>
            )}
            {canCancelSubscription && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelOpen(true)}
              >
                Cancel subscription
              </Button>
            )}
            <CancelReasonModal
              communityId={firstCommunity.id}
              open={cancelOpen}
              onClose={() => setCancelOpen(false)}
              accessEndsAt={billingStatus?.currentPeriodEnd ?? null}
            />
          </div>
        )}
    </PageContainer>
  );
}
