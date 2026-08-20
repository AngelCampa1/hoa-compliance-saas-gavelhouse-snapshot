import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GovernanceViolation, GovernanceViolationEvent } from "@/lib/api";
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
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";
import { SummaryStat, SummaryStatGrid } from "@/components/ui/stat-card";
import { TierUpgradeGate } from "@/components/tier-upgrade-gate";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { reportUserFacingError } from "@/lib/sentry";

export const Route = createFileRoute("/_app/governance/violations")({
  component: ViolationsPage,
});

const STATUS_VARIANTS: Record<
  string,
  "default" | "info" | "success" | "warning" | "destructive" | "neutral"
> = {
  open: "destructive",
  notified: "warning",
  cured: "success",
  closed: "neutral",
};

type ViolationStatus = "open" | "notified" | "cured" | "closed";

const VALID_TRANSITIONS: Record<ViolationStatus, ViolationStatus[]> = {
  open: ["notified", "cured", "closed"],
  notified: ["cured", "closed"],
  cured: ["closed", "open"],
  closed: [],
};

const TRANSITION_LABELS: Record<ViolationStatus, string> = {
  open: "Re-open",
  notified: "Mark notified",
  cured: "Mark cured",
  closed: "Close",
};

const STATUS_LABELS: Record<ViolationStatus, string> = {
  open: "Open",
  notified: "Notified",
  cured: "Cured",
  closed: "Closed",
};
const GOVERNANCE_WRITE_ROLES = new Set<BoardRole>([
  "owner",
  "admin",
  "secretary",
]);

function StatusSelect({
  violation,
  communityId,
}: {
  violation: GovernanceViolation;
  communityId: string;
}) {
  const queryClient = useQueryClient();
  const [nextStatus, setNextStatus] = useState<ViolationStatus | null>(null);
  const [note, setNote] = useState("");
  const next = VALID_TRANSITIONS[violation.status as ViolationStatus] ?? [];

  const mutation = useMutation({
    mutationFn: ({
      status,
      statusNote,
    }: {
      status: ViolationStatus;
      statusNote: string;
    }) =>
      api.governance.violations.updateStatus(violation.id, status, statusNote),
    onSuccess: () => {
      toast.success("Violation status updated.");
      void queryClient.invalidateQueries({
        queryKey: qk.governance.violations(communityId),
      });
      void queryClient.invalidateQueries({
        queryKey: qk.governance.violationEvents(violation.id),
      });
      setNextStatus(null);
      setNote("");
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not update this status. Please try again.",
          { tags: { source: "violation-status" } },
        ),
      );
    },
  });

  if (next.length === 0) return null;

  const trimmedNote = note.trim();

  return (
    <div className="space-y-1">
      <Select
        onValueChange={(val) => setNextStatus(val as ViolationStatus)}
        disabled={mutation.isPending}
      >
        <SelectTrigger
          className="w-40"
          aria-label={`Change status for ${violation.title}`}
        >
          <SelectValue placeholder="Change…" />
        </SelectTrigger>
        <SelectContent>
          {next.map((s) => (
            <SelectItem key={s} value={s}>
              {TRANSITION_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Dialog
        open={nextStatus !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNextStatus(null);
            setNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Status Update</DialogTitle>
            <DialogDescription>
              Add a note for this status change. It stays with the violation
              record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              New status: {nextStatus ? STATUS_LABELS[nextStatus] : ""}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor={`violation-status-note-${violation.id}`}>
                Status note
              </Label>
              <Textarea
                id={`violation-status-note-${violation.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What action did the board take?"
              />
            </div>
            {mutation.isError && (
              <p className="text-sm text-destructive" role="alert">
                We could not update this status. Please try again.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (!nextStatus) return;
                mutation.mutate({
                  status: nextStatus,
                  statusNote: trimmedNote,
                });
              }}
              disabled={mutation.isPending || trimmedNote.length === 0}
            >
              {mutation.isPending ? "Updating…" : "Update status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {mutation.isError && (
        <p className="text-xs text-destructive" role="alert">
          We could not update this status. Please try again.
        </p>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getEvidenceName(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] || key;
}

function EvidenceList({ keys }: { keys: string[] }) {
  if (keys.length === 0) return "-";

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">
        {keys.length} {keys.length === 1 ? "photo" : "photos"}
      </p>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {keys.map((key) => (
          <li key={key} className="break-all">
            {getEvidenceName(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ViolationHistory({ violation }: { violation: GovernanceViolation }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.governance.violationEvents(violation.id),
    queryFn: () => api.governance.violations.listEvents(violation.id),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading history...</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Failed to load history.
      </p>
    );
  }

  const events: GovernanceViolationEvent[] = data?.events ?? [];
  if (events.length === 0) return "-";

  return (
    <ol className="space-y-2 text-sm">
      {events.map((event) => (
        <li key={event.id} className="space-y-0.5">
          <p className="font-medium">
            {STATUS_LABELS[event.toStatus]} on {formatDate(event.occurredAt)}
          </p>
          {event.note && <p className="text-muted-foreground">{event.note}</p>}
          {event.actorUserId && (
            <p className="text-xs text-muted-foreground">
              Recorded by a board member
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function PhotoUpload({
  violation,
  communityId,
}: {
  violation: GovernanceViolation;
  communityId: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (file: File) =>
      api.governance.violations.uploadPhoto(violation.id, file),
    onSuccess: () => {
      toast.success("Photo uploaded.");
      void queryClient.invalidateQueries({
        queryKey: qk.governance.violations(communityId),
      });
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not upload this photo. Please try again.",
          { tags: { source: "violation-photo" } },
        ),
      );
    },
  });

  return (
    <div className="space-y-1">
      <Label
        htmlFor={`violation-photo-${violation.id}`}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {mutation.isPending ? "Uploading…" : "Upload photo"}
      </Label>
      <Input
        id={`violation-photo-${violation.id}`}
        type="file"
        className="sr-only"
        aria-label={`Upload photo for ${violation.title}`}
        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
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
          We could not upload this photo. Please try again.
        </p>
      )}
    </div>
  );
}

function CreateViolationDialog({
  communityId,
  onClose,
}: {
  communityId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [homeownerId, setHomeownerId] = useState("");

  const { data: homeownersData } = useQuery({
    queryKey: qk.governance.homeowners(communityId),
    queryFn: () => api.governance.homeowners.list(communityId),
    enabled: !!communityId,
  });
  const homeowners = homeownersData?.homeowners ?? [];

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: {
        communityId: string;
        title: string;
        description: string;
        homeownerId?: string;
      } = { communityId, title, description };
      if (homeownerId) payload.homeownerId = homeownerId;
      return api.governance.violations.create(payload);
    },
    onSuccess: () => {
      toast.success("Violation logged.");
      void queryClient.invalidateQueries({
        queryKey: qk.governance.violations(communityId),
      });
      onClose();
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not log this violation. Please try again.",
          { tags: { source: "violation-log" } },
        ),
      );
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Log Violation</DialogTitle>
        <DialogDescription>
          Record the violation details the board will use to follow up.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="violation-title">Title</Label>
          <Input
            id="violation-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Unapproved fence installation"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="violation-description">Description</Label>
          <Input
            id="violation-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the violation in detail"
          />
        </div>
        <div className="space-y-1.5">
          <Label id="violation-homeowner-label">Homeowner</Label>
          <Select value={homeownerId} onValueChange={setHomeownerId}>
            <SelectTrigger aria-labelledby="violation-homeowner-label">
              <SelectValue placeholder="Optional homeowner" />
            </SelectTrigger>
            <SelectContent>
              {homeowners.map((homeowner) => (
                <SelectItem key={homeowner.id} value={homeowner.id}>
                  {homeowner.firstName} {homeowner.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {createMutation.isError && (
          <p className="text-sm text-destructive" role="alert">
            We could not log this violation. Please try again.
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
            createMutation.isPending || !title.trim() || !description.trim()
          }
        >
          {createMutation.isPending ? "Logging…" : "Log violation"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ViolationsPage() {
  return (
    <TierUpgradeGate feature="governance-workflows" featureName="Violation log">
      <ViolationsContent />
    </TierUpgradeGate>
  );
}

function ViolationsContent() {
  const { selectedCommunityId, selectedCommunityRole } = useCommunity();
  const communityId = selectedCommunityId ?? "";
  const [dialogOpen, setDialogOpen] = useState(false);
  const canWriteGovernance =
    selectedCommunityRole !== null &&
    GOVERNANCE_WRITE_ROLES.has(selectedCommunityRole as BoardRole);

  const { data, isLoading } = useQuery({
    queryKey: qk.governance.violations(communityId),
    queryFn: () => api.governance.violations.list(communityId),
    enabled: !!communityId,
  });
  const { data: homeownersData } = useQuery({
    queryKey: qk.governance.homeowners(communityId),
    queryFn: () => api.governance.homeowners.list(communityId),
    enabled: !!communityId,
  });

  const violations: GovernanceViolation[] = data?.violations ?? [];
  const homeownerNameById = new Map(
    (homeownersData?.homeowners ?? []).map((homeowner) => [
      homeowner.id,
      `${homeowner.firstName} ${homeowner.lastName}`.trim() || homeowner.id,
    ]),
  );
  const attentionCount = violations.filter(
    (v) => v.status === "open" || v.status === "notified",
  ).length;
  const closedCount = violations.filter(
    (v) => v.status === "closed" || v.status === "cured",
  ).length;
  const nextViolation = violations.find(
    (v) => v.status === "open" || v.status === "notified",
  );

  return (
    <PageContainer>
      <PageHeader
        title="Violation Log"
        description="Track violations, update their status, and record when they are resolved."
        actions={
          canWriteGovernance ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              Log violation
            </Button>
          ) : null
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {dialogOpen && communityId && (
          <CreateViolationDialog
            communityId={communityId}
            onClose={() => setDialogOpen(false)}
          />
        )}
      </Dialog>

      <SummaryStatGrid>
        <SummaryStat label="Total violations" value={violations.length} />
        <SummaryStat
          label="Needs attention"
          value={attentionCount}
          tone={attentionCount > 0 ? "warning" : "default"}
          detail="Open or notified"
        />
        <SummaryStat
          label="Closed or cured"
          value={closedCount}
          tone={closedCount > 0 ? "success" : "default"}
          detail="Cured or closed"
        />
        <SummaryStat
          label="Next action"
          value={nextViolation ? "Update status" : "Monitor compliance"}
          detail={nextViolation?.title ?? "No open violations"}
        />
      </SummaryStatGrid>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : violations.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="No violations on record"
          description="Log a violation to start tracking it."
        />
      ) : (
        <ResponsiveDataList
          ariaLabel="Violation log"
          rows={violations}
          getRowKey={(v) => v.id}
          columns={[
            {
              key: "title",
              header: "Title",
              primary: true,
              render: (v) => v.title,
            },
            {
              key: "status",
              header: "Status",
              render: (v) => (
                <Badge variant={STATUS_VARIANTS[v.status] ?? "neutral"}>
                  {STATUS_LABELS[v.status]}
                </Badge>
              ),
            },
            {
              key: "reported",
              header: "Reported",
              render: (v) => formatDate(v.createdAt),
            },
            {
              key: "references",
              header: "References",
              render: (v) => (
                <div className="space-y-1 text-sm">
                  <p>
                    Homeowner:{" "}
                    {v.homeownerId
                      ? (homeownerNameById.get(v.homeownerId) ?? v.homeownerId)
                      : "-"}
                  </p>
                  <p>Unit: {v.unitId ?? "-"}</p>
                </div>
              ),
            },
            {
              key: "evidence",
              header: "Evidence",
              render: (v) => <EvidenceList keys={v.photoKeys ?? []} />,
            },
            {
              key: "history",
              header: "History",
              className: "max-w-xs",
              render: (v) => <ViolationHistory violation={v} />,
            },
          ]}
          renderActions={
            canWriteGovernance
              ? (v) => (
                  <div className="space-y-3">
                    <PhotoUpload violation={v} communityId={communityId} />
                    <StatusSelect violation={v} communityId={communityId} />
                  </div>
                )
              : undefined
          }
        />
      )}
    </PageContainer>
  );
}
