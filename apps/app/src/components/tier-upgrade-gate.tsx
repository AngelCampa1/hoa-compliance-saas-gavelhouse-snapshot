import { useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  FEATURE_MINIMUM_TIER,
  roleCan,
  tierAllowsFeature,
  type BoardRole,
  type RoleCapability,
  type Tier,
  type TierFeature,
} from "@boardstack/shared";
import { useCommunity } from "@/lib/community-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { trackDashboardEvent } from "@/lib/analytics";

type TierUpgradeGateProps = {
  feature: TierFeature;
  featureName: string;
  capability?: RoleCapability;
  children: ReactNode;
};

function titleCaseTier(tier: Tier): string {
  return tier[0]!.toUpperCase() + tier.slice(1);
}

export function TierUpgradeGate({
  feature,
  featureName,
  capability,
  children,
}: TierUpgradeGateProps) {
  const { selectedCommunityRole, selectedCommunityTier } = useCommunity();
  const missingRoleCapability =
    capability !== undefined &&
    selectedCommunityRole !== null &&
    !roleCan(selectedCommunityRole as BoardRole, capability);
  const missingTier =
    selectedCommunityTier !== null &&
    !tierAllowsFeature(selectedCommunityTier as Tier, feature);

  useEffect(() => {
    if (selectedCommunityTier === null) return;
    if (capability !== undefined && selectedCommunityRole === null) return;

    if (missingRoleCapability) {
      trackDashboardEvent("feature_access_denied", {
        capability,
        feature,
        reason: "role",
        role: selectedCommunityRole,
        tier: selectedCommunityTier,
      });
      return;
    }

    if (missingTier) {
      trackDashboardEvent("feature_access_denied", {
        feature,
        reason: "tier",
        tier: selectedCommunityTier,
      });
    }
  }, [
    capability,
    feature,
    missingRoleCapability,
    missingTier,
    selectedCommunityRole,
    selectedCommunityTier,
  ]);

  if (
    selectedCommunityTier === null ||
    (capability !== undefined && selectedCommunityRole === null)
  ) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Checking your plan...</p>
      </PageContainer>
    );
  }

  const minimumTier = FEATURE_MINIMUM_TIER[feature];

  if (missingRoleCapability) {
    return (
      <PageContainer>
        <PageHeader
          title={`${featureName} access denied`}
          description={`Your board role does not include access to ${featureName.toLowerCase()}.`}
        />
        <Alert variant="info">
          <AlertDescription>
            Ask an owner or admin to change your role if you need access.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (tierAllowsFeature(selectedCommunityTier as Tier, feature)) {
    return <>{children}</>;
  }

  const minimumLabel = titleCaseTier(minimumTier);
  const verb = featureName.endsWith("s") ? "require" : "requires";

  return (
    <PageContainer>
      <PageHeader
        title={`${featureName} ${verb} ${minimumLabel}`}
        description={`Upgrade this community to ${minimumLabel} to use ${featureName.toLowerCase()}.`}
        actions={
          <Button asChild>
            <Link to="/billing">Upgrade plan</Link>
          </Button>
        }
      />
      <Alert variant="info">
        <AlertDescription>
          Your plan does not include this feature. The menu shows which plan you
          need.
        </AlertDescription>
      </Alert>
    </PageContainer>
  );
}
