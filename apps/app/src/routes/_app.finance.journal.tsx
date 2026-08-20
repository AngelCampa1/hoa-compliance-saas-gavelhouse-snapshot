import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { qk } from "@/lib/query-keys";
import type { AccountRow, JournalEntryRow, JournalLineRow } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Combobox } from "@/components/ui/combobox";
import type { ComboboxOption } from "@/components/ui/combobox";
import { postEntryBlockReason } from "@/lib/journal-entry";
import { centsToDecimal } from "@/lib/money";
import { BookOpen, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { reportUserFacingError } from "@/lib/sentry";

export const Route = createFileRoute("/_app/finance/journal")({
  component: FinanceJournalPage,
});

type LineFormRow = {
  id: string;
  accountId: string;
  debitCents: string;
  creditCents: string;
};

function blankLine(): LineFormRow {
  return {
    id: crypto.randomUUID(),
    accountId: "",
    debitCents: "",
    creditCents: "",
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function parseCents(value: string): number {
  const parsed = Math.round(parseFloat(value) * 100);
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

type FundBalance = {
  debit: number;
  credit: number;
};

function computeBalances(
  lines: LineFormRow[],
  accounts: AccountRow[],
): { operating: FundBalance; reserve: FundBalance } {
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const operating: FundBalance = { debit: 0, credit: 0 };
  const reserve: FundBalance = { debit: 0, credit: 0 };

  for (const line of lines) {
    const account = accountMap.get(line.accountId);
    if (!account) continue;
    const debit = parseCents(line.debitCents);
    const credit = parseCents(line.creditCents);
    if (account.fundType === "operating") {
      operating.debit += debit;
      operating.credit += credit;
    } else {
      reserve.debit += debit;
      reserve.credit += credit;
    }
  }

  return { operating, reserve };
}

function isBalanced(balance: FundBalance): boolean {
  const hasActivity = balance.debit > 0 || balance.credit > 0;
  if (!hasActivity) return true;
  return balance.debit === balance.credit;
}

function EntryComposer({
  communityId,
  accounts,
  onSuccess,
}: {
  communityId: string;
  accounts: AccountRow[];
  onSuccess: () => void;
}) {
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<LineFormRow[]>([blankLine(), blankLine()]);
  const [commingleError, setCommingleError] = useState<string | null>(null);

  const balances = computeBalances(lines, accounts);
  const operatingImbalance =
    balances.operating.debit - balances.operating.credit;
  const reserveImbalance = balances.reserve.debit - balances.reserve.credit;
  const operatingHasActivity =
    balances.operating.debit > 0 || balances.operating.credit > 0;
  const reserveHasActivity =
    balances.reserve.debit > 0 || balances.reserve.credit > 0;
  const operatingBalanced = isBalanced(balances.operating);
  const reserveBalanced = isBalanced(balances.reserve);
  const entryBalanced = operatingBalanced && reserveBalanced;

  const hasPostableLine = lines.some(
    (l) =>
      l.accountId &&
      (parseCents(l.debitCents) > 0 || parseCents(l.creditCents) > 0),
  );
  const blockReason = postEntryBlockReason({
    entryDate,
    memo,
    hasPostableLine,
    entryBalanced,
  });

  const accountOptions: ComboboxOption[] = accounts.map((a) => ({
    value: a.id,
    label: `${a.code}: ${a.name} (${a.fundType})`,
  }));

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.journal.create({
        communityId,
        entryDate,
        memo,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debitCents: parseCents(l.debitCents),
          creditCents: parseCents(l.creditCents),
        })),
      }),
    onSuccess: () => {
      toast.success("Journal entry posted.");
      setMemo("");
      setLines([blankLine(), blankLine()]);
      setCommingleError(null);
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not post this journal entry. Please try again.",
          { tags: { source: "journal-post" } },
        ),
      );
      setCommingleError(err.message);
    },
  });

  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, field: keyof LineFormRow, value: string) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    );
  }

  const isCommingling =
    commingleError !== null &&
    (commingleError.includes("commingling") ||
      commingleError.includes("balance independently") ||
      commingleError.includes("fund separation"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Journal Entry</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="journal-entry-date">Date</Label>
            <Input
              id="journal-entry-date"
              aria-label="Journal date"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="journal-entry-memo">
              Memo{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id="journal-entry-memo"
              aria-label="Journal memo"
              required
              aria-required="true"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="What is this entry for?"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Lines</span>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => (
              <div
                key={line.id}
                className="grid gap-2 rounded-md border p-3 md:grid-cols-12 md:items-center md:border-0 md:p-0"
              >
                <div className="md:col-span-5">
                  <Combobox
                    aria-label={`Line ${index + 1} account`}
                    options={accountOptions}
                    value={line.accountId || undefined}
                    onChange={(v) => updateLine(index, "accountId", v)}
                    placeholder="Select account…"
                    searchPlaceholder="Search accounts…"
                  />
                </div>
                <div className="md:col-span-3">
                  <Input
                    aria-label={`Line ${index + 1} debit amount`}
                    placeholder="Debit"
                    value={line.debitCents}
                    onChange={(e) =>
                      updateLine(index, "debitCents", e.target.value)
                    }
                  />
                </div>
                <div className="md:col-span-3">
                  <Input
                    aria-label={`Line ${index + 1} credit amount`}
                    placeholder="Credit"
                    value={line.creditCents}
                    onChange={(e) =>
                      updateLine(index, "creditCents", e.target.value)
                    }
                  />
                </div>
                <div className="flex justify-end md:col-span-1 md:justify-center">
                  {lines.length > 2 && (
                    <Button
                      type="button"
                      aria-label={`Remove line ${index + 1}`}
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLine(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={addLine}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add line
          </Button>
        </div>

        {/* Imbalance indicators */}
        {operatingHasActivity && !operatingBalanced && (
          <Alert variant="destructive">
            <AlertTitle>Operating fund is out of balance</AlertTitle>
            <AlertDescription>
              Off by ${centsToDecimal(Math.abs(operatingImbalance))}. Debits and
              credits must be equal.
            </AlertDescription>
          </Alert>
        )}
        {reserveHasActivity && !reserveBalanced && (
          <Alert variant="destructive">
            <AlertTitle>Reserve fund is out of balance</AlertTitle>
            <AlertDescription>
              Off by ${centsToDecimal(Math.abs(reserveImbalance))}. Debits and
              credits must be equal.
            </AlertDescription>
          </Alert>
        )}

        {commingleError && isCommingling && (
          <Alert variant="destructive">
            <AlertTitle>Fund mixing not allowed</AlertTitle>
            <AlertDescription>
              This entry mixes operating and reserve funds. Gavelhouse keeps
              these funds separate. Split this into two entries, one per fund.
            </AlertDescription>
          </Alert>
        )}
        {commingleError && !isCommingling && (
          <Alert variant="destructive">
            <AlertDescription>
              We could not post this entry. Check the amounts and try again.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || blockReason !== null}
            aria-describedby={blockReason ? "post-entry-hint" : undefined}
          >
            {mutation.isPending ? "Posting…" : "Post Entry"}
          </Button>
          {blockReason && (
            <p id="post-entry-hint" className="text-sm text-muted-foreground">
              {blockReason}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EntryRow({
  entry,
}: {
  entry: JournalEntryRow & { lines: JournalLineRow[] };
}) {
  const [expanded, setExpanded] = useState(false);

  const totalDebit = entry.lines.reduce((sum, l) => sum + l.debitCents, 0);
  const detailId = `entry-detail-${entry.id}`;

  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        className="w-full flex items-center gap-4 py-3 cursor-pointer hover:bg-muted/50 px-2 rounded text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-sm text-muted-foreground w-28 shrink-0">
          {formatDate(entry.entryDate)}
        </span>
        <span className="text-sm flex-1">{entry.memo}</span>
        <span className="text-sm text-muted-foreground">
          ${centsToDecimal(totalDebit)}
        </span>
        <span className="text-xs text-muted-foreground">
          {entry.lines.length} lines
        </span>
      </button>
      {expanded && (
        <div id={detailId} className="pl-6 pb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="text-left pb-1 pr-4">
                  Account
                </th>
                <th scope="col" className="text-left pb-1 pr-4">
                  Fund
                </th>
                <th scope="col" className="text-right pb-1 pr-4">
                  Debit
                </th>
                <th scope="col" className="text-right pb-1">
                  Credit
                </th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line) => (
                <tr key={line.id}>
                  <td className="pr-4 py-0.5">
                    {line.accountCode}: {line.accountName}
                  </td>
                  <td className="pr-4 py-0.5 capitalize">{line.fundType}</td>
                  <td className="pr-4 py-0.5 text-right">
                    {line.debitCents > 0
                      ? `$${centsToDecimal(line.debitCents)}`
                      : ""}
                  </td>
                  <td className="py-0.5 text-right">
                    {line.creditCents > 0
                      ? `$${centsToDecimal(line.creditCents)}`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FinanceJournalPage() {
  const queryClient = useQueryClient();
  const { selectedCommunityId } = useCommunity();

  const firstCommunity = selectedCommunityId
    ? { id: selectedCommunityId }
    : undefined;

  const { data: accountsData } = useQuery({
    queryKey: qk.finance.accounts(firstCommunity?.id ?? ""),
    queryFn: () => api.finance.accounts.list(firstCommunity!.id),
    enabled: !!firstCommunity,
  });

  const {
    data: journalData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: qk.finance.journal(firstCommunity?.id ?? ""),
    queryFn: () => api.finance.journal.list(firstCommunity!.id),
    enabled: !!firstCommunity,
  });

  if (!firstCommunity) {
    return (
      <PageContainer variant="form">
        <PageHeader title="Journal" />
        <p className="text-muted-foreground">No community set up yet.</p>
      </PageContainer>
    );
  }

  const accounts = accountsData?.accounts ?? [];
  const entries = (journalData?.entries ?? []) as Array<
    JournalEntryRow & { lines: JournalLineRow[] }
  >;

  return (
    <PageContainer>
      <PageHeader
        title="Journal"
        description="Post and review journal entries for your funds."
      />

      <EntryComposer
        communityId={firstCommunity.id}
        accounts={accounts}
        onSuccess={() => {
          void queryClient.invalidateQueries({
            queryKey: qk.finance.journal(firstCommunity.id),
          });
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Entry Log</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          ) : isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                We could not load your journal entries. Refresh the page to try
                again.
              </AlertDescription>
            </Alert>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-5 w-5" />}
              title="No journal entries yet"
              description="Use the form above to post your first journal entry."
            />
          ) : (
            <div>
              {entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
