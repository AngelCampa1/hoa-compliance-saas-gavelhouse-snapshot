import { useState } from "react";
import { getFieldHelp } from "@boardstack/shared";
import { api } from "@/lib/api";
import { trackDashboardEvent } from "@/lib/analytics";
import { reportUserFacingError } from "@/lib/sentry";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { HelpHint } from "@/components/help/HelpHint";

export function parseBalanceCents(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (cleaned === "" || isNaN(Number(cleaned))) return null;
  const num = parseFloat(cleaned);
  if (!isFinite(num)) return null;
  return Math.round(num * 100);
}

type Props = {
  communityId: string;
  accountId: string;
  onSuccess: () => void;
  submitPlacement?: "inline" | "external";
  onPendingChange?: (isPending: boolean) => void;
};

export function StatementUpload({
  communityId,
  accountId,
  onSuccess,
  submitPlacement = "inline",
  onPendingChange,
}: Props) {
  const [beginningBalance, setBeginningBalance] = useState("");
  const [endingBalance, setEndingBalance] = useState("");
  const [statementDate, setStatementDate] = useState("");
  const [csv, setCsv] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const beginningBalanceCents = parseBalanceCents(beginningBalance);
    const endingBalanceCents = parseBalanceCents(endingBalance);

    if (beginningBalanceCents === null) {
      trackDashboardEvent("bank_statement_upload_failed", {
        account_id: accountId,
        community_id: communityId,
        failure_type: "validation",
        field: "beginning_balance",
      });
      setError("Invalid beginning balance.");
      return;
    }
    if (endingBalanceCents === null) {
      trackDashboardEvent("bank_statement_upload_failed", {
        account_id: accountId,
        community_id: communityId,
        failure_type: "validation",
        field: "ending_balance",
      });
      setError("Invalid ending balance.");
      return;
    }
    if (!statementDate) {
      trackDashboardEvent("bank_statement_upload_failed", {
        account_id: accountId,
        community_id: communityId,
        failure_type: "validation",
        field: "statement_date",
      });
      setError("Statement date is required.");
      return;
    }
    if (!csv.trim()) {
      trackDashboardEvent("bank_statement_upload_failed", {
        account_id: accountId,
        community_id: communityId,
        failure_type: "validation",
        field: "csv",
      });
      setError("CSV data is required.");
      return;
    }

    setIsLoading(true);
    onPendingChange?.(true);
    try {
      await api.bank.importStatement({
        communityId,
        accountId,
        beginningBalanceCents,
        endingBalanceCents,
        statementDate,
        csv,
      });
      onSuccess();
    } catch (err) {
      const msg = reportUserFacingError(
        err,
        "We could not import this statement. Check the file and try again.",
        { tags: { source: "bank-statement-upload" } },
      );
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
      onPendingChange?.(false);
    }
  }

  return (
    <form
      id="statement-upload-form"
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label htmlFor="stmt-beginning">Beginning Balance</Label>
          {getFieldHelp("bank.beginningBalance") && (
            <HelpHint help={getFieldHelp("bank.beginningBalance")!} />
          )}
        </div>
        <Input
          id="stmt-beginning"
          type="text"
          value={beginningBalance}
          onChange={(e) => setBeginningBalance(e.target.value)}
          placeholder="e.g. $1,234.56"
          required
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label htmlFor="stmt-ending">Ending Balance</Label>
          {getFieldHelp("bank.endingBalance") && (
            <HelpHint help={getFieldHelp("bank.endingBalance")!} />
          )}
        </div>
        <Input
          id="stmt-ending"
          type="text"
          value={endingBalance}
          onChange={(e) => setEndingBalance(e.target.value)}
          placeholder="e.g. $2,345.67"
          required
        />
      </div>
      <DatePicker
        id="stmt-date"
        label="Statement Date"
        value={statementDate}
        onChange={setStatementDate}
      />
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label htmlFor="stmt-csv">CSV Data</Label>
          {getFieldHelp("bank.statementCsv") && (
            <HelpHint help={getFieldHelp("bank.statementCsv")!} />
          )}
        </div>
        <textarea
          id="stmt-csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="Paste CSV content here…"
          rows={6}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {submitPlacement === "inline" && (
        <Button
          type="submit"
          id="statement-upload-trigger"
          disabled={isLoading}
        >
          {isLoading ? "Uploading…" : "Import Statement"}
        </Button>
      )}
    </form>
  );
}
