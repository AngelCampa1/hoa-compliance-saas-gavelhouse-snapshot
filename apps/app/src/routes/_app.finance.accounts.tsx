import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { qk } from "@/lib/query-keys";
import type { AccountRow } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { reportUserFacingError, userFacingErrorMessage } from "@/lib/sentry";

export const Route = createFileRoute("/_app/finance/accounts")({
  component: FinanceAccountsPage,
});

function EditAccountDialog({
  account,
  communityId,
  onClose,
  onSuccess,
}: {
  account: AccountRow;
  communityId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(account.name);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.finance.accounts.update(account.id, {
        communityId,
        name,
      }),
    onSuccess: () => {
      toast.success("Account updated.");
      onSuccess();
      onClose();
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not update this account. Please try again.",
          { tags: { source: "finance-account-update" } },
        ),
      );
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit Account</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-account-code">Code</Label>
          <Input id="edit-account-code" value={account.code} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-account-name">Name</Label>
          <Input
            id="edit-account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Account name"
          />
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>
            Type:{" "}
            <span className="capitalize font-medium text-foreground">
              {account.accountType}
            </span>
          </span>
          <span>
            Fund:{" "}
            <span className="capitalize font-medium text-foreground">
              {account.fundType}
            </span>
          </span>
        </div>
        {updateMutation.isError && (
          <p className="text-sm text-destructive" role="alert">
            {userFacingErrorMessage(
              updateMutation.error,
              "We could not update this account. Please try again.",
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
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || !name.trim()}
        >
          {updateMutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AccountsTable({
  accounts,
  communityId: _communityId,
  onEdit,
}: {
  accounts: AccountRow[];
  communityId: string;
  onEdit: (account: AccountRow) => void;
}) {
  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-5 w-5" />}
        title="No accounts in this fund"
        description="Add accounts to track income and expenses for this fund."
      />
    );
  }

  return (
    <ResponsiveDataList
      ariaLabel="Chart of accounts"
      rows={accounts}
      getRowKey={(account) => account.id}
      actionLabel="Account actions"
      columns={[
        {
          key: "code",
          header: "Code",
          render: (account) => (
            <span className="font-mono">{account.code}</span>
          ),
        },
        {
          key: "name",
          header: "Name",
          primary: true,
          render: (account) => account.name,
        },
        {
          key: "type",
          header: "Type",
          render: (account) => (
            <span className="capitalize">{account.accountType}</span>
          ),
        },
        {
          key: "fund",
          header: "Fund",
          render: (account) => (
            <Badge
              variant={account.fundType === "reserve" ? "info" : "neutral"}
            >
              {account.fundType}
            </Badge>
          ),
        },
        {
          key: "active",
          header: "Active",
          render: (account) =>
            account.active ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="neutral">Inactive</Badge>
            ),
        },
      ]}
      renderActions={(account) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(account)}
          aria-label={`Edit ${account.name}`}
        >
          Edit
        </Button>
      )}
    />
  );
}

function FinanceAccountsPage() {
  const queryClient = useQueryClient();
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const { selectedCommunityId } = useCommunity();

  const firstCommunity = selectedCommunityId
    ? { id: selectedCommunityId }
    : undefined;

  const {
    data: accountsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: qk.finance.accounts(firstCommunity?.id ?? ""),
    queryFn: () => api.finance.accounts.list(firstCommunity!.id),
    enabled: !!firstCommunity,
  });

  if (!firstCommunity) {
    return (
      <PageContainer variant="form">
        <PageHeader title="Chart of Accounts" />
        <p className="text-muted-foreground">No community set up yet.</p>
      </PageContainer>
    );
  }

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Chart of Accounts" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Chart of Accounts" />
        <Alert variant="destructive">
          <AlertDescription>
            We could not load your accounts. Refresh the page to try again.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  const allAccounts = accountsData?.accounts ?? [];
  const operatingAccounts = allAccounts.filter(
    (a) => a.fundType === "operating",
  );
  const reserveAccounts = allAccounts.filter((a) => a.fundType === "reserve");

  return (
    <PageContainer>
      <PageHeader
        title="Chart of Accounts"
        description="Your operating and reserve fund accounts."
      />

      <Card>
        <CardHeader>
          <CardTitle>Operating Fund</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountsTable
            accounts={operatingAccounts}
            communityId={firstCommunity.id}
            onEdit={setEditingAccount}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reserve Fund</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountsTable
            accounts={reserveAccounts}
            communityId={firstCommunity.id}
            onEdit={setEditingAccount}
          />
        </CardContent>
      </Card>

      <Dialog
        open={editingAccount !== null}
        onOpenChange={(open) => {
          if (!open) setEditingAccount(null);
        }}
      >
        {editingAccount && (
          <EditAccountDialog
            account={editingAccount}
            communityId={firstCommunity.id}
            onClose={() => setEditingAccount(null)}
            onSuccess={() => {
              void queryClient.invalidateQueries({
                queryKey: qk.finance.accounts(firstCommunity.id),
              });
            }}
          />
        )}
      </Dialog>
    </PageContainer>
  );
}
