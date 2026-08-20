import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { trackDashboardEvent } from "@/lib/analytics";
import { qk } from "@/lib/query-keys";
import { reportUserFacingError } from "@/lib/sentry";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const CANCEL_REASON_LABELS: Record<string, string> = {
  too_expensive: "The price does not fit my budget right now",
  missing_feature: "Missing a feature I need",
  switched_to_manager: "Switching to a manager or another tool",
  board_dissolved: "The board or association no longer needs this",
  bug_or_reliability: "A bug or reliability problem blocked me",
  other: "Something else",
};

type Props = {
  communityId: string;
  open: boolean;
  onClose: () => void;
  /** Optional: the date access ends (currentPeriodEnd ISO string) */
  accessEndsAt?: string | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function CancelReasonModal({
  communityId,
  open,
  onClose,
  accessEndsAt,
}: Props) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const queryClient = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setError(null);
    setIsSubmitting(true);
    trackDashboardEvent("subscription_cancellation_requested", {
      community_id: communityId,
      reason,
    });
    try {
      await api.billing.cancel(communityId, reason, note || undefined);
      trackDashboardEvent("subscription_cancellation_completed", {
        community_id: communityId,
        reason,
      });
      setSuccess(true);
      toast.success("Subscription cancelled.");
      // Invalidate billing and community queries so the UI reflects the
      // cancelled state immediately rather than showing stale "Active" status
      // (HIGH-APP-16).
      void queryClient.invalidateQueries({
        queryKey: qk.billing.status(communityId),
      });
      void queryClient.invalidateQueries({
        queryKey: qk.communities.list(),
      });
    } catch (err) {
      trackDashboardEvent("subscription_cancellation_failed", {
        community_id: communityId,
        failure_type: "api_error",
        reason,
      });
      const msg = reportUserFacingError(
        err,
        "We could not cancel your subscription. Please try again.",
        { tags: { source: "subscription-cancel" } },
      );
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    /* istanbul ignore else -- Radix only calls onOpenChange(true) when
     * uncontrolled; our Dialog is fully controlled via the open prop so the
     * else branch is unreachable in practice. */
    if (!nextOpen) {
      onClose();
      // Reset form state after close animation
      setTimeout(() => {
        setReason("");
        setNote("");
        setError(null);
        setSuccess(false);
      }, 200);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel your subscription</DialogTitle>
          <DialogDescription>
            Tell us why you are cancelling. Your feedback helps us improve.
          </DialogDescription>
        </DialogHeader>
        {success ? (
          <div className="space-y-4">
            <Alert variant="success">
              <AlertDescription>
                Your subscription has been cancelled and will not renew.
                {accessEndsAt && (
                  <>
                    {" "}
                    You have access until{" "}
                    <strong>{formatDate(accessEndsAt)}</strong>.
                  </>
                )}
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason-trigger">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="cancel-reason-trigger">
                  <SelectValue placeholder="Select a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CANCEL_REASON_LABELS).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancel-note">Note (optional)</Label>
              <textarea
                id="cancel-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Any additional feedback…"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-xs text-muted-foreground block text-right">
                {note.length}/500
              </span>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Keep my plan
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isSubmitting || !reason}
              >
                {isSubmitting ? "Cancelling…" : "Cancel my subscription"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
