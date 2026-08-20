import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { getPageHelpForRoute } from "@boardstack/shared";
import { api } from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { qk } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { HelpCallout } from "@/components/help/HelpCallout";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  FileUp,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { reportUserFacingError, userFacingErrorMessage } from "@/lib/sentry";

export const Route = createFileRoute("/_app/finance/reserves")({
  component: FinanceReservesPage,
});

function FinanceReservesPage() {
  const queryClient = useQueryClient();
  const { selectedCommunityId } = useCommunity();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageHelp = getPageHelpForRoute("/finance/reserves");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<
    Array<{ row: number; field: string; message: string }>
  >([]);
  const [componentSearch, setComponentSearch] = useState("");
  const [annualBudget, setAnnualBudget] = useState("");
  const [annualReserveContribution, setAnnualReserveContribution] =
    useState("");
  const [amountSortDir, setAmountSortDir] = useState<"asc" | "desc" | null>(
    null,
  );
  const [complianceChecked, setComplianceChecked] = useState(false);

  const firstCommunity = selectedCommunityId
    ? { id: selectedCommunityId }
    : undefined;

  const {
    data: summaryData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: qk.finance.reserveSummary(firstCommunity?.id ?? ""),
    queryFn: () => api.finance.reserves.getSummary(firstCommunity!.id),
    enabled: !!firstCommunity,
  });

  const { data: activationData } = useQuery({
    queryKey: qk.activation.current(firstCommunity?.id ?? ""),
    queryFn: () => api.activation.get(firstCommunity!.id),
    enabled: !!firstCommunity,
  });

  const acknowledgeComplianceMutation = useMutation({
    mutationFn: () => {
      if (!firstCommunity) throw new Error("No community selected");
      return api.activation.patch(
        "compliance_acknowledged",
        firstCommunity.id,
        true,
      );
    },
    onSuccess: () => {
      toast.success("Compliance acknowledgement recorded.");
      if (firstCommunity) {
        void queryClient.invalidateQueries({
          queryKey: qk.activation.current(firstCommunity.id),
        });
      }
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not record this acknowledgement. Please try again.",
          { tags: { source: "reserves-ack" } },
        ),
      );
    },
  });

  useEffect(() => {
    if (!summaryData) return;
    setAnnualBudget(formatDollarsInput(summaryData.annualBudgetCents));
    setAnnualReserveContribution(
      formatDollarsInput(summaryData.annualReserveContributionCents),
    );
  }, [
    summaryData?.annualBudgetCents,
    summaryData?.annualReserveContributionCents,
  ]);

  const importMutation = useMutation({
    mutationFn: async ({
      file,
      communityId,
    }: {
      file: File;
      communityId: string;
    }) => {
      const contentType = file.name.endsWith(".json")
        ? "application/json"
        : "text/csv";
      return api.finance.reserves.importStudy(communityId, file, contentType);
    },
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: qk.finance.reserveSummary(variables.communityId),
      });
      if (firstCommunity) {
        void api.activation
          .patch("reserve_populated", firstCommunity.id, true)
          .then(() =>
            queryClient.invalidateQueries({
              queryKey: qk.activation.current(firstCommunity.id),
            }),
          );
      }
      if ("errors" in result && Array.isArray(result.errors)) {
        setImportErrors(result.errors);
        const msg = `Imported ${String(result.inserted)} rows with ${String(result.errors.length)} errors.`;
        setImportStatus(msg);
        toast.error(msg);
      } else {
        setImportErrors([]);
        const msg = `Successfully imported ${String((result as { inserted: number }).inserted)} components.`;
        setImportStatus(msg);
        toast.success(msg);
      }
    },
    onError: (err: Error) => {
      setImportErrors([]);
      const msg = reportUserFacingError(
        err,
        "We could not import this reserve study. Please try again.",
        { tags: { source: "reserves-import" } },
      );
      setImportStatus(msg);
      toast.error(msg);
    },
  });

  const allocationMutation = useMutation({
    mutationFn: ({
      annualBudgetCents,
      annualReserveContributionCents,
    }: {
      annualBudgetCents: number;
      annualReserveContributionCents: number;
    }) => {
      if (!summaryData?.studyId || !summaryData.effectiveDate) {
        throw new Error("Import a reserve study before saving allocation.");
      }

      return api.finance.reserves.updateAllocation({
        communityId: firstCommunity!.id,
        annualBudgetCents,
        annualReserveContributionCents,
      });
    },
    onSuccess: () => {
      toast.success("Allocation saved.");
      void queryClient.invalidateQueries({
        queryKey: qk.finance.reserveSummary(firstCommunity?.id ?? ""),
      });
      void queryClient.invalidateQueries({ queryKey: ["portfolio-rollup"] });
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not save this allocation. Please try again.",
          { tags: { source: "reserves-allocation" } },
        ),
      );
    },
  });

  if (!firstCommunity) {
    return (
      <PageContainer variant="form">
        <PageHeader title="Reserve Fund Dashboard" />
        <p className="text-muted-foreground">No community set up yet.</p>
      </PageContainer>
    );
  }

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader
          title="Reserve Fund"
          description="Fannie Mae LL-2026-03 compliance, effective January 2027"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader
          title="Reserve Fund"
          description="Fannie Mae LL-2026-03 compliance, effective January 2027"
        />
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            We could not load your reserve fund data. Refresh the page to try
            again.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  const summary = summaryData;
  const allocationPercent = summary?.allocationPercent ?? null;
  const percentFunded = summary?.percentFunded ?? null;
  const annualBudgetCents = parseDollarsToCents(annualBudget);
  const annualReserveContributionCents = parseDollarsToCents(
    annualReserveContribution,
  );
  const canSaveAllocation =
    !!summary?.studyId &&
    annualBudgetCents !== null &&
    annualReserveContributionCents !== null &&
    annualBudgetCents > 0 &&
    annualReserveContributionCents <= annualBudgetCents;

  let fannieBadgeVariant: "success" | "destructive" | "neutral" = "neutral";
  let fannieBadgeText = "No allocation data";
  let fannieBadgeIcon = <MinusCircle className="h-3 w-3" />;

  if (summary?.fannieMaeCompliant === true && allocationPercent !== null) {
    fannieBadgeVariant = "success";
    fannieBadgeText = `${allocationPercent.toFixed(1)}% funded, compliant`;
    fannieBadgeIcon = <CheckCircle2 className="h-3 w-3" />;
  } else if (
    summary?.fannieMaeCompliant === false &&
    allocationPercent !== null
  ) {
    fannieBadgeVariant = "destructive";
    fannieBadgeText = `${allocationPercent.toFixed(1)}% funded, below the 15% minimum`;
    fannieBadgeIcon = <AlertCircle className="h-3 w-3" />;
  } else if (
    summary?.fannieMaeComplianceBasis === "annual_budget_allocation_unavailable"
  ) {
    fannieBadgeText = "Needs annual budget allocation";
  }

  // Client-side filter + sort
  const rawComponents = summary?.components ?? [];
  const filteredComponents = rawComponents.filter((c) =>
    c.name.toLowerCase().includes(componentSearch.toLowerCase()),
  );
  const sortedComponents = [...filteredComponents].sort((a, b) => {
    if (amountSortDir === null) return 0;
    const diff = a.replacementCostCents - b.replacementCostCents;
    return amountSortDir === "asc" ? diff : -diff;
  });

  const hasErrors = importErrors.length > 0;

  return (
    <TooltipProvider>
      <PageContainer>
        <PageHeader
          title="Reserve Fund"
          description="Fannie Mae LL-2026-03 compliance, effective January 2027"
          actions={
            <>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={importMutation.isPending}
              >
                <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
                Import reserve study
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && firstCommunity) {
                    importMutation.mutate({
                      file,
                      communityId: firstCommunity.id,
                    });
                  }
                }}
              />
            </>
          }
        />
        <HelpCallout topic="reserves" />
        {pageHelp && <PageHelpPanel help={pageHelp} />}

        {!activationData?.activation?.complianceAcknowledged && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Fiduciary duty acknowledgement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                As a board member, you have a legal duty to keep enough money in
                the reserve fund. This is required by your state law and Fannie
                Mae LL-2026-03. Review the reserve data above, then confirm
                below.
              </p>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="compliance-ack"
                  checked={complianceChecked}
                  onCheckedChange={(checked) =>
                    setComplianceChecked(checked === true)
                  }
                />
                <Label
                  htmlFor="compliance-ack"
                  className="text-sm leading-snug cursor-pointer"
                >
                  I have reviewed the reserve fund data and I understand my duty
                  to keep it adequately funded.
                </Label>
              </div>
              <Button
                onClick={() => acknowledgeComplianceMutation.mutate()}
                disabled={
                  !complianceChecked || acknowledgeComplianceMutation.isPending
                }
              >
                {acknowledgeComplianceMutation.isPending
                  ? "Recording…"
                  : "Acknowledge"}
              </Button>
            </CardContent>
          </Card>
        )}

        {importStatus && (
          <Alert variant={hasErrors ? "warning" : "success"}>
            <AlertDescription>
              <p>{importStatus}</p>
              {hasErrors && (
                <ul className="mt-2 list-disc pl-5 space-y-1 text-xs">
                  {importErrors.map((err) => (
                    <li key={`${err.row}-${err.field}-${err.message}`}>
                      Row {err.row}, {err.field}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Reserve Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {summary ? formatCents(summary.totalReserveBalance) : "N/A"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <CardTitle className="text-sm font-medium text-muted-foreground cursor-help underline decoration-dotted">
                    Percent Funded
                  </CardTitle>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Your current reserves compared to the fully funded target.
                  Below 70% is underfunded.
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {percentFunded !== null
                  ? `${percentFunded.toFixed(1)}%`
                  : "N/A"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <CardTitle className="text-sm font-medium text-muted-foreground cursor-help underline decoration-dotted">
                    Fannie Mae LL-2026-03 (≥15%)
                  </CardTitle>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Fannie Mae Lender Letter 2026-03 requires communities to keep
                  at least 15% of annual assessments in reserves. Units in
                  communities below this threshold may not qualify for Fannie
                  Mae mortgage financing.
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <Badge variant={fannieBadgeVariant} icon={fannieBadgeIcon}>
                {fannieBadgeText}
              </Badge>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Annual budget allocation
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="annual-budget">Annual budget</Label>
              <Input
                id="annual-budget"
                inputMode="decimal"
                value={annualBudget}
                onChange={(event) => setAnnualBudget(event.target.value)}
                placeholder="120000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="annual-reserve-contribution">
                Reserve contribution
              </Label>
              <Input
                id="annual-reserve-contribution"
                inputMode="decimal"
                value={annualReserveContribution}
                onChange={(event) =>
                  setAnnualReserveContribution(event.target.value)
                }
                placeholder="18000"
              />
            </div>
            <Button
              onClick={() => {
                if (
                  annualBudgetCents === null ||
                  annualReserveContributionCents === null
                ) {
                  return;
                }
                allocationMutation.mutate({
                  annualBudgetCents,
                  annualReserveContributionCents,
                });
              }}
              disabled={allocationMutation.isPending || !canSaveAllocation}
            >
              {allocationMutation.isPending ? "Saving…" : "Save allocation"}
            </Button>
            {allocationMutation.isError && (
              <p
                className="text-sm text-destructive md:col-span-3"
                role="alert"
              >
                {userFacingErrorMessage(
                  allocationMutation.error,
                  "We could not save this allocation. Please try again.",
                )}
              </p>
            )}
          </CardContent>
        </Card>

        {summary?.stateRequirements && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {summary.stateRequirements.stateName} Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground">
                  Reserve study required:
                </span>
                <span className="font-medium">
                  {summary.stateRequirements.reserveStudyRequired
                    ? "Yes"
                    : "No"}
                </span>
              </div>
              {summary.stateRequirements.minimumFundingPercent !== null && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">
                    Minimum funding:
                  </span>
                  <span className="font-medium">
                    {summary.stateRequirements.minimumFundingPercent}%
                  </span>
                </div>
              )}
              {summary.stateRequirements.statuteCitation && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Statute:</span>
                  <span className="font-medium">
                    {summary.stateRequirements.statuteCitation}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Reserve Components</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!summary || summary.components.length === 0 ? (
              <EmptyState
                icon={<FileUp className="h-5 w-5" />}
                title="No reserve study imported"
                description="Import a reserve study CSV or JSON file to add component data and track compliance."
                action={
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Import reserve study
                  </Button>
                }
              />
            ) : (
              <>
                <Input
                  placeholder="Filter components…"
                  aria-label="Filter reserve components"
                  value={componentSearch}
                  onChange={(e) => setComponentSearch(e.target.value)}
                  className="max-w-sm"
                />
                <div className="grid gap-2 md:hidden">
                  {sortedComponents.map((component) => (
                    <div
                      key={component.id}
                      className="rounded-lg border bg-card p-4 text-sm shadow-sm"
                    >
                      <p className="font-medium">{component.name}</p>
                      <dl className="mt-3 grid gap-2">
                        <div className="grid grid-cols-[8rem_1fr] gap-3">
                          <dt className="text-muted-foreground">Replacement</dt>
                          <dd className="font-mono tabular-nums">
                            {formatCents(component.replacementCostCents)}
                          </dd>
                        </div>
                        <div className="grid grid-cols-[8rem_1fr] gap-3">
                          <dt className="text-muted-foreground">
                            Current reserve
                          </dt>
                          <dd className="font-mono tabular-nums">
                            {formatCents(component.currentReserveCents)}
                          </dd>
                        </div>
                        <div className="grid grid-cols-[8rem_1fr] gap-3">
                          <dt className="text-muted-foreground">Useful life</dt>
                          <dd>{component.usefulLifeYears} yrs</dd>
                        </div>
                        <div className="grid grid-cols-[8rem_1fr] gap-3">
                          <dt className="text-muted-foreground">Remaining</dt>
                          <dd>{component.remainingLifeYears} yrs</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Useful Life</TableHead>
                        <TableHead>Remaining Life</TableHead>
                        <TableHead
                          aria-sort={
                            amountSortDir === "asc"
                              ? "ascending"
                              : amountSortDir === "desc"
                                ? "descending"
                                : "none"
                          }
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="flex items-center gap-1 hover:text-foreground transition-colors"
                                onClick={() =>
                                  setAmountSortDir((prev) =>
                                    prev === "asc"
                                      ? "desc"
                                      : prev === "desc"
                                        ? null
                                        : "asc",
                                  )
                                }
                              >
                                Replacement Cost
                                <ArrowUpDown
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Click to sort by replacement cost
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead>Current Reserve</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedComponents.map((component) => (
                        <TableRow key={component.id}>
                          <TableCell className="font-medium">
                            {component.name}
                          </TableCell>
                          <TableCell>{component.usefulLifeYears} yrs</TableCell>
                          <TableCell>
                            {component.remainingLifeYears} yrs
                          </TableCell>
                          <TableCell>
                            {formatCents(component.replacementCostCents)}
                          </TableCell>
                          <TableCell>
                            {formatCents(component.currentReserveCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </PageContainer>
    </TooltipProvider>
  );
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDollarsInput(cents: number | null | undefined): string {
  return cents == null ? "" : String(cents / 100);
}

function parseDollarsToCents(value: string): number | null {
  const normalized = value.replace(/[$,]/g, "").trim();
  if (normalized.length === 0) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}
