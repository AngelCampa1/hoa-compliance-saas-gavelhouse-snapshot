import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getFieldHelp } from "@boardstack/shared";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type {
  ReconciliationMatchRow,
  ReconciliationRow,
  StatementLineRow,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SummaryStat, SummaryStatGrid } from "@/components/ui/stat-card";
import { ConfirmActionDialog } from "@/components/help/ConfirmActionDialog";
import { HelpHint } from "@/components/help/HelpHint";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatStatementAmount } from "@/lib/money";

export { formatStatementAmount };

type Props = {
  reconciliation: ReconciliationRow;
  lines: StatementLineRow[];
  matches?: ReconciliationMatchRow[];
  isLoading: boolean;
  communityId?: string;
};

const EMPTY_MATCHES: ReconciliationMatchRow[] = [];
type MatchDraft = { type: "payment" | "journal"; id: string };

export function ReconcileGrid({
  reconciliation,
  lines,
  matches = EMPTY_MATCHES,
  isLoading,
  communityId = "",
}: Props) {
  const queryClient = useQueryClient();
  const serverMatchesByLineId = useMemo(
    () => new Map(matches.map((match) => [match.statementLineId, match.id])),
    [matches],
  );
  const [matchedLineIds, setMatchedLineIds] = useState<Set<string>>(
    () => new Set(serverMatchesByLineId.keys()),
  );
  const [matchIdsByLineId, setMatchIdsByLineId] = useState<Map<string, string>>(
    () => new Map(serverMatchesByLineId),
  );
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [packUrl, setPackUrl] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [matchDrafts, setMatchDrafts] = useState<Record<string, MatchDraft>>(
    {},
  );

  const deleteMatchMutation = useMutation({
    mutationFn: (matchId: string) =>
      api.bank.deleteMatch(reconciliation.id, matchId, communityId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.bank.reconciliation(reconciliation.id, communityId),
      });
    },
    onError: () => {
      const msg = "We could not remove this match. Please try again.";
      setPersistError(msg);
      toast.error(msg);
    },
  });

  useEffect(() => {
    setMatchedLineIds(new Set(serverMatchesByLineId.keys()));
    setMatchIdsByLineId(new Map(serverMatchesByLineId));
  }, [serverMatchesByLineId]);

  async function handleMatch(lineId: string) {
    setPersistError(null);
    const isCurrentlyMatched = matchedLineIds.has(lineId);

    if (isCurrentlyMatched && reconciliation.id) {
      const matchId = matchIdsByLineId.get(lineId);
      if (!matchId) {
        return;
      }
      try {
        await deleteMatchMutation.mutateAsync(matchId);
      } catch {
        return;
      }
    } else {
      const draft = matchDrafts[lineId] ?? { type: "payment", id: "" };
      const transactionId = draft.id.trim();
      if (!reconciliation.id || !transactionId) {
        return;
      }

      try {
        const result = await api.bank.addMatch(reconciliation.id, {
          communityId,
          statementLineId: lineId,
          paymentId: draft.type === "payment" ? transactionId : null,
          journalLineId: draft.type === "journal" ? transactionId : null,
        });
        const matchId = result.match?.id ?? result.matchId;
        if (!matchId) {
          const msg = "We could not save this match. Please try again.";
          setPersistError(msg);
          toast.error(msg);
          return;
        }
        toast.success("Line matched.");
        setMatchIdsByLineId((prev) => {
          const next = new Map(prev);
          next.set(lineId, matchId);
          return next;
        });
      } catch {
        const msg = "We could not save this match. Please try again.";
        setPersistError(msg);
        toast.error(msg);
        return;
      }
    }

    setMatchedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
        setMatchIdsByLineId((prevIds) => {
          const nextIds = new Map(prevIds);
          nextIds.delete(lineId);
          return nextIds;
        });
      } else {
        next.add(lineId);
      }
      return next;
    });
  }

  function updateMatchDraft(lineId: string, draft: Partial<MatchDraft>) {
    setMatchDrafts((prev) => ({
      ...prev,
      [lineId]: { ...(prev[lineId] ?? { type: "payment", id: "" }), ...draft },
    }));
  }

  async function handleFinalize() {
    setFinalizeError(null);
    setIsFinalizing(true);
    try {
      await api.bank.finalizeReconciliation(reconciliation.id, communityId);
      setPackUrl("finalized");
      void queryClient.invalidateQueries({
        queryKey: qk.bank.reconciliation(reconciliation.id, communityId),
      });
      toast.success("Reconciliation finalized.");
    } catch {
      const msg =
        "We could not finalize this reconciliation. Please try again.";
      setFinalizeError(msg);
      toast.error(msg);
    } finally {
      setIsFinalizing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const matchedTotal = lines
    .filter((l) => matchedLineIds.has(l.id))
    .reduce((sum, l) => sum + l.amountCents, 0);
  const unmatchedTotal = lines
    .filter((l) => !matchedLineIds.has(l.id))
    .reduce((sum, l) => sum + l.amountCents, 0);
  const balanceTotal = lines.reduce((sum, l) => sum + l.amountCents, 0);
  const matchedCount = lines.filter((line) =>
    matchedLineIds.has(line.id),
  ).length;
  const unmatchedCount = Math.max(lines.length - matchedCount, 0);
  const isReady = lines.length > 0 && unmatchedCount === 0;
  const unmatchedLineLabel = unmatchedCount === 1 ? "line" : "lines";

  return (
    <div className="space-y-4">
      {!reconciliation.id && (
        <Alert variant="warning">
          Your matches are not saved yet. If you leave this page, they will be
          lost.
        </Alert>
      )}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Status:</span>
        <Badge
          variant={
            reconciliation.status === "finalized" ? "success" : "warning"
          }
        >
          {reconciliation.status}
        </Badge>
      </div>
      <SummaryStatGrid>
        <SummaryStat
          label="Matched"
          value={formatStatementAmount(matchedTotal)}
          detail={`${matchedCount} of ${lines.length} lines matched`}
          tone={matchedCount > 0 ? "success" : "default"}
        />
        <SummaryStat
          label="Unmatched"
          value={formatStatementAmount(unmatchedTotal)}
          detail={`${unmatchedCount} ${unmatchedLineLabel} need review`}
          tone={unmatchedCount === 0 ? "success" : "warning"}
        />
        <SummaryStat
          label="Balance Delta"
          value={formatStatementAmount(balanceTotal)}
          detail="Total statement activity"
          tone={balanceTotal === 0 ? "success" : "info"}
        />
        <SummaryStat
          label="Readiness"
          value={isReady ? "Ready" : `${matchedCount} of ${lines.length} ready`}
          detail={
            isReady ? "All lines matched" : "Match all lines before finalizing"
          }
          tone={isReady ? "success" : "warning"}
        />
      </SummaryStatGrid>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Match</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{line.postedDate}</TableCell>
              <TableCell>{line.description}</TableCell>
              <TableCell className="text-right font-mono">
                {formatStatementAmount(line.amountCents)}
              </TableCell>
              <TableCell>
                {matchedLineIds.has(line.id) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleMatch(line.id)}
                    disabled={deleteMatchMutation.isPending}
                    title="Remove this match"
                    className="text-success hover:text-success/90"
                  >
                    <Badge variant="success">Matched</Badge>
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      aria-label={`Match type for ${line.description}`}
                      className="min-h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                      value={matchDrafts[line.id]?.type ?? "payment"}
                      onChange={(event) =>
                        updateMatchDraft(line.id, {
                          type: event.target.value as MatchDraft["type"],
                        })
                      }
                    >
                      <option value="payment">Payment</option>
                      <option value="journal">Journal</option>
                    </select>
                    <Input
                      aria-label={`Transaction ID for ${line.description}`}
                      className="min-h-9 sm:w-44"
                      placeholder="Transaction ID"
                      value={matchDrafts[line.id]?.id ?? ""}
                      onChange={(event) =>
                        updateMatchDraft(line.id, { id: event.target.value })
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleMatch(line.id)}
                      disabled={
                        deleteMatchMutation.isPending ||
                        !(matchDrafts[line.id]?.id ?? "").trim()
                      }
                    >
                      Match
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {persistError && <Alert variant="destructive">{persistError}</Alert>}
      {finalizeError && <Alert variant="destructive">{finalizeError}</Alert>}
      {packUrl && <Alert variant="success">Reconciliation finalized.</Alert>}
      {reconciliation.status === "open" && (
        <div className="flex items-center gap-2">
          <ConfirmActionDialog
            trigger={
              <Button type="button" disabled={isFinalizing || !isReady}>
                {isFinalizing ? "Finalizing…" : "Finalize Reconciliation"}
              </Button>
            }
            title="Finalize this reconciliation?"
            description="Only finalize after every line is matched. You cannot undo this. We save the finalized record for board review."
            confirmLabel="Finalize reconciliation"
            onConfirm={() => void handleFinalize()}
            disabled={isFinalizing || !isReady}
          />
          {getFieldHelp("reconcile.finalize") && (
            <HelpHint help={getFieldHelp("reconcile.finalize")!} />
          )}
        </div>
      )}
    </div>
  );
}
