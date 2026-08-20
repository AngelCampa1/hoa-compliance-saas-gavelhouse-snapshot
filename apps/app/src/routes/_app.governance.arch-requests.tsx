import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GovernanceArchRequest } from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { qk } from "@/lib/query-keys";
import type { BoardRole } from "@boardstack/shared";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";
import { SummaryStat, SummaryStatGrid } from "@/components/ui/stat-card";
import { TierUpgradeGate } from "@/components/tier-upgrade-gate";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { reportUserFacingError } from "@/lib/sentry";

export const Route = createFileRoute("/_app/governance/arch-requests")({
  component: ArchRequestsPage,
});

const STATUS_VARIANTS: Record<
  string,
  "default" | "info" | "success" | "warning" | "destructive" | "neutral"
> = {
  pending: "warning",
  approved: "success",
  approved_with_conditions: "info",
  denied: "destructive",
};

const STATUS_LABELS: Record<GovernanceArchRequest["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  approved_with_conditions: "Approved with conditions",
  denied: "Denied",
};
const GOVERNANCE_WRITE_ROLES = new Set<BoardRole>([
  "owner",
  "admin",
  "secretary",
]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusLabel(status: GovernanceArchRequest["status"]): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

function getAttachmentName(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] || key;
}

function AttachmentList({ keys }: { keys: string[] }) {
  if (keys.length === 0) return "-";

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">
        {keys.length} {keys.length === 1 ? "file" : "files"}
      </p>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {keys.map((key) => (
          <li key={key} className="break-all">
            {getAttachmentName(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateArchRequestDialog({
  communityId,
  onClose,
}: {
  communityId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [requestType, setRequestType] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.governance.archRequests.create({
        communityId,
        requestType,
        description,
      }),
    onSuccess: () => {
      toast.success("Architectural request submitted.");
      void queryClient.invalidateQueries({
        queryKey: qk.governance.archRequests(communityId),
      });
      onClose();
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not submit this request. Please try again.",
          { tags: { source: "arch-submit" } },
        ),
      );
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Submit Architectural Request</DialogTitle>
        <DialogDescription>
          Add the request details so the board can review it.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="arch-request-type">Request type</Label>
          <Input
            id="arch-request-type"
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            placeholder="e.g. Fence installation, Deck addition"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="arch-request-description">Description</Label>
          <Input
            id="arch-request-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the proposed modification"
          />
        </div>
        {createMutation.isError && (
          <p className="text-sm text-destructive" role="alert">
            We could not submit this request. Please try again.
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
          onClick={() => createMutation.mutate()}
          disabled={
            createMutation.isPending ||
            !requestType.trim() ||
            !description.trim()
          }
        >
          {createMutation.isPending ? "Submitting…" : "Submit request"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AttachmentUpload({
  request,
  communityId,
}: {
  request: GovernanceArchRequest;
  communityId: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (file: File) =>
      api.governance.archRequests.uploadAttachment(request.id, file),
    onSuccess: () => {
      toast.success("Attachment uploaded.");
      void queryClient.invalidateQueries({
        queryKey: qk.governance.archRequests(communityId),
      });
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not upload this attachment. Please try again.",
          { tags: { source: "arch-upload" } },
        ),
      );
    },
  });

  return (
    <div className="space-y-1">
      <Label
        htmlFor={`arch-attachment-${request.id}`}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {mutation.isPending ? "Uploading…" : "Upload file"}
      </Label>
      <Input
        id={`arch-attachment-${request.id}`}
        type="file"
        className="sr-only"
        aria-label={`Upload attachment for ${request.requestType}`}
        accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
        disabled={mutation.isPending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          mutation.mutate(file);
          event.target.value = "";
        }}
      />
      {mutation.isError && (
        <p className="text-xs text-destructive" role="alert">
          We could not upload this attachment. Please try again.
        </p>
      )}
    </div>
  );
}

function ReviewActions({
  request,
  communityId,
}: {
  request: GovernanceArchRequest;
  communityId: string;
}) {
  const queryClient = useQueryClient();
  const [reviewStatus, setReviewStatus] = useState<
    GovernanceArchRequest["status"] | null
  >(null);
  const [reviewNote, setReviewNote] = useState("");
  const mutation = useMutation({
    mutationFn: ({
      status,
      note,
    }: {
      status: GovernanceArchRequest["status"];
      note?: string;
    }) => api.governance.archRequests.review(request.id, status, note),
    onSuccess: () => {
      toast.success("Review recorded.");
      void queryClient.invalidateQueries({
        queryKey: qk.governance.archRequests(communityId),
      });
      setReviewStatus(null);
      setReviewNote("");
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not record this review. Please try again.",
          { tags: { source: "arch-review" } },
        ),
      );
    },
  });

  if (request.status !== "pending") return null;

  const statusLabel = reviewStatus ? getStatusLabel(reviewStatus) : "";
  const requiresNote = reviewStatus === "approved_with_conditions";
  const trimmedNote = reviewNote.trim();

  return (
    <div className="space-y-1">
      <Select
        onValueChange={(val) =>
          setReviewStatus(val as GovernanceArchRequest["status"])
        }
        disabled={mutation.isPending}
      >
        <SelectTrigger
          className="w-44"
          aria-label={`Review ${request.requestType} request`}
        >
          <SelectValue placeholder="Review…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="approved">Approve</SelectItem>
          <SelectItem value="approved_with_conditions">
            Approve w/ conditions
          </SelectItem>
          <SelectItem value="denied">Deny</SelectItem>
        </SelectContent>
      </Select>
      <Dialog
        open={reviewStatus !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReviewStatus(null);
            setReviewNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Architectural Request</DialogTitle>
            <DialogDescription>
              Record the board decision and any note to keep with this request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Decision: {statusLabel}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor={`arch-review-note-${request.id}`}>
                Review note
              </Label>
              <Textarea
                id={`arch-review-note-${request.id}`}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={
                  requiresNote
                    ? "Describe the approval conditions"
                    : "Optional board note"
                }
              />
            </div>
            {mutation.isError && (
              <p className="text-sm text-destructive" role="alert">
                We could not record this review. Please try again.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (!reviewStatus) return;
                mutation.mutate({
                  status: reviewStatus,
                  note: trimmedNote || undefined,
                });
              }}
              disabled={
                mutation.isPending || (requiresNote && trimmedNote.length === 0)
              }
            >
              {mutation.isPending ? "Submitting…" : "Submit review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {mutation.isError && (
        <p className="text-xs text-destructive" role="alert">
          We could not record this review. Please try again.
        </p>
      )}
    </div>
  );
}

function ArchRequestsPage() {
  return (
    <TierUpgradeGate
      feature="governance-workflows"
      featureName="Architectural requests"
    >
      <ArchRequestsContent />
    </TierUpgradeGate>
  );
}

function ArchRequestsContent() {
  const { selectedCommunityId, selectedCommunityRole } = useCommunity();
  const communityId = selectedCommunityId ?? "";
  const [dialogOpen, setDialogOpen] = useState(false);
  const canWriteGovernance =
    selectedCommunityRole !== null &&
    GOVERNANCE_WRITE_ROLES.has(selectedCommunityRole as BoardRole);

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.governance.archRequests(communityId),
    queryFn: () => api.governance.archRequests.list(communityId),
    enabled: !!communityId,
  });

  const archRequests: GovernanceArchRequest[] = data?.archRequests ?? [];
  const pendingCount = archRequests.filter(
    (request) => request.status === "pending",
  ).length;
  const closedCount = archRequests.length - pendingCount;
  const nextRequest = archRequests.find(
    (request) => request.status === "pending",
  );

  return (
    <PageContainer>
      <PageHeader
        title="Architectural Requests"
        description="Review homeowner modification requests and record the board's decision."
        actions={
          canWriteGovernance ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              New request
            </Button>
          ) : null
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {dialogOpen && communityId && (
          <CreateArchRequestDialog
            communityId={communityId}
            onClose={() => setDialogOpen(false)}
          />
        )}
      </Dialog>

      <SummaryStatGrid>
        <SummaryStat label="Total requests" value={archRequests.length} />
        <SummaryStat
          label="Needs attention"
          value={pendingCount}
          tone={pendingCount > 0 ? "warning" : "default"}
          detail="Waiting for board review"
        />
        <SummaryStat
          label="Closed decisions"
          value={closedCount}
          tone={closedCount > 0 ? "success" : "default"}
          detail="Approved or denied"
        />
        <SummaryStat
          label="Next action"
          value={nextRequest ? "Review request" : "No action needed"}
          detail={nextRequest?.requestType ?? "No pending requests"}
        />
      </SummaryStatGrid>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            We could not load your architectural requests. Refresh the page to
            try again.
          </AlertDescription>
        </Alert>
      ) : archRequests.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="No architectural requests"
          description="No requests yet. Add one to start tracking homeowner modifications."
        />
      ) : (
        <ResponsiveDataList
          ariaLabel="Architectural requests"
          rows={archRequests}
          getRowKey={(r) => r.id}
          actionLabel="Review"
          columns={[
            {
              key: "type",
              header: "Type",
              primary: true,
              render: (r) => r.requestType,
            },
            {
              key: "description",
              header: "Description",
              className: "max-w-xs",
              render: (r) => r.description,
            },
            {
              key: "status",
              header: "Status",
              render: (r) => (
                <Badge variant={STATUS_VARIANTS[r.status] ?? "neutral"}>
                  {getStatusLabel(r.status)}
                </Badge>
              ),
            },
            {
              key: "submitted",
              header: "Submitted",
              render: (r) => formatDate(r.createdAt),
            },
            {
              key: "attachments",
              header: "Attachments",
              render: (r) => <AttachmentList keys={r.attachmentKeys ?? []} />,
            },
            {
              key: "review",
              header: "Review",
              render: (r) =>
                r.reviewNote || r.reviewedAt || r.reviewedByUserId ? (
                  <div className="space-y-1">
                    {r.reviewNote && <p>{r.reviewNote}</p>}
                    {(r.reviewedAt || r.reviewedByUserId) && (
                      <p className="text-xs text-muted-foreground">
                        Reviewed{" "}
                        {r.reviewedAt
                          ? formatDate(r.reviewedAt)
                          : "date not set"}
                        {r.reviewedByUserId ? " by a board member" : ""}
                      </p>
                    )}
                  </div>
                ) : (
                  "-"
                ),
            },
          ]}
          renderActions={
            canWriteGovernance
              ? (r) => (
                  <div className="space-y-3">
                    <AttachmentUpload request={r} communityId={communityId} />
                    <ReviewActions request={r} communityId={communityId} />
                  </div>
                )
              : undefined
          }
        />
      )}
    </PageContainer>
  );
}
