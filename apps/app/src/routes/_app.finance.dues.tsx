import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getFieldHelp, getPageHelpForRoute } from "@boardstack/shared";
import { api } from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { qk } from "@/lib/query-keys";
import type {
  AssessmentRow,
  AssessmentsResponse,
  HomeownerRow,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { HelpCallout } from "@/components/help/HelpCallout";
import { FriendlyEmptyState } from "@/components/help/FriendlyEmptyState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HelpHint } from "@/components/help/HelpHint";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";
import { AlertCircle, CheckCircle2, Clock, MinusCircle } from "lucide-react";
import { getAssessmentStatusLabel } from "@/lib/finance-labels";
import { toast } from "sonner";
import { reportUserFacingError, userFacingErrorMessage } from "@/lib/sentry";

export const Route = createFileRoute("/_app/finance/dues")({
  component: FinanceDuesPage,
});

async function fetchAllAssessments(
  communityId: string,
): Promise<AssessmentsResponse> {
  const assessments: AssessmentRow[] = [];
  let offset = 0;
  const limit = 200;
  let total = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await api.finance.dues.listAssessments(
      communityId,
      undefined,
      { limit, offset },
    );
    const pageAssessments = page.assessments;
    assessments.push(...pageAssessments);
    total = page.total;
    hasMore = page.hasMore;
    offset += pageAssessments.length;
    if (pageAssessments.length === 0) break;
  }

  return { assessments, total, limit, offset: 0, hasMore: false };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDueDate(isoDate: string): string {
  // dueDate is a calendar date ("2025-03-01"); anchor to local midnight to
  // avoid the UTC parse shifting it back a day.
  const parsed = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? isoDate : parsed.toLocaleDateString();
}

type AssessmentStatus = "paid" | "pending" | "past_due" | "waived";

function statusBadge(status: string) {
  const s = status as AssessmentStatus;
  switch (s) {
    case "paid":
      return (
        <Badge variant="success" icon={<CheckCircle2 className="h-3 w-3" />}>
          {getAssessmentStatusLabel(s)}
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="warning" icon={<Clock className="h-3 w-3" />}>
          {getAssessmentStatusLabel(s)}
        </Badge>
      );
    case "past_due":
      return (
        <Badge variant="destructive" icon={<AlertCircle className="h-3 w-3" />}>
          {getAssessmentStatusLabel(s)}
        </Badge>
      );
    case "waived":
      return (
        <Badge variant="neutral" icon={<MinusCircle className="h-3 w-3" />}>
          {getAssessmentStatusLabel(s)}
        </Badge>
      );
    default:
      return (
        <Badge variant="neutral">{getAssessmentStatusLabel(status)}</Badge>
      );
  }
}

function MarkPaidDialog({
  assessment,
  homeowners,
  communityId,
  onClose,
  onSuccess,
}: {
  assessment: AssessmentRow;
  homeowners: HomeownerRow[];
  communityId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const payableHomeowners = assessment.unitId
    ? homeowners.filter((homeowner) => homeowner.unitId === assessment.unitId)
    : [];
  const [selectedHomeownerId, setSelectedHomeownerId] = useState(
    payableHomeowners[0]?.id ?? "",
  );

  const payMutation = useMutation({
    mutationFn: () =>
      api.finance.dues.pay({
        communityId,
        assessmentId: assessment.id,
        homeownerId: selectedHomeownerId,
        amountCents: assessment.amountCents,
        method: "other",
      }),
    onSuccess: () => {
      toast.success("Assessment marked as paid.");
      onSuccess();
      onClose();
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not mark this assessment as paid. Please try again.",
          { tags: { source: "dues-mark-paid" } },
        ),
      );
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Mark Assessment Paid</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div>
          <p className="text-sm text-muted-foreground">
            Period:{" "}
            <span className="font-medium text-foreground">
              {assessment.period}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Amount:{" "}
            <span className="font-medium text-foreground">
              {formatCurrency(assessment.amountCents)}
            </span>
          </p>
        </div>
        {payableHomeowners.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="markpaid-homeowner">Homeowner</Label>
            <Select
              value={selectedHomeownerId}
              onValueChange={setSelectedHomeownerId}
            >
              <SelectTrigger id="markpaid-homeowner">
                <SelectValue placeholder="Select homeowner…" />
              </SelectTrigger>
              <SelectContent>
                {payableHomeowners.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.firstName} {h.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This assessment has no unit or homeowner linked to it.
          </p>
        )}
        {payMutation.isError && (
          <p className="text-sm text-destructive" role="alert">
            {userFacingErrorMessage(
              payMutation.error,
              "We could not mark this assessment as paid. Please try again.",
            )}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogClose>
        <Button
          onClick={() => payMutation.mutate()}
          disabled={
            payMutation.isPending ||
            !selectedHomeownerId ||
            payableHomeowners.length === 0
          }
        >
          {payMutation.isPending ? "Marking paid…" : "Confirm paid"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function FinanceDuesPage() {
  const queryClient = useQueryClient();
  const { selectedCommunityId } = useCommunity();
  const { isLoading: communitiesLoading } = useQuery({
    queryKey: qk.communities.list(),
    queryFn: () => api.communities.list(),
  });

  const firstCommunity = selectedCommunityId
    ? { id: selectedCommunityId }
    : undefined;

  const {
    data: homeownersData,
    isLoading: homeownersLoading,
    isError: homeownersError,
  } = useQuery({
    queryKey: qk.finance.homeowners(firstCommunity?.id ?? ""),
    queryFn: () => api.finance.dues.listHomeowners(firstCommunity!.id),
    enabled: !!firstCommunity,
  });

  const {
    data: assessmentsData,
    isLoading: assessmentsLoading,
    isError: assessmentsError,
  } = useQuery({
    queryKey: qk.finance.dues(firstCommunity?.id ?? ""),
    queryFn: () => fetchAllAssessments(firstCommunity!.id),
    enabled: !!firstCommunity,
  });

  const [period, setPeriod] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [fundType, setFundType] = useState<"operating" | "reserve">(
    "operating",
  );
  const [dueDate, setDueDate] = useState("");
  const [markPaidAssessment, setMarkPaidAssessment] =
    useState<AssessmentRow | null>(null);

  const createAssessmentMutation = useMutation({
    mutationFn: (vars: {
      communityId: string;
      unitIds: string[];
      period: string;
      amountCents: number;
      fundType: "operating" | "reserve";
      dueDate: string;
    }) =>
      api.finance.dues
        .createAssessmentBatch({
          communityId: vars.communityId,
          unitIds: vars.unitIds,
          period: vars.period,
          amountCents: vars.amountCents,
          fundType: vars.fundType,
          dueDate: vars.dueDate,
        })
        .then((result) => ({ result, assessment: vars })),
    onSuccess: ({ result, assessment }) => {
      toast.success("Assessment batch created.");
      queryClient.setQueryData<AssessmentsResponse>(
        qk.finance.dues(assessment.communityId),
        (current) => {
          const createdAt = new Date().toISOString();
          const createdAssessments = result.assessmentIds.map((id, idx) => ({
            id,
            communityId: assessment.communityId,
            unitId: assessment.unitIds[idx] ?? null,
            period: assessment.period,
            amountCents: assessment.amountCents,
            fundType: assessment.fundType,
            dueDate: assessment.dueDate,
            status: "pending",
            createdAt,
            updatedAt: createdAt,
          }));
          return {
            assessments: [
              ...(current?.assessments ?? []),
              ...createdAssessments,
            ],
            total: (current?.total ?? 0) + createdAssessments.length,
            limit: current?.limit ?? 200,
            offset: current?.offset ?? 0,
            hasMore: current?.hasMore ?? false,
          };
        },
      );
      void queryClient.invalidateQueries({
        queryKey: qk.finance.dues(assessment.communityId),
      });
      setPeriod("");
      setAmountDollars("");
      setDueDate("");
      if (firstCommunity) {
        void api.activation
          .patch("dues_batch_configured", firstCommunity.id, true)
          .then(() =>
            queryClient.invalidateQueries({
              queryKey: qk.activation.current(firstCommunity.id),
            }),
          );
      }
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not create these assessments. Please try again.",
          { tags: { source: "dues-create" } },
        ),
      );
    },
  });

  if (communitiesLoading) {
    return (
      <PageContainer variant="form">
        <PageHeader title="Dues and Assessments" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (!firstCommunity) {
    return (
      <PageContainer variant="form">
        <PageHeader title="Dues and Assessments" />
        <p className="text-muted-foreground">No community set up yet.</p>
      </PageContainer>
    );
  }

  const allAssessments = assessmentsData?.assessments ?? [];
  const allHomeowners = homeownersData?.homeowners ?? [];
  const assignedUnitIds = Array.from(
    new Set(
      allHomeowners.flatMap((homeowner) =>
        homeowner.unitId ? [homeowner.unitId] : [],
      ),
    ),
  );
  const unassignedHomeowners = allHomeowners.filter((h) => !h.unitId).length;
  const pageHelp = getPageHelpForRoute("/finance/dues");

  // Compute totals for aging summary
  const totalOutstanding = allAssessments
    .filter((a) => a.status !== "paid" && a.status !== "waived")
    .reduce((sum, a) => sum + a.amountCents, 0);
  const totalPastDue = allAssessments
    .filter((a) => a.status === "past_due")
    .reduce((sum, a) => sum + a.amountCents, 0);
  const totalPaid = allAssessments
    .filter((a) => a.status === "paid")
    .reduce((sum, a) => sum + a.amountCents, 0);

  // Assessment batch preview: show when all required fields are filled
  const previewDollars = parseFloat(amountDollars);
  const showPreview =
    period.trim().length > 0 &&
    !isNaN(previewDollars) &&
    previewDollars > 0 &&
    dueDate.trim().length > 0;

  const previewAssessmentCount = assignedUnitIds.length;
  const previewTotal = showPreview
    ? Math.round(previewDollars * 100) * previewAssessmentCount
    : 0;

  return (
    <PageContainer>
      <PageHeader
        title="Dues and Assessments"
        description="Create dues batches and track payment status."
      />

      <section
        aria-label="Dues at a glance"
        className="grid gap-3 sm:grid-cols-4"
      >
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Outstanding
            </p>
            <p className="text-2xl font-semibold">
              {formatCurrency(totalOutstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Past due
            </p>
            <p className="text-2xl font-semibold text-destructive">
              {formatCurrency(totalPastDue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Paid
            </p>
            <p className="text-2xl font-semibold text-success">
              {formatCurrency(totalPaid)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Next action
            </p>
            <p className="font-medium">
              {allHomeowners.length === 0
                ? "Add homeowners"
                : allAssessments.length === 0
                  ? "Create dues batch"
                  : totalPastDue > 0
                    ? "Review past due"
                    : "Dues on track"}
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Create a dues batch</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-w-sm">
            <div>
              <div className="flex items-center gap-1">
                <Label htmlFor="period">Period</Label>
                {getFieldHelp("dues.period") && (
                  <HelpHint help={getFieldHelp("dues.period")!} />
                )}
              </div>
              <Input
                id="period"
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <Label htmlFor="amount">Amount ($)</Label>
                {getFieldHelp("dues.amount") && (
                  <HelpHint help={getFieldHelp("dues.amount")!} />
                )}
              </div>
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="150.00"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <Label htmlFor="fundType">Fund Type</Label>
                {getFieldHelp("dues.fundType") && (
                  <HelpHint help={getFieldHelp("dues.fundType")!} />
                )}
              </div>
              <Select
                value={fundType}
                onValueChange={(v) => setFundType(v as "operating" | "reserve")}
              >
                <SelectTrigger id="fundType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operating">Operating</SelectItem>
                  <SelectItem value="reserve">Reserve</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            {showPreview && (
              <div className="space-y-1 rounded-md border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Batch preview</p>
                <p>
                  This will create{" "}
                  <span className="font-medium">{previewAssessmentCount}</span>{" "}
                  unit assessment{previewAssessmentCount !== 1 ? "s" : ""} of{" "}
                  <span className="font-medium">
                    ${previewDollars.toFixed(2)}
                  </span>{" "}
                  each (total{" "}
                  <span className="font-medium">
                    {formatCurrency(previewTotal)}
                  </span>
                  ).
                </p>
                <p>
                  Period:{" "}
                  <span className="font-medium font-mono">{period}</span>
                </p>
                <p>
                  Fund:{" "}
                  <span className="font-medium capitalize">{fundType}</span>
                </p>
                {unassignedHomeowners > 0 && (
                  <p className="text-muted-foreground">
                    {unassignedHomeowners} homeowner
                    {unassignedHomeowners !== 1 ? "s" : ""} without a unit
                    assignment will be skipped.
                  </p>
                )}
                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={() => {
                      if (!period || isNaN(previewDollars) || !dueDate) return;
                      createAssessmentMutation.mutate({
                        communityId: firstCommunity.id,
                        unitIds: assignedUnitIds,
                        period,
                        amountCents: Math.round(previewDollars * 100),
                        fundType,
                        dueDate,
                      });
                    }}
                    disabled={
                      createAssessmentMutation.isPending ||
                      previewAssessmentCount === 0
                    }
                  >
                    {createAssessmentMutation.isPending
                      ? "Creating…"
                      : "Create batch"}
                  </Button>
                </div>
              </div>
            )}

            {createAssessmentMutation.isError && (
              <p className="text-sm text-destructive" role="alert">
                {userFacingErrorMessage(
                  createAssessmentMutation.error,
                  "We could not create these assessments. Please try again.",
                )}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Homeowners ({allHomeowners.length} total)</CardTitle>
        </CardHeader>
        <CardContent>
          {homeownersLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : homeownersError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                We could not load your homeowners. Refresh the page to try
                again.
              </AlertDescription>
            </Alert>
          ) : allHomeowners.length === 0 ? (
            <FriendlyEmptyState
              title="No homeowners yet"
              reason="You need homeowners before you can send dues."
              nextStep="Add or import homeowners first, then come back to create a batch."
            />
          ) : (
            <ResponsiveDataList
              ariaLabel="Homeowners eligible for dues"
              rows={allHomeowners}
              getRowKey={(h) => h.id}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  primary: true,
                  render: (h) => `${h.firstName} ${h.lastName}`,
                },
                { key: "email", header: "Email", render: (h) => h.email },
                {
                  key: "active",
                  header: "Active",
                  render: (h) =>
                    h.active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="default">Inactive</Badge>
                    ),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment status</CardTitle>
        </CardHeader>
        <CardContent>
          {assessmentsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : assessmentsError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                We could not load your assessments. Refresh the page to try
                again.
              </AlertDescription>
            </Alert>
          ) : allAssessments.length === 0 ? (
            <FriendlyEmptyState
              title="No dues created yet"
              reason="You have not created any dues yet."
              nextStep="Check that your homeowner list is ready. Then use the form above to create your first batch."
            />
          ) : (
            <>
              <ResponsiveDataList
                ariaLabel="Assessment status"
                rows={allAssessments}
                getRowKey={(a) => a.id}
                columns={[
                  {
                    key: "period",
                    header: "Period",
                    primary: true,
                    className: "font-mono",
                    render: (a) => a.period,
                  },
                  {
                    key: "amount",
                    header: "Amount",
                    align: "right",
                    render: (a) => formatCurrency(a.amountCents),
                  },
                  {
                    key: "fund",
                    header: "Fund",
                    className: "capitalize",
                    render: (a) => a.fundType,
                  },
                  {
                    key: "due",
                    header: "Due",
                    render: (a) => formatDueDate(a.dueDate),
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (a) => statusBadge(a.status),
                  },
                ]}
                renderActions={(a) =>
                  (a.status === "pending" || a.status === "past_due") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMarkPaidAssessment(a)}
                      aria-label={`Mark ${a.period} assessment paid`}
                    >
                      Mark paid
                    </Button>
                  )
                }
              />

              {/* Aging summary row */}
              <div className="mt-4 flex flex-wrap gap-4 text-sm border-t pt-4">
                <span>
                  Total outstanding:{" "}
                  <span className="font-medium">
                    {formatCurrency(totalOutstanding)}
                  </span>
                </span>
                <span className="text-destructive">
                  Past due:{" "}
                  <span className="font-medium">
                    {formatCurrency(totalPastDue)}
                  </span>
                </span>
                <span className="text-success">
                  Paid:{" "}
                  <span className="font-medium">
                    {formatCurrency(totalPaid)}
                  </span>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={markPaidAssessment !== null}
        onOpenChange={(open) => {
          if (!open) setMarkPaidAssessment(null);
        }}
      >
        {markPaidAssessment && (
          <MarkPaidDialog
            assessment={markPaidAssessment}
            homeowners={allHomeowners}
            communityId={firstCommunity.id}
            onClose={() => setMarkPaidAssessment(null)}
            onSuccess={() => {
              void queryClient.invalidateQueries({
                queryKey: qk.finance.dues(firstCommunity.id),
              });
            }}
          />
        )}
      </Dialog>

      <HelpCallout topic="dues" />
      {pageHelp && <PageHelpPanel help={pageHelp} />}
    </PageContainer>
  );
}
