import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ownerPortalApi } from "@/lib/api";
import { trackDashboardEvent } from "@/lib/analytics";
import {
  isOwnerTokenExpired,
  recordOwnerTokenSeen,
} from "@/lib/owner-portal-token";
import { qk } from "@/lib/query-keys";
import { formatCents } from "@/lib/money";
import { HelpCallout } from "@/components/help/HelpCallout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/portal")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  component: OwnerPortalPage,
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Turn a snake_case status code (e.g. "past_due",
 * "approved_with_conditions") into a human label like "Past due" so
 * homeowners never see raw machine values in the portal.
 */
function formatStatusLabel(status: string): string {
  const spaced = status.replace(/_/g, " ").trim();
  if (!spaced) return status;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function OwnerPortalPage() {
  const { token } = Route.useSearch();
  const queryClient = useQueryClient();
  const [requestType, setRequestType] = useState("");
  const [description, setDescription] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const trackedViewStateRef = useRef<Set<string>>(new Set());

  const tokenExpired = token ? isOwnerTokenExpired(token) : false;

  useEffect(() => {
    if (!token || typeof window === "undefined") return;
    recordOwnerTokenSeen(token);
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    const nextUrl = `${url.pathname}${url.search}${url.hash}` || "/portal";
    window.history.replaceState(null, "", nextUrl);
  }, [token]);

  useEffect(() => {
    if (token) return;
    if (trackedViewStateRef.current.has("missing_token")) return;
    trackedViewStateRef.current.add("missing_token");
    trackDashboardEvent("owner_portal_viewed", { state: "missing_token" });
  }, [token]);

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.ownerPortal.me(token ?? ""),
    queryFn: () => ownerPortalApi.getMe(token!),
    enabled: !!token && !tokenExpired,
    retry: false,
  });

  const { data: archData, isError: archRequestsError } = useQuery({
    queryKey: qk.ownerPortal.archRequests(token ?? ""),
    queryFn: () => ownerPortalApi.getArchRequests(token!),
    enabled: !!token && !!data,
    retry: false,
  });

  useEffect(() => {
    if (!token) return;

    if (tokenExpired || isError) {
      if (trackedViewStateRef.current.has("unavailable")) return;
      trackedViewStateRef.current.add("unavailable");
      trackDashboardEvent("owner_portal_viewed", { state: "unavailable" });
      return;
    }

    if (!data || (!archData && !archRequestsError)) return;
    if (trackedViewStateRef.current.has("loaded")) return;
    trackedViewStateRef.current.add("loaded");
    const payableAssessments = data.assessments.filter(
      (assessment) =>
        assessment.status === "pending" || assessment.status === "past_due",
    );
    trackDashboardEvent("owner_portal_viewed", {
      arch_request_count: archData?.archRequests.length ?? 0,
      arch_requests_available: !archRequestsError,
      assessment_count: data.assessments.length,
      payable_assessment_count: payableAssessments.length,
      state: "loaded",
    });
  }, [archData, archRequestsError, data, isError, token, tokenExpired]);

  const [pendingAssessmentId, setPendingAssessmentId] = useState<string | null>(
    null,
  );

  const paymentMutation = useMutation({
    mutationFn: (assessment: {
      id: string;
      amountCents: number;
      description: string;
      status: string;
    }) => {
      setPendingAssessmentId(assessment.id);
      setPaymentError(null);
      return ownerPortalApi.payDues(token!, {
        assessmentId: assessment.id,
        amountCents: assessment.amountCents,
        method: "card",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.ownerPortal.me(token ?? ""),
      });
    },
    onError: (_err, assessment) => {
      const message = "We could not start your payment. Please try again.";
      setPaymentError(message);
      trackDashboardEvent("owner_portal_payment_failed", {
        assessment_id: assessment.id,
        failure_type: "api_error",
        method: "card",
        status: assessment.status,
      });
      toast.error(message);
    },
    onSettled: () => {
      setPendingAssessmentId(null);
    },
  });

  const createArchRequestMutation = useMutation({
    mutationFn: (input: { requestType: string; description: string }) =>
      ownerPortalApi.createArchRequest(token!, input),
    onSuccess: async () => {
      setRequestType("");
      setDescription("");
      await queryClient.invalidateQueries({
        queryKey: qk.ownerPortal.archRequests(token ?? ""),
      });
    },
    onError: (_error, input) => {
      trackDashboardEvent("owner_portal_arch_request_failed", {
        failure_type: "api_error",
        field_count: 2,
        request_type_length: input.requestType.length,
      });
    },
  });

  function handleArchRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedRequestType = requestType.trim();
    const trimmedDescription = description.trim();
    if (!trimmedRequestType || !trimmedDescription) return;
    createArchRequestMutation.mutate({
      requestType: trimmedRequestType,
      description: trimmedDescription,
    });
  }

  if (!token) {
    return (
      <PageContainer variant="form" className="py-8">
        <HelpCallout topic="ownerPortal" showAction={false} />
        <div className="rounded-lg border p-4">
          <h1 className="text-lg font-semibold">This portal link is missing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open the link your board sent you. If you cannot find it, ask your
            board to send a new one.
          </p>
        </div>
      </PageContainer>
    );
  }

  if (isLoading) {
    return (
      <PageContainer variant="form" className="py-8">
        <p className="text-muted-foreground">Loading your account…</p>
      </PageContainer>
    );
  }

  if (tokenExpired || isError || !data) {
    return (
      <PageContainer variant="form" className="py-8">
        <HelpCallout topic="ownerPortal" showAction={false} />
        <div className="rounded-lg border p-4">
          <h1 className="text-lg font-semibold">
            This portal link no longer works
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Portal links expire after a while. Ask your board to send a new one.
          </p>
        </div>
      </PageContainer>
    );
  }

  const { homeowner, assessments } = data;
  const archRequests = archData?.archRequests ?? [];

  return (
    <PageContainer variant="form" className="py-8">
      <HelpCallout topic="ownerPortal" showAction={false} />
      <div>
        <h1 className="text-2xl font-bold">
          {homeowner.firstName} {homeowner.lastName}
        </h1>
        {homeowner.unitNumber && (
          <p className="text-muted-foreground">Unit {homeowner.unitNumber}</p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Assessments</h2>
        {assessments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No assessments yet. Your board has not added any charges.
          </p>
        ) : (
          <div className="space-y-3">
            <ResponsiveDataList
              ariaLabel="Owner portal assessments"
              rows={assessments}
              getRowKey={(assessment) => assessment.id}
              columns={[
                {
                  key: "description",
                  header: "Description",
                  primary: true,
                  render: (assessment) => assessment.description,
                },
                {
                  key: "amount",
                  header: "Amount",
                  align: "right",
                  render: (assessment) => formatCents(assessment.amountCents),
                },
                {
                  key: "dueDate",
                  header: "Due date",
                  render: (assessment) =>
                    assessment.dueDate ? formatDate(assessment.dueDate) : "-",
                },
                {
                  key: "status",
                  header: "Status",
                  render: (assessment) => formatStatusLabel(assessment.status),
                },
              ]}
            />
            <div className="space-y-2">
              {assessments
                .filter(
                  (assessment) =>
                    assessment.status === "pending" ||
                    assessment.status === "past_due",
                )
                .map((assessment) => (
                  <div
                    key={assessment.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium">
                      {assessment.description}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (pendingAssessmentId !== null) return;
                        // Clear any prior checkout banner so a new payment
                        // never shows the previous assessment's success state.
                        paymentMutation.reset();
                        paymentMutation.mutate(assessment);
                      }}
                      disabled={pendingAssessmentId !== null}
                    >
                      {pendingAssessmentId === assessment.id
                        ? "Loading…"
                        : `Pay ${assessment.description}`}
                    </Button>
                  </div>
                ))}
            </div>
            {paymentMutation.isSuccess && (
              <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
                <p className="font-medium text-success">Checkout is ready.</p>
                {paymentMutation.data.checkoutUrl ? (
                  <a
                    href={paymentMutation.data.checkoutUrl}
                    className="mt-2 inline-flex text-primary underline-offset-4 hover:underline"
                  >
                    Go to checkout
                  </a>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    This payment is being processed.
                  </p>
                )}
              </div>
            )}
            {paymentError && (
              <p className="text-sm text-destructive" role="alert">
                {paymentError}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Architectural Requests</h2>
        <form
          className="space-y-3 rounded-lg border p-3"
          onSubmit={handleArchRequestSubmit}
        >
          <div className="space-y-1.5">
            <Label htmlFor="owner-arch-request-type">Request type</Label>
            <Input
              id="owner-arch-request-type"
              value={requestType}
              onChange={(event) => setRequestType(event.target.value)}
              placeholder="Fence, patio cover, exterior paint"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-arch-request-description">
              Project details
            </Label>
            <Textarea
              id="owner-arch-request-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the work, materials, colors, and timeline."
              required
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={
              createArchRequestMutation.isPending ||
              !requestType.trim() ||
              !description.trim()
            }
          >
            Submit architectural request
          </Button>
          {createArchRequestMutation.isSuccess && (
            <p className="text-sm text-success" role="status">
              Architectural request submitted for board review.
            </p>
          )}
          {createArchRequestMutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              We could not submit your request. Please try again.
            </p>
          )}
        </form>
        {archRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No requests yet. Submit one above when you are ready for board
            review.
          </p>
        ) : (
          <ul className="space-y-2">
            {archRequests.map((request) => (
              <li
                key={request.id}
                className="space-y-1 rounded-lg border p-3 text-sm"
              >
                <div className="font-medium">{request.requestType}</div>
                <div className="text-muted-foreground">
                  {request.description}
                </div>
                <div className="text-xs text-muted-foreground">
                  Status: {formatStatusLabel(request.status)} &middot;{" "}
                  {formatDate(request.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
