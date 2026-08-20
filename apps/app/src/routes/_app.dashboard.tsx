import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { authClient } from "@/lib/auth";
import { api } from "@/lib/api";
import { trackDashboardEvent } from "@/lib/analytics";
import type { ActivationRow } from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { qk } from "@/lib/query-keys";
import {
  ACTIVATION_CHECKLIST,
  getPageHelpForRoute,
  type ActivationStep,
} from "@boardstack/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { HelpCallout } from "@/components/help/HelpCallout";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";
import { Building2, CheckCircle2, Circle, LifeBuoy, Send } from "lucide-react";

const STEP_ROUTES: Record<ActivationStep, string> = {
  roster_imported: "/governance/homeowners",
  reserve_populated: "/finance/reserves",
  compliance_acknowledged: "/finance/reserves",
  dues_batch_configured: "/finance/dues",
};

const STEP_TO_KEY: Record<ActivationStep, keyof ActivationRow> = {
  roster_imported: "rosterImported",
  reserve_populated: "reservePopulated",
  compliance_acknowledged: "complianceAcknowledged",
  dues_batch_configured: "dueBatchConfigured",
};

const STEP_ACTION_LABELS: Record<ActivationStep, string> = {
  roster_imported: "Import homeowner roster",
  reserve_populated: "Import reserve study",
  compliance_acknowledged: "Review compliance status",
  dues_batch_configured: "Create dues batch",
};

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: session } = authClient.useSession();
  const { selectedCommunityId } = useCommunity();

  const { data: communitiesData, isLoading: communitiesLoading } = useQuery({
    queryKey: qk.communities.list(),
    queryFn: () => api.communities.list(),
    enabled: !!session,
  });

  const firstCommunity =
    communitiesData?.communities.find(
      (c) => c.community.id === selectedCommunityId,
    )?.community ?? communitiesData?.communities[0]?.community;

  const {
    data: activationData,
    isLoading: activationLoading,
    isError: activationError,
  } = useQuery({
    queryKey: qk.activation.current(firstCommunity?.id ?? ""),
    queryFn: () => api.activation.get(firstCommunity!.id),
    enabled: !!firstCommunity,
  });

  if (communitiesLoading) {
    return (
      <PageContainer variant="form" className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </PageContainer>
    );
  }

  if (!firstCommunity) {
    return (
      <PageContainer variant="form">
        <h1 className="mb-4 text-xl font-semibold">Welcome to Gavelhouse</h1>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border py-16 text-center">
          <Building2
            className="h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="text-lg font-medium">Set up your community</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            You don&apos;t have a community yet. Create one to start managing
            your HOA&apos;s finances, compliance, and governance.
          </p>
          <Button asChild>
            <Link to="/setup">Get started</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const activation = activationData?.activation;
  const pageHelp = getPageHelpForRoute("/dashboard");

  const completedCount = activation
    ? ACTIVATION_CHECKLIST.filter(({ step }) => activation[STEP_TO_KEY[step]])
        .length
    : 0;
  const totalCount = ACTIVATION_CHECKLIST.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const allComplete = activation
    ? ACTIVATION_CHECKLIST.every(({ step }) => activation[STEP_TO_KEY[step]])
    : false;

  const currentStepIndex = activation
    ? ACTIVATION_CHECKLIST.findIndex(
        ({ step }) => !activation[STEP_TO_KEY[step]],
      )
    : 0;
  const currentStep =
    currentStepIndex >= 0 ? ACTIVATION_CHECKLIST[currentStepIndex] : undefined;
  const currentActionLabel = currentStep
    ? STEP_ACTION_LABELS[currentStep.step]
    : "Review dashboard";

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title={`Dashboard - ${firstCommunity.name}`}
        description="Your setup progress and next action."
      />

      <section
        aria-label="Dashboard at a glance"
        className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]"
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>At a glance</CardTitle>
            <CardDescription>
              {activationError
                ? "Setup status is unavailable right now."
                : `${completedCount} of ${totalCount} setup steps complete`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progressPercent} aria-label="Setup progress" />
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Setup
                </p>
                <p className="font-medium">
                  {activationError
                    ? "Unavailable"
                    : `${progressPercent}% complete`}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  State
                </p>
                <p className="font-medium">
                  {firstCommunity.state ?? "State needed"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="md:w-72">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Priority action</CardTitle>
            <CardDescription>
              Do this first to get the most out of Gavelhouse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activationLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : activationError ? (
              <p className="text-sm text-destructive" role="alert">
                We could not load your next step. Refresh the page to try again.
              </p>
            ) : currentStep ? (
              <Button asChild className="w-full">
                <Link to={STEP_ROUTES[currentStep.step]}>
                  {currentActionLabel}
                </Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Setup is complete. Use the sidebar to review finance,
                governance, or reports.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {firstCommunity.state == null && (
        <Alert variant="warning">
          <AlertDescription>
            Your community profile is incomplete. Add your state to enable
            compliance tracking.{" "}
            <Link to="/settings" className="font-medium underline">
              Settings
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Activation checklist</CardTitle>
          <CardDescription>
            Finish these steps to get full use of Gavelhouse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {activationLoading ? (
            ACTIVATION_CHECKLIST.map(({ step }) => (
              <div key={`skeleton-${step}`} className="flex items-start gap-3">
                <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-sm" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ))
          ) : activationError ? (
            <p className="text-sm text-destructive" role="alert">
              We could not load your setup checklist. Refresh the page to try
              again.
            </p>
          ) : allComplete ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2
                className="h-10 w-10 text-emerald-500"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">You&apos;re all set!</p>
              <p className="text-xs text-muted-foreground">
                All setup steps are complete.
              </p>
            </div>
          ) : (
            ACTIVATION_CHECKLIST.map(({ step, label, description }, index) => {
              const completed = activation
                ? !!activation[STEP_TO_KEY[step]]
                : false;
              const isCurrent = index === currentStepIndex;
              const isFuture = index > currentStepIndex;
              return (
                <div
                  key={step}
                  className={`flex items-start gap-3 rounded-md p-2 transition-colors ${
                    isCurrent ? "bg-muted/60 ring-1 ring-border" : ""
                  } ${isFuture ? "opacity-40" : ""}`}
                >
                  {completed ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium leading-snug ${
                        completed ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {description}
                    </p>
                    {isCurrent && (
                      <Link
                        to={STEP_ROUTES[step]}
                        className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                      >
                        Open {STEP_ACTION_LABELS[step]}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <HelpCallout topic="dashboard" />
      <AiCsSupportWidget />
      {pageHelp && <PageHelpPanel help={pageHelp} />}
    </PageContainer>
  );
}

function AiCsSupportWidget() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function sendMessage() {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setError(null);
    const eventProperties = {
      content_length: trimmed.length,
      page_path: window.location.pathname,
      source: "dashboard_widget",
    };
    try {
      const hadSession = sessionId !== null;
      trackDashboardEvent("ai_support_message_sent", {
        ...eventProperties,
        reused_session: hadSession,
      });
      const activeSessionId =
        sessionId ??
        String(
          (
            await api.aiCs.startSession({
              topic: "dashboard",
              pageUrl: window.location.href,
            })
          ).sessionId ?? "",
        );
      if (!activeSessionId) {
        throw new Error("Missing support session");
      }
      setSessionId(activeSessionId);

      const response = await api.aiCs.chat({
        sessionId: activeSessionId,
        message: trimmed,
      });
      const replyAvailable =
        typeof response["reply"] === "string" ||
        typeof response["message"] === "string";
      setReply(getAiCsReply(response));
      trackDashboardEvent("ai_support_reply_received", {
        ...eventProperties,
        reply_available: replyAvailable,
      });
      setMessage("");
    } catch {
      trackDashboardEvent("ai_support_message_failed", {
        ...eventProperties,
        failure_type: "unavailable",
      });
      setError("Support is unavailable right now.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle>Gavelhouse support</CardTitle>
        </div>
        <CardDescription>
          Ask about setup, finance workflows, or governance tasks from inside
          your signed-in dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="grid gap-2 text-sm font-medium">
          Support message
          <textarea
            className="min-h-20 resize-y rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask a Gavelhouse support question"
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Requests stay on the Gavelhouse API and use your dashboard session.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => void sendMessage()}
            disabled={!message.trim() || isSending}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Send
          </Button>
        </div>
        {reply && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            {reply}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function getAiCsReply(response: Record<string, unknown>): string {
  if (typeof response["reply"] === "string") return response["reply"];
  if (typeof response["message"] === "string") return response["message"];
  return "Support received your message.";
}
