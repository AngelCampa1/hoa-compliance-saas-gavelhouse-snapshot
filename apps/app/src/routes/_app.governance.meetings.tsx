import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  GovernanceMeeting,
  GovernanceMotion,
  GovernanceVote,
  GovernanceVoteTally,
} from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { qk } from "@/lib/query-keys";
import { authClient } from "@/lib/auth";
import type { BoardRole } from "@boardstack/shared";
import { roleCan } from "@boardstack/shared";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { reportUserFacingError } from "@/lib/sentry";

export const Route = createFileRoute("/_app/governance/meetings")({
  component: MeetingsPage,
});

const MEETING_TYPE_LABELS: Record<string, string> = {
  annual: "Annual",
  special: "Special",
  board: "Board",
};

const MOTION_STATUS_LABELS: Record<GovernanceMotion["status"], string> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
  tabled: "Tabled",
};

const MOTION_STATUS_VARIANTS: Record<
  GovernanceMotion["status"],
  "default" | "info" | "success" | "warning" | "destructive" | "neutral"
> = {
  pending: "warning",
  passed: "success",
  failed: "destructive",
  tabled: "neutral",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CreateMeetingDialog({
  communityId,
  onClose,
}: {
  communityId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<
    "annual" | "special" | "board"
  >("board");
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.governance.meetings.create({
        communityId,
        title,
        meetingType,
        scheduledAt: new Date(scheduledAt).toISOString(),
        location: location || undefined,
      }),
    onSuccess: () => {
      toast.success("Meeting scheduled.");
      void queryClient.invalidateQueries({
        queryKey: qk.governance.meetings(communityId),
      });
      onClose();
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not schedule this meeting. Please try again.",
          { tags: { source: "meeting-schedule" } },
        ),
      );
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Schedule Meeting</DialogTitle>
        <DialogDescription>
          Add the meeting details the board needs for scheduling and minutes.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="meeting-title">Title</Label>
          <Input
            id="meeting-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Annual General Meeting"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meeting-type">Type</Label>
          <Select
            value={meetingType}
            onValueChange={(v) =>
              setMeetingType(v as "annual" | "special" | "board")
            }
          >
            <SelectTrigger id="meeting-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="special">Special</SelectItem>
              <SelectItem value="board">Board</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meeting-date">Date &amp; Time</Label>
          <Input
            id="meeting-date"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meeting-location">Location (optional)</Label>
          <Input
            id="meeting-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Community center, Room A"
          />
        </div>
        {createMutation.isError && (
          <p className="text-sm text-destructive" role="alert">
            We could not schedule this meeting. Please try again.
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
          disabled={createMutation.isPending || !title.trim() || !scheduledAt}
        >
          {createMutation.isPending ? "Scheduling…" : "Schedule"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function MotionVoteSummary({
  motion,
  canWriteGovernance,
  communityId,
}: {
  motion: GovernanceMotion;
  canWriteGovernance: boolean;
  communityId: string;
}) {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [submittedVote, setSubmittedVote] = useState<GovernanceVote | null>(
    null,
  );
  const { data, isLoading } = useQuery({
    queryKey: qk.governance.motionVotes(motion.id),
    queryFn: () => api.governance.meetings.listVotes(motion.id),
  });

  const voteMutation = useMutation({
    mutationFn: (choice: "yes" | "no" | "abstain") =>
      api.governance.meetings.castVote(motion.id, choice),
    onSuccess: ({ vote }) => {
      toast.success("Vote recorded.");
      setSubmittedVote(vote);
      queryClient.setQueryData<{
        votes: GovernanceVote[];
        tally: GovernanceVoteTally;
      }>(qk.governance.motionVotes(motion.id), (existing) => {
        const votes = existing?.votes ?? [];
        const alreadyRecorded = votes.some(
          (row) => row.voterUserId === vote.voterUserId,
        );
        const tally = { ...(existing?.tally ?? {}) };
        if (!alreadyRecorded) {
          tally[vote.choice] = (tally[vote.choice] ?? 0) + 1;
        }
        return {
          votes: alreadyRecorded ? votes : [...votes, vote],
          tally,
        };
      });
      void queryClient.invalidateQueries({
        queryKey: qk.governance.motionVotes(motion.id),
      });
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not record your vote. Please try again.",
          { tags: { source: "meeting-vote" } },
        ),
      );
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (status: "passed" | "failed" | "tabled") =>
      api.governance.meetings.resolveMotion(motion.id, status),
    onSuccess: () => {
      toast.success("Motion resolved.");
      void queryClient.invalidateQueries({
        queryKey: qk.governance.motions(motion.meetingId),
      });
      void queryClient.invalidateQueries({
        queryKey: qk.governance.meetings(communityId),
      });
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not resolve this motion. Please try again.",
          { tags: { source: "meeting-resolve" } },
        ),
      );
    },
  });

  const tally = data?.tally ?? {};
  const currentUserVote =
    submittedVote ??
    data?.votes.find((vote) => vote.voterUserId === session?.user.id);
  const isPending = motion.status === "pending";

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-medium">{motion.text}</p>
          <Badge variant={MOTION_STATUS_VARIANTS[motion.status]}>
            {MOTION_STATUS_LABELS[motion.status]}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Yes {tally.yes ?? 0}</span>
          <span>No {tally.no ?? 0}</span>
          <span>Abstain {tally.abstain ?? 0}</span>
        </div>
      </div>
      {currentUserVote && (
        <p className="text-xs text-muted-foreground">
          Your vote: {currentUserVote.choice}
        </p>
      )}
      {isPending && canWriteGovernance && !currentUserVote && (
        <div className="flex min-w-0 flex-wrap gap-2">
          {(["yes", "no", "abstain"] as const).map((choice) => (
            <Button
              key={choice}
              variant="outline"
              size="sm"
              onClick={() => voteMutation.mutate(choice)}
              disabled={voteMutation.isPending || isLoading}
              aria-label={`Vote ${choice} on ${motion.text}`}
            >
              Vote {choice}
            </Button>
          ))}
        </div>
      )}
      {isPending && canWriteGovernance && (
        <div className="flex min-w-0 flex-wrap gap-2">
          {(["passed", "failed", "tabled"] as const).map((status) => (
            <Button
              key={status}
              variant="secondary"
              size="sm"
              onClick={() => resolveMutation.mutate(status)}
              disabled={resolveMutation.isPending}
              aria-label={`Mark ${motion.text} ${status}`}
            >
              Mark {status}
            </Button>
          ))}
        </div>
      )}
      {voteMutation.isError && (
        <p className="text-sm text-destructive" role="alert">
          We could not record your vote. Please try again.
        </p>
      )}
      {resolveMutation.isError && !voteMutation.isError && (
        <p className="text-sm text-destructive" role="alert">
          We could not resolve this motion. Please try again.
        </p>
      )}
    </div>
  );
}

function MotionsDialog({
  meeting,
  communityId,
  canWriteGovernance,
}: {
  meeting: GovernanceMeeting;
  communityId: string;
  canWriteGovernance: boolean;
}) {
  const queryClient = useQueryClient();
  const [motionText, setMotionText] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: qk.governance.motions(meeting.id),
    queryFn: () => api.governance.meetings.listMotions(meeting.id),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.governance.meetings.createMotion(meeting.id, motionText.trim()),
    onSuccess: () => {
      toast.success("Motion added.");
      setMotionText("");
      void queryClient.invalidateQueries({
        queryKey: qk.governance.motions(meeting.id),
      });
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not add this motion. Please try again.",
          { tags: { source: "meeting-add-motion" } },
        ),
      );
    },
  });

  const motions = data?.motions ?? [];

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Motions and Votes - {meeting.title}</DialogTitle>
        <DialogDescription>
          Add motions, record votes, and close pending items.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        {canWriteGovernance && (
          <div className="space-y-2">
            <Label htmlFor="new-motion">New motion</Label>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Input
                id="new-motion"
                value={motionText}
                onChange={(event) => setMotionText(event.target.value)}
                placeholder="e.g. Approve roof contract"
              />
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !motionText.trim()}
              >
                {createMutation.isPending ? "Adding…" : "Add motion"}
              </Button>
            </div>
            {createMutation.isError && (
              <p className="text-sm text-destructive" role="alert">
                We could not add this motion. Please try again.
              </p>
            )}
          </div>
        )}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : motions.length === 0 ? (
          <EmptyState
            title="No motions recorded"
            description="Add the first motion for this meeting."
          />
        ) : (
          <div className="space-y-3">
            {motions.map((motion) => (
              <MotionVoteSummary
                key={motion.id}
                motion={motion}
                canWriteGovernance={canWriteGovernance}
                communityId={communityId}
              />
            ))}
          </div>
        )}
      </div>
    </DialogContent>
  );
}

function RecordMinutesDialog({
  meeting,
  communityId,
  onClose,
}: {
  meeting: GovernanceMeeting;
  communityId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(meeting.minutesText ?? "");
  const [finalize, setFinalize] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.governance.meetings.recordMinutes(meeting.id, text, finalize),
    onSuccess: () => {
      toast.success(finalize ? "Minutes finalized." : "Minutes saved.");
      void queryClient.invalidateQueries({
        queryKey: qk.governance.meetings(communityId),
      });
      onClose();
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not save these minutes. Please try again.",
          { tags: { source: "meeting-minutes" } },
        ),
      );
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Record Minutes - {meeting.title}</DialogTitle>
        <DialogDescription>
          Save a draft or finalize the official meeting record.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="minutes-text">Minutes</Label>
          <textarea
            id="minutes-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter meeting minutes…"
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={finalize}
            onCheckedChange={(checked) => setFinalize(checked === true)}
          />
          Finalize minutes (cannot be undone)
        </label>
        {mutation.isError && (
          <p className="text-sm text-destructive" role="alert">
            We could not save these minutes. Please try again.
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
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !text.trim()}
        >
          {mutation.isPending
            ? "Saving…"
            : finalize
              ? "Finalize"
              : "Save draft"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function MeetingsPage() {
  return (
    <TierUpgradeGate
      feature="governance-workflows"
      featureName="Board meetings"
    >
      <MeetingsContent />
    </TierUpgradeGate>
  );
}

function MeetingsContent() {
  const { selectedCommunityId, selectedCommunityRole } = useCommunity();
  const communityId = selectedCommunityId ?? "";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [minutesMeeting, setMinutesMeeting] =
    useState<GovernanceMeeting | null>(null);
  const [motionsMeeting, setMotionsMeeting] =
    useState<GovernanceMeeting | null>(null);
  const canWriteGovernance = roleCan(
    selectedCommunityRole as BoardRole | null,
    "governance:write",
  );

  const { data, isLoading } = useQuery({
    queryKey: qk.governance.meetings(communityId),
    queryFn: () => api.governance.meetings.list(communityId),
    enabled: !!communityId,
  });

  const meetings: GovernanceMeeting[] = data?.meetings ?? [];
  const draftMinutesCount = meetings.filter(
    (meeting) => meeting.minutesText && !meeting.minutesFinalizedAt,
  ).length;
  const finalizedCount = meetings.filter(
    (meeting) => meeting.minutesFinalizedAt,
  ).length;
  const nextMinutes = meetings.find((meeting) => !meeting.minutesFinalizedAt);

  return (
    <PageContainer>
      <PageHeader
        title="Board Meetings"
        description="Schedule meetings, add motions, record votes, and finalize minutes."
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            Schedule meeting
          </Button>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {dialogOpen && communityId && (
          <CreateMeetingDialog
            communityId={communityId}
            onClose={() => setDialogOpen(false)}
          />
        )}
      </Dialog>

      <Dialog
        open={!!minutesMeeting}
        onOpenChange={(open) => {
          if (!open) setMinutesMeeting(null);
        }}
      >
        {minutesMeeting && communityId && (
          <RecordMinutesDialog
            meeting={minutesMeeting}
            communityId={communityId}
            onClose={() => setMinutesMeeting(null)}
          />
        )}
      </Dialog>

      <Dialog
        open={!!motionsMeeting}
        onOpenChange={(open) => {
          if (!open) setMotionsMeeting(null);
        }}
      >
        {motionsMeeting && communityId && (
          <MotionsDialog
            meeting={motionsMeeting}
            communityId={communityId}
            canWriteGovernance={canWriteGovernance}
          />
        )}
      </Dialog>

      <SummaryStatGrid>
        <SummaryStat label="Total meetings" value={meetings.length} />
        <SummaryStat
          label="Needs attention"
          value={meetings.length - finalizedCount}
          tone={meetings.length - finalizedCount > 0 ? "warning" : "default"}
          detail={
            draftMinutesCount > 0
              ? `${draftMinutesCount} draft minutes`
              : meetings.length - finalizedCount > 0
                ? "Minutes not finalized"
                : "All minutes finalized"
          }
        />
        <SummaryStat
          label="Finalized"
          value={finalizedCount}
          tone={finalizedCount > 0 ? "success" : "default"}
          detail="Meetings with finalized minutes"
        />
        <SummaryStat
          label="Next action"
          value={nextMinutes ? "Record minutes" : "Schedule meeting"}
          detail={nextMinutes?.title ?? "No open minutes"}
        />
      </SummaryStatGrid>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="No meetings yet"
          description="Add your first board meeting to get started."
        />
      ) : (
        <ResponsiveDataList
          ariaLabel="Board meetings"
          rows={meetings}
          getRowKey={(m) => m.id}
          columns={[
            {
              key: "title",
              header: "Title",
              primary: true,
              render: (m) => m.title,
            },
            {
              key: "type",
              header: "Type",
              render: (m) =>
                MEETING_TYPE_LABELS[m.meetingType] ?? m.meetingType,
            },
            {
              key: "date",
              header: "Date",
              render: (m) => formatDate(m.scheduledAt),
            },
            {
              key: "location",
              header: "Location",
              render: (m) => m.location ?? "-",
            },
            {
              key: "minutes",
              header: "Minutes",
              render: (m) =>
                m.minutesFinalizedAt
                  ? "Finalized"
                  : m.minutesText
                    ? "Draft"
                    : "-",
            },
          ]}
          renderActions={(m) => (
            <div className="flex min-w-0 flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMotionsMeeting(m)}
              >
                Motions and votes
              </Button>
              {!m.minutesFinalizedAt ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMinutesMeeting(m)}
                >
                  {m.minutesText ? "Edit minutes" : "Record minutes"}
                </Button>
              ) : null}
            </div>
          )}
        />
      )}
    </PageContainer>
  );
}
