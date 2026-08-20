import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getPageHelpForRoute } from "@boardstack/shared";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { StatementUpload } from "@/components/bank/StatementUpload";
import { formatCents } from "@/components/reports/TrialBalanceTable";
import { useCommunity } from "@/lib/community-context";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";
import { HelpCallout } from "@/components/help/HelpCallout";
import { FriendlyEmptyState } from "@/components/help/FriendlyEmptyState";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/bank/statements")({
  component: BankStatementsPage,
});

function formatStatementDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? isoDate : parsed.toLocaleDateString();
}

function BankStatementsPage() {
  const queryClient = useQueryClient();
  const { selectedCommunityId } = useCommunity();
  const communityId = selectedCommunityId ?? "";

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: qk.finance.accounts(communityId),
    queryFn: () => api.finance.accounts.list(communityId),
    enabled: !!communityId,
  });

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [uploadPending, setUploadPending] = useState(false);

  const accounts = accountsData?.accounts ?? [];
  const resolvedAccountId = selectedAccountId || accounts[0]?.id || "";

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.bank.statements(communityId),
    queryFn: () => api.bank.listStatements(communityId),
    enabled: !!communityId,
  });

  function handleSuccess() {
    toast.success("Statement imported.");
    void queryClient.invalidateQueries({
      queryKey: qk.bank.statements(communityId),
    });
  }

  const statements = data?.statements ?? [];
  const pageHelp = getPageHelpForRoute("/bank/statements");

  return (
    <PageContainer>
      <PageHeader
        title="Bank Statements"
        description="Upload bank statements and reconcile them against your community accounts."
        actions={
          resolvedAccountId ? (
            <Button
              type="submit"
              form="statement-upload-form"
              disabled={uploadPending}
            >
              {uploadPending ? "Importing…" : "Import statement"}
            </Button>
          ) : undefined
        }
      />
      <HelpCallout topic="bankStatements" />
      {pageHelp && <PageHelpPanel help={pageHelp} />}

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : isError ? (
          <div role="alert">
            <FriendlyEmptyState
              title="We could not load your statements"
              reason="Something went wrong while we loaded this page."
              nextStep="Refresh the page to try again."
            />
          </div>
        ) : statements.length === 0 ? (
          <FriendlyEmptyState
            title="No statements yet"
            reason="A statement lets you match your books to the bank."
            nextStep="Pick the account. Enter the start and end balance. Then paste the statement rows below."
            action={
              <Button
                type="submit"
                form="statement-upload-form"
                disabled={uploadPending}
              >
                {uploadPending ? "Importing…" : "Import statement"}
              </Button>
            }
          />
        ) : (
          <ResponsiveDataList
            ariaLabel="Bank statements"
            rows={statements}
            getRowKey={(stmt) => stmt.id}
            actionLabel="Statement actions"
            columns={[
              {
                key: "date",
                header: "Date",
                primary: true,
                render: (stmt) => formatStatementDate(stmt.statementDate),
              },
              {
                key: "beginning",
                header: "Beginning Balance",
                align: "right",
                render: (stmt) => formatCents(stmt.beginningBalanceCents),
              },
              {
                key: "ending",
                header: "Ending Balance",
                align: "right",
                render: (stmt) => formatCents(stmt.endingBalanceCents),
              },
            ]}
            renderActions={(stmt) =>
              stmt.reconciliationId ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    to="/bank/reconcile"
                    search={{ statement: stmt.reconciliationId }}
                  >
                    Reconcile
                  </Link>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  No reconciliation
                </span>
              )
            }
          />
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Import Statement</h2>
        {communityId ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="account-select" className="text-sm font-medium">
                Bank Account
              </label>
              {accountsLoading ? (
                <Skeleton className="h-9 max-w-xs" />
              ) : accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No bank accounts found. Add an account under{" "}
                  <Link to="/finance/accounts" className="underline">
                    Accounts
                  </Link>{" "}
                  first.
                </p>
              ) : (
                <Select
                  value={selectedAccountId || resolvedAccountId}
                  onValueChange={setSelectedAccountId}
                >
                  <SelectTrigger id="account-select" className="max-w-xs">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acct) => (
                      <SelectItem key={acct.id} value={acct.id}>
                        {acct.code} - {acct.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {resolvedAccountId && (
              <StatementUpload
                communityId={communityId}
                accountId={resolvedAccountId}
                onSuccess={handleSuccess}
                submitPlacement="external"
                onPendingChange={setUploadPending}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a community to import a statement.
          </p>
        )}
      </div>
    </PageContainer>
  );
}
