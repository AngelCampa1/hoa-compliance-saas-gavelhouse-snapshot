import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { RollupCard } from "@/components/portfolio/RollupCard";
import { formatCents } from "@/components/reports/TrialBalanceTable";
import { authClient } from "@/lib/auth";
import { ConfirmActionDialog } from "@/components/help/ConfirmActionDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TierUpgradeGate } from "@/components/tier-upgrade-gate";
import { SummaryStat, SummaryStatGrid } from "@/components/ui/stat-card";
import { trackDashboardEvent } from "@/lib/analytics";
import { toast } from "sonner";
import { reportUserFacingError } from "@/lib/sentry";

export const Route = createFileRoute("/_app/portfolio/")({
  component: PortfolioIndexPage,
});

type PortfolioItem = {
  id: string;
  name: string;
};

// Portfolio rollups are a Portfolio-tier feature. Wrap the page in the shared
// TierUpgradeGate so sub-Portfolio users see the same tasteful upgrade screen
// as every other gated feature, rather than loading the create form and only
// learning they cannot use it after submitting and hitting a raw
// "upgrade_required" API error toast.
function PortfolioIndexPage() {
  return (
    <TierUpgradeGate
      feature="portfolio-rollups"
      featureName="Portfolio rollups"
    >
      <PortfolioIndexContent />
    </TierUpgradeGate>
  );
}

function PortfolioIndexContent() {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(
    null,
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const { data: portfoliosData, isError: portfoliosError } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => api.portfolio.list(),
    enabled: !!session,
  });

  const portfolios: PortfolioItem[] = portfoliosData?.portfolios ?? [];
  const { data: communitiesData, isError: communitiesError } = useQuery({
    queryKey: ["communities"],
    queryFn: () => api.communities.list(),
    enabled: !!session,
  });
  const communities =
    communitiesData?.communities.map((row) => row.community) ?? [];
  const selectedPortfolio = portfolios.find(
    (portfolio) => portfolio.id === selectedPortfolioId,
  );

  const {
    data: rollupData,
    isLoading: rollupLoading,
    isError: rollupError,
  } = useQuery({
    queryKey: ["portfolio-rollup", selectedPortfolioId],
    queryFn: () => api.portfolio.getRollup(selectedPortfolioId!),
    enabled: !!selectedPortfolioId,
  });

  const rollups = rollupData?.communities ?? [];
  const overdueTotal = rollups.reduce(
    (total, rollup) => total + rollup.overdueAssessmentsCents,
    0,
  );
  const knownReserveRollups = rollups.filter(
    (rollup) => rollup.reservePctFunded !== null,
  );
  const averageReserve =
    knownReserveRollups.length > 0
      ? knownReserveRollups.reduce(
          (total, rollup) => total + (rollup.reservePctFunded ?? 0),
          0,
        ) / knownReserveRollups.length
      : null;
  const compliantCount = rollups.filter(
    (rollup) => rollup.fannieMaeCompliant === true,
  ).length;

  useEffect(() => {
    if (!selectedPortfolioId || !rollupData) return;
    trackDashboardEvent("portfolio_rollup_viewed", {
      portfolio_id: selectedPortfolioId,
      community_count: rollupData.communities.length,
    });
  }, [selectedPortfolioId, rollupData]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const portfolioName = newName.trim();
    if (!portfolioName) return;
    setIsCreating(true);
    // Snapshot the current list so we can roll back the optimistic update on failure.
    const previousPortfolios = queryClient.getQueryData<{
      portfolios: PortfolioItem[];
    }>(["portfolios"]);
    try {
      const result = await api.portfolio.create(portfolioName);
      queryClient.setQueryData<{ portfolios: PortfolioItem[] }>(
        ["portfolios"],
        (current) => ({
          portfolios: [
            {
              id: result.portfolioId,
              name: result.name ?? portfolioName,
            },
            ...(current?.portfolios ?? []),
          ],
        }),
      );
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["portfolios"] });
    } catch (err) {
      // Roll back the optimistic update and surface the error.
      if (previousPortfolios !== undefined) {
        queryClient.setQueryData(["portfolios"], previousPortfolios);
      }
      toast.error(
        reportUserFacingError(
          err,
          "We could not create this portfolio. Please try again.",
          { tags: { source: "portfolio-create" } },
        ),
      );
    } finally {
      setIsCreating(false);
    }
  }

  function handleStartRename(portfolio: PortfolioItem) {
    setRenamingId(portfolio.id);
    setRenameDraft(portfolio.name);
  }

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.portfolio.rename(id, name),
    onSuccess: () => {
      toast.success("Portfolio renamed.");
      void queryClient.invalidateQueries({ queryKey: ["portfolios"] });
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not rename this portfolio. Please try again.",
          { tags: { source: "portfolio-rename" } },
        ),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.portfolio.delete(id),
    onSuccess: (_data, id) => {
      toast.success("Portfolio deleted.");
      void queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      // Also invalidate the rollup for the deleted portfolio so stale data
      // is not served if the portfolio is recreated in the same session.
      void queryClient.invalidateQueries({
        queryKey: ["portfolio-rollup", id],
      });
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not delete this portfolio. Please try again.",
          { tags: { source: "portfolio-delete" } },
        ),
      );
    },
  });
  const linkCommunityMutation = useMutation({
    mutationFn: ({
      portfolioId,
      communityId,
    }: {
      portfolioId: string;
      communityId: string;
    }) => api.portfolio.linkCommunity(portfolioId, communityId),
    onSuccess: (_data, variables) => {
      toast.success("Community added to portfolio.");
      setMembershipError(null);
      void queryClient.invalidateQueries({
        queryKey: ["portfolio-rollup", variables.portfolioId],
      });
      // Invalidate the community list so the community sidebar/switcher reflects
      // any membership state changes (HIGH-APP-8).
      void queryClient.invalidateQueries({ queryKey: ["communities"] });
    },
    onError: (err) => {
      setMembershipError(
        reportUserFacingError(
          err,
          "We could not add this community. Please try again.",
          { tags: { source: "portfolio-add-community" } },
        ),
      );
    },
  });
  const unlinkCommunityMutation = useMutation({
    mutationFn: ({
      portfolioId,
      communityId,
    }: {
      portfolioId: string;
      communityId: string;
    }) => api.portfolio.unlinkCommunity(portfolioId, communityId),
    onSuccess: (_data, variables) => {
      toast.success("Community removed from portfolio.");
      setMembershipError(null);
      void queryClient.invalidateQueries({
        queryKey: ["portfolio-rollup", variables.portfolioId],
      });
    },
    onError: (err) => {
      setMembershipError(
        reportUserFacingError(
          err,
          "We could not remove this community. Please try again.",
          { tags: { source: "portfolio-remove-community" } },
        ),
      );
    },
  });

  function handleCommitRename() {
    const id = renamingId;
    setRenamingId(null);
    if (id && renameDraft.trim()) {
      renameMutation.mutate({ id, name: renameDraft.trim() });
    }
  }

  function handleDelete(portfolio: PortfolioItem) {
    if (selectedPortfolioId === portfolio.id) {
      setSelectedPortfolioId(null);
    }
    deleteMutation.mutate(portfolio.id, {
      onError: (err) => {
        setMembershipError(
          reportUserFacingError(
            err,
            "We could not delete this portfolio. Please try again.",
            { tags: { source: "portfolio-delete" } },
          ),
        );
      },
    });
  }

  const linkedCommunityIds = new Set(
    rollups.map((rollup) => rollup.communityId),
  );
  const unlinkedCommunities = communities.filter(
    (community) => !linkedCommunityIds.has(community.id),
  );

  return (
    <PageContainer>
      <PageHeader
        title="Portfolio"
        description="Group communities to see their finances in one place."
      />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Portfolios
          </h2>
          <p className="text-sm text-muted-foreground">
            Select a portfolio to see community health, overdue assessments, and
            close status.
          </p>
        </div>

        {portfoliosError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              We could not load your portfolios. Refresh the page to try again.
            </AlertDescription>
          </Alert>
        ) : portfolios.length === 0 && !isCreating ? (
          <EmptyState
            icon={<Briefcase className="h-6 w-6" />}
            title="No portfolios yet"
            description="Create a portfolio to see your communities' finances together."
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {portfolios.map((portfolio) => (
              <li
                key={portfolio.id}
                className="rounded-lg border bg-card p-4 shadow-sm"
              >
                {renamingId === portfolio.id ? (
                  <Input
                    autoFocus
                    aria-label={`Rename ${portfolio.name}`}
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={handleCommitRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleCommitRename();
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    className="h-9 text-sm"
                  />
                ) : (
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPortfolioId(
                          selectedPortfolioId === portfolio.id
                            ? null
                            : portfolio.id,
                        )
                      }
                      className={`min-w-0 flex-1 rounded-full border px-3 py-2 text-left text-sm transition-colors ${
                        selectedPortfolioId === portfolio.id
                          ? "bg-muted font-medium"
                          : "hover:bg-muted"
                      }`}
                    >
                      <span className="block break-words">
                        {portfolio.name}
                      </span>
                      {selectedPortfolioId === portfolio.id && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Selected portfolio
                        </span>
                      )}
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartRename(portfolio)}
                        aria-label={`Rename ${portfolio.name}`}
                        className="h-8 w-8 p-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <ConfirmActionDialog
                        title={`Delete ${portfolio.name}?`}
                        description="This removes the rollup view. Your communities are not deleted."
                        confirmLabel="Delete portfolio"
                        onConfirm={() => handleDelete(portfolio)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${portfolio.name}`}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => void handleCreate(event)}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            type="text"
            aria-label="New portfolio name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Portfolio name…"
            className="max-w-xs"
          />
          <Button type="submit" disabled={isCreating || !newName.trim()}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {isCreating ? "Creating…" : "Create portfolio"}
          </Button>
        </form>
      </section>

      {selectedPortfolioId ? (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Community Rollup
            </h2>
            <p className="text-sm text-muted-foreground">
              Showing {selectedPortfolio?.name ?? "selected portfolio"}.
            </p>
          </div>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="space-y-1">
              <h3 className="font-medium">Portfolio communities</h3>
              <p className="text-sm text-muted-foreground">
                Add or remove communities from this rollup.
              </p>
            </div>
            {membershipError && (
              <p className="text-sm text-destructive">{membershipError}</p>
            )}
            {communitiesError ? (
              <p className="text-sm text-muted-foreground">
                We could not load your communities. Refresh the page to try
                again.
              </p>
            ) : unlinkedCommunities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {unlinkedCommunities.map((community) => (
                  <Button
                    key={community.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      linkCommunityMutation.mutate({
                        portfolioId: selectedPortfolioId,
                        communityId: community.id,
                      })
                    }
                    disabled={linkCommunityMutation.isPending}
                  >
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Add {community.name}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                All available communities are already in this portfolio.
              </p>
            )}
            {rollups.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {rollups.map((rollup) => (
                  <li
                    key={rollup.communityId}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 break-words">
                      {rollup.communityName}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        unlinkCommunityMutation.mutate({
                          portfolioId: selectedPortfolioId,
                          communityId: rollup.communityId,
                        })
                      }
                      disabled={unlinkCommunityMutation.isPending}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {rollupLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : rollupError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                We could not load this portfolio&apos;s rollup. Refresh the page
                to try again.
              </AlertDescription>
            </Alert>
          ) : rollups.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="h-6 w-6" />}
              title="No communities in this portfolio"
              description="Add communities to this portfolio. You will see reserve funding, overdue assessments, and close status together."
            />
          ) : (
            <>
              <SummaryStatGrid>
                <SummaryStat
                  label="Communities"
                  value={rollups.length}
                  detail="Included in this rollup"
                />
                <SummaryStat
                  label="Overdue"
                  value={formatCents(overdueTotal)}
                  detail="Open overdue assessments"
                  tone={overdueTotal > 0 ? "warning" : "success"}
                />
                <SummaryStat
                  label="Average reserve"
                  value={
                    averageReserve !== null
                      ? `${averageReserve.toFixed(1)}%`
                      : "N/A"
                  }
                  detail="Known reserve funding"
                />
                <SummaryStat
                  label="Fannie Mae"
                  value={`${compliantCount}/${rollups.length}`}
                  detail="Communities marked compliant"
                />
              </SummaryStatGrid>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {rollups.map((rollup) => (
                  <RollupCard key={rollup.communityId} rollup={rollup} />
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <EmptyState
          icon={<Briefcase className="h-6 w-6" />}
          title="Select a portfolio to see its rollup"
          description="Choose a portfolio above. You will see its communities, overdue assessments, reserve funding, and close progress."
        />
      )}
    </PageContainer>
  );
}
