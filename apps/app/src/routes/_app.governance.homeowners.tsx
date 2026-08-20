import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFieldHelp,
  getPageHelpForRoute,
  HOMEOWNER_CSV_TEMPLATE,
  roleCan,
  tierAllowsFeature,
} from "@boardstack/shared";
import {
  api,
  type HomeownerImportResult,
  type HomeownerImportSkippedRow,
} from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { reportUserFacingError } from "@/lib/sentry";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { HelpCallout } from "@/components/help/HelpCallout";
import { FriendlyEmptyState } from "@/components/help/FriendlyEmptyState";
import { HelpHint } from "@/components/help/HelpHint";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { AddHomeownerDialog } from "@/components/governance/AddHomeownerDialog";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";

export const Route = createFileRoute("/_app/governance/homeowners")({
  component: HomeownersPage,
});

function HomeownersPage() {
  const queryClient = useQueryClient();
  const { selectedCommunityId, selectedCommunityRole, selectedCommunityTier } =
    useCommunity();
  const communityId = selectedCommunityId ?? "";
  const canWriteHomeowners =
    selectedCommunityRole == null ||
    roleCan(selectedCommunityRole as never, "homeowner:write");
  const canUseOwnerOperations =
    selectedCommunityTier == null ||
    tierAllowsFeature(selectedCommunityTier as never, "owner-operations");
  const canMutateHomeowners = canWriteHomeowners && canUseOwnerOperations;
  const { isLoading: communitiesLoading } = useQuery({
    queryKey: ["communities"],
    queryFn: () => api.communities.list(),
  });

  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importResult, setImportResult] =
    useState<HomeownerImportResult | null>(null);
  const [portalLinks, setPortalLinks] = useState<
    Record<string, { url: string; expiresAt: string; sent: boolean }>
  >({});
  const [generatingFor, setGeneratingFor] = useState<{
    id: string;
    mode: "generate" | "send";
  } | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [sampleCsvUrl, setSampleCsvUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([HOMEOWNER_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    setSampleCsvUrl(url);
    return () => URL.revokeObjectURL(url);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.governance.homeowners(communityId, search || undefined),
    queryFn: () =>
      api.governance.homeowners.list(communityId, search || undefined),
    enabled: !!communityId,
  });

  const importMutation = useMutation({
    mutationFn: (text: string) =>
      api.governance.homeowners.import(communityId, text),
    onSuccess: (result) => {
      setImportResult(result);
      const skippedCount = result.skipped.length;
      const summary =
        skippedCount > 0
          ? `Imported ${String(result.created)} homeowners. ${String(skippedCount)} skipped.`
          : `Imported ${String(result.created)} homeowners.`;
      toast.success(summary);
      void queryClient.invalidateQueries({
        queryKey: qk.governance.homeowners(communityId),
      });
      void queryClient.invalidateQueries({
        queryKey: qk.activation.current(communityId),
      });
    },
    onError: (e) => toast.error(`Import failed: ${e.message}`),
  });

  const homeowners = data?.homeowners ?? [];
  const pageHelp = getPageHelpForRoute("/governance/homeowners");

  async function generatePortalLink(homeownerId: string, sendEmail = false) {
    if (!communityId) return;
    setGeneratingFor({
      id: homeownerId,
      mode: sendEmail ? "send" : "generate",
    });
    setPortalError(null);
    try {
      const { token, expiresAt, sent } =
        await api.governance.portal.createSession(communityId, homeownerId, {
          sendEmail,
        });
      const url = `${window.location.origin}/portal?token=${encodeURIComponent(token)}`;
      setPortalLinks((prev) => ({
        ...prev,
        [homeownerId]: { url, expiresAt, sent },
      }));
      if (sendEmail && sent) {
        toast.success("Portal link sent to homeowner's email.");
      } else if (!sendEmail) {
        toast.success(
          "Portal link generated. Copy and share it with the homeowner.",
        );
      } else {
        setPortalError(
          "Portal email could not be sent. A link was generated; copy or share it manually.",
        );
      }
    } catch (err) {
      setPortalError(
        reportUserFacingError(
          err,
          "We could not generate the portal link. Please try again.",
          { tags: { source: "homeowner-portal-link" } },
        ),
      );
    } finally {
      setGeneratingFor(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Homeowner Directory"
        description="Names, contact details, and owner portal links for your community."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddOpen(true)}
              disabled={!canMutateHomeowners}
            >
              Add homeowner
            </Button>
            <Button
              size="sm"
              onClick={() => setImportOpen(!importOpen)}
              disabled={!canMutateHomeowners}
            >
              {importOpen ? "Cancel import" : "Import roster CSV"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Homeowners
          </p>
          <p className="text-2xl font-semibold">{homeowners.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Portal links
          </p>
          <p className="text-2xl font-semibold">
            {Object.keys(portalLinks).length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Next action
          </p>
          <p className="font-medium">
            {homeowners.length === 0 ? "Import roster CSV" : "Review contacts"}
          </p>
        </div>
      </div>

      {importOpen && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-1">
            <p className="text-sm font-medium">Roster CSV</p>
            {getFieldHelp("homeowners.csv") && (
              <HelpHint help={getFieldHelp("homeowners.csv")!} />
            )}
          </div>
          <FileDropZone
            accept=".csv"
            label="Drop your roster CSV here"
            sublabel="or click to browse"
            disabled={importMutation.isPending}
            onFile={(file) => {
              void file.text().then((text) => importMutation.mutate(text));
            }}
          />
          {sampleCsvUrl && (
            <a
              href={sampleCsvUrl}
              download="homeowners-template.csv"
              className="text-sm text-muted-foreground hover:underline"
            >
              Download sample CSV template
            </a>
          )}
          {importResult && <ImportResultSummary result={importResult} />}
        </div>
      )}

      {!canMutateHomeowners && (
        <Alert variant={canWriteHomeowners ? "info" : "warning"}>
          <AlertDescription>
            {canWriteHomeowners
              ? "Upgrade to Growth to add or edit homeowners."
              : "Your role can view homeowner records but not change them."}
          </AlertDescription>
        </Alert>
      )}

      <Input
        aria-label="Search homeowners"
        placeholder="Search by last name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {portalError && (
        <Alert variant="destructive">
          <AlertDescription>{portalError}</AlertDescription>
        </Alert>
      )}

      {communitiesLoading || isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            We could not load your homeowners. Refresh the page to try again.
          </AlertDescription>
        </Alert>
      ) : homeowners.length === 0 ? (
        <FriendlyEmptyState
          title="No homeowners found"
          reason={
            importOpen
              ? "No homeowners have been imported yet."
              : "Add homeowners one at a time or import your roster as a CSV. You need homeowners before dues and portal links will work."
          }
          nextStep={
            importOpen
              ? "Drop a CSV file above. Start with a few rows if you are unsure."
              : "Import the roster first, then review names and emails before creating dues."
          }
          action={
            !importOpen && (
              <Button size="sm" onClick={() => setImportOpen(true)}>
                Import roster CSV
              </Button>
            )
          }
        />
      ) : (
        <ResponsiveDataList
          ariaLabel="Homeowner directory"
          rows={homeowners}
          getRowKey={(h) => h.id}
          columns={[
            {
              key: "name",
              header: "Name",
              primary: true,
              render: (h) => `${h.firstName} ${h.lastName}`,
            },
            { key: "email", header: "Email", render: (h) => h.email },
            { key: "phone", header: "Phone", render: (h) => h.phone ?? "-" },
            {
              key: "unit",
              header: "Unit",
              render: (h) => h.unitNumber ?? h.unitId ?? "-",
            },
            {
              key: "moveIn",
              header: "Move-in",
              render: (h) => h.moveInDate ?? "-",
            },
          ]}
          renderActions={(h) => (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void generatePortalLink(h.id)}
                  disabled={generatingFor?.id === h.id || !canMutateHomeowners}
                >
                  {generatingFor?.id === h.id &&
                  generatingFor.mode === "generate"
                    ? "Generating…"
                    : "Generate portal link"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void generatePortalLink(h.id, true)}
                  disabled={generatingFor?.id === h.id || !canMutateHomeowners}
                >
                  {generatingFor?.id === h.id && generatingFor.mode === "send"
                    ? "Sending…"
                    : "Send portal email"}
                </Button>
                {getFieldHelp("homeowners.portalLink") && (
                  <HelpHint help={getFieldHelp("homeowners.portalLink")!} />
                )}
              </div>
              {portalLinks[h.id] && (
                <PortalLinkActions
                  email={h.email}
                  expiresAt={portalLinks[h.id].expiresAt}
                  homeownerName={`${h.firstName} ${h.lastName}`}
                  sent={portalLinks[h.id].sent}
                  url={portalLinks[h.id].url}
                />
              )}
            </div>
          )}
        />
      )}

      <HelpCallout topic="homeowners" />
      {pageHelp && <PageHelpPanel help={pageHelp} />}

      <AddHomeownerDialog
        communityId={communityId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          setAddOpen(false);
          void queryClient.invalidateQueries({
            queryKey: qk.governance.homeowners(communityId),
          });
          void queryClient.invalidateQueries({
            queryKey: qk.activation.current(communityId),
          });
        }}
      />
    </PageContainer>
  );
}

const SKIP_REASON_LABELS: Record<HomeownerImportSkippedRow["reason"], string> =
  {
    "duplicate-in-upload": "Duplicate email in this upload",
    "already-exists": "Email already exists in this community",
    invalid: "Invalid row data",
  };

function ImportResultSummary({ result }: { result: HomeownerImportResult }) {
  const { created, skipped } = result;
  return (
    <div className="space-y-2">
      {created > 0 && (
        <p className="text-sm text-success">
          Imported {created} homeowner{created === 1 ? "" : "s"}.
        </p>
      )}
      {skipped.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            {skipped.length} row{skipped.length === 1 ? "" : "s"} skipped (click
            to expand)
          </summary>
          <ul className="mt-1 space-y-0.5 text-destructive">
            {skipped.map((s) => (
              <li key={`${s.row}-${s.reason}`}>
                Row {s.row}
                {s.email ? ` (${s.email})` : ""}. {SKIP_REASON_LABELS[s.reason]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PortalLinkActions({
  email,
  expiresAt,
  homeownerName,
  sent,
  url,
}: {
  email: string | null;
  expiresAt: string;
  homeownerName: string;
  sent: boolean;
  url: string;
}) {
  const expirationDate = expiresAt.slice(0, 10);
  const shareHref =
    email == null
      ? null
      : `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
          "Your Gavelhouse owner portal link",
        )}&body=${encodeURIComponent(
          [
            `Hi ${homeownerName},`,
            "",
            "Use this link to view your owner account:",
            url,
            "",
            `This link expires ${expirationDate}.`,
          ].join("\n"),
        )}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <input
          readOnly
          aria-label="Portal link"
          value={url}
          className="w-48 rounded border bg-muted px-1 py-0.5 text-xs"
        />
        <Button
          size="sm"
          variant="ghost"
          className="px-2 text-xs"
          onClick={() =>
            void navigator.clipboard
              .writeText(url)
              .catch(() => toast.error("Failed to copy link."))
          }
        >
          Copy link
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {sent && <span className="font-medium text-success">Email sent</span>}
        <span>Expires {expirationDate}</span>
        {shareHref && (
          <a
            href={shareHref}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Share portal link with {homeownerName}
          </a>
        )}
      </div>
    </div>
  );
}
