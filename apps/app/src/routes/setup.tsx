import {
  createFileRoute,
  redirect,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth";
import { api } from "@/lib/api";
import { reportUserFacingError } from "@/lib/sentry";
import {
  getPageHelpForRoute,
  HOMEOWNER_CSV_TEMPLATE,
  RESERVE_STUDY_CSV_TEMPLATE,
} from "@boardstack/shared";
import { CheckCircle2, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { StateSelect } from "@/components/ui/state-select";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";
import { BrandLogo } from "@/components/brand-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { qk } from "@/lib/query-keys";
import { trackDashboardEvent } from "@/lib/analytics";
import type { RouterContext } from "./__root";

export const Route = createFileRoute("/setup")({
  beforeLoad: ({ context }: { context: RouterContext }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  component: SetupPage,
});

const step0Schema = z.object({
  name: z.string().min(1, "Community name is required").max(256),
  state: z
    .string()
    .regex(/^[A-Z]{2}$/, "Select a state")
    .optional()
    .or(z.literal("")),
});

const step1Schema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "treasurer", "secretary", "viewer"]),
});

type Step0Values = z.infer<typeof step0Schema>;
type Step1Values = z.infer<typeof step1Schema>;

const WIZARD_STEPS = [
  { label: "Community basics" },
  { label: "Board member invites", stepIndex: 1 },
  { label: "Homeowner roster", stepIndex: 2 },
  { label: "Reserve fund", stepIndex: 3 },
];

const SETUP_STEP_KEYS = [
  "community_basics",
  "board_member_invites",
  "homeowner_roster",
  "reserve_fund",
] as const;

function SetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();

  const [step, setStep] = useState(0);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [skippedSteps, setSkippedSteps] = useState<Set<number>>(new Set());
  const trackedStepRef = useRef<Set<number>>(new Set());
  const trackedCompletionRef = useRef(false);
  const pageHelp = getPageHelpForRoute("/setup");

  const { data: communitiesData, isError } = useQuery({
    queryKey: qk.communities.list(),
    queryFn: () => api.communities.list(),
    enabled: !!session,
  });

  const communities = communitiesData?.communities ?? [];

  useEffect(() => {
    if (communitiesData && communities.length > 0 && step === 0) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [communitiesData, step, communities.length, navigate]);

  function trackSetupStep(
    stepIndex: number,
    skipped: boolean,
    trackedCommunityId = communityId,
  ) {
    if (trackedStepRef.current.has(stepIndex)) return;
    trackedStepRef.current.add(stepIndex);

    const eventProperties = {
      step: SETUP_STEP_KEYS[stepIndex] ?? "unknown",
      step_index: stepIndex,
      skipped,
      source: "setup_wizard",
      ...(trackedCommunityId ? { community_id: trackedCommunityId } : {}),
    };

    trackDashboardEvent("setup_step_completed", eventProperties);
  }

  useEffect(() => {
    if (step !== 4 || trackedCompletionRef.current) return;
    trackedCompletionRef.current = true;

    trackDashboardEvent("setup_completed", {
      source: "setup_wizard",
      ...(communityId ? { community_id: communityId } : {}),
      completed_count: WIZARD_STEPS.length - skippedSteps.size,
      skipped_count: skippedSteps.size,
      total_count: WIZARD_STEPS.length,
    });
  }, [communityId, skippedSteps, step]);

  function handleSkip(stepIndex: number) {
    trackSetupStep(stepIndex, true);
    setSkippedSteps((prev) => new Set(prev).add(stepIndex));
    setStep(stepIndex + 1);
  }

  // While communities load — or when a returning member with a community lands
  // here and is about to be sent to the dashboard — show a skeleton instead of
  // flashing the "Create your community" form for a frame.
  const isResolvingMembership =
    !isError &&
    (communitiesData === undefined || (communities.length > 0 && step === 0));

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="border-b h-14 flex items-center px-6">
          <BrandLogo className="h-9 w-auto" />
        </div>
        <div className="flex-1 flex items-start justify-center px-4 pt-8 pb-16">
          <div className="w-full max-w-lg">
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                We could not load your setup. Refresh the page to try again.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </div>
    );
  }

  if (isResolvingMembership) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="border-b h-14 flex items-center px-6">
          <BrandLogo className="h-9 w-auto" />
        </div>
        <div className="flex-1 flex items-start justify-center px-4 pt-8 pb-16">
          <div
            className="w-full max-w-lg space-y-4"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="sr-only">Loading your setup</span>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b h-14 flex items-center px-6">
        <BrandLogo className="h-9 w-auto" />
      </div>
      {step < 4 && (
        <div className="max-w-lg mx-auto w-full px-4 pt-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Step {step + 1} of 4</span>
            <span>{Math.round(((step + 1) / 4) * 100)}%</span>
          </div>
          <Progress
            value={((step + 1) / 4) * 100}
            aria-label="Setup progress"
          />
        </div>
      )}
      <div className="flex-1 flex items-start justify-center px-4 pt-8 pb-16">
        <div className="w-full max-w-lg">
          {pageHelp && (
            <div className="mb-6">
              <PageHelpPanel help={pageHelp} />
            </div>
          )}
          {step === 0 && (
            <Step0CommunityBasics
              onSuccess={(newCommunityId) => {
                trackSetupStep(0, false, newCommunityId);
                setCommunityId(newCommunityId);
                setStep(1);
              }}
              queryClient={queryClient}
            />
          )}
          {step === 1 && (
            <Step1InviteMembers
              communityId={communityId}
              onSuccess={() => {
                trackSetupStep(1, false);
                setStep(2);
              }}
              onSkip={() => handleSkip(1)}
            />
          )}
          {step === 2 && (
            <Step2ImportHomeowners
              communityId={communityId}
              onSuccess={() => {
                trackSetupStep(2, false);
                setStep(3);
              }}
              onSkip={() => handleSkip(2)}
            />
          )}
          {step === 3 && (
            <Step3ReserveFund
              communityId={communityId}
              onSuccess={() => {
                trackSetupStep(3, false);
                setStep(4);
              }}
              onSkip={() => handleSkip(3)}
            />
          )}
          {step === 4 && (
            <Step4Done
              skippedSteps={skippedSteps}
              onGoToDashboard={() => {
                void queryClient.invalidateQueries({
                  queryKey: qk.communities.list(),
                });
                void queryClient.invalidateQueries({
                  queryKey: ["activation"],
                });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Step0CommunityBasics({
  onSuccess,
  queryClient,
}: {
  onSuccess: (communityId: string | null) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const form = useForm<Step0Values>({
    resolver: zodResolver(step0Schema),
    defaultValues: { name: "", state: "" },
  });

  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(values: Step0Values) {
    setIsPending(true);
    try {
      await api.communities.setup({
        name: values.name,
        state: values.state || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: qk.communities.list() });
      const freshData = await queryClient.fetchQuery({
        queryKey: qk.communities.list(),
        queryFn: () => api.communities.list(),
      });
      const newId = freshData.communities[0]?.community.id ?? null;
      onSuccess(newId);
    } catch (err) {
      toast.error(
        reportUserFacingError(
          err,
          "We could not save your community. Please try again.",
          { tags: { source: "setup-community-basics" } },
        ),
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => void handleSubmit(v))}>
        <Card>
          <CardHeader>
            <CardTitle>Set up your community</CardTitle>
            <CardDescription>Tell us about your HOA</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Community name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Sunset Ridge HOA" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <StateSelect
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isPending} className="ml-auto">
              {isPending ? "Saving…" : "Continue →"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}

function Step1InviteMembers({
  communityId,
  onSuccess,
  onSkip,
}: {
  communityId: string | null;
  onSuccess: () => void;
  onSkip: () => void;
}) {
  const form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { email: "", role: "treasurer" },
  });

  const [isPending, setIsPending] = useState(false);
  const [invited, setInvited] = useState<{ email: string; role: string }[]>([]);

  async function handleSubmit(values: Step1Values) {
    if (!communityId) {
      toast.error("No community found. Please refresh and try again.");
      return;
    }
    setIsPending(true);
    try {
      await api.communities.invite(communityId, values.email, values.role);
      setInvited((prev) => [
        ...prev,
        { email: values.email, role: values.role },
      ]);
      form.reset({ email: "", role: "treasurer" });
      toast.success(`Invite sent to ${values.email}.`);
    } catch (err) {
      toast.error(
        reportUserFacingError(
          err,
          "We could not send that invite. Please try again.",
          { tags: { source: "setup-invite-member" } },
        ),
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => void handleSubmit(v))}>
        <Card>
          <CardHeader>
            <CardTitle>Invite board members</CardTitle>
            <CardDescription>
              Add other board members so they can log in and help manage the
              community.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="member@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger aria-label="Member role">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="treasurer">Treasurer</SelectItem>
                      <SelectItem value="secretary">Secretary</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" variant="outline" disabled={isPending}>
              {isPending ? "Sending…" : "Send invite →"}
            </Button>
            {invited.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">
                  Invited so far
                </p>
                <ul className="space-y-1">
                  {invited.map((member) => (
                    <li
                      key={member.email}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span data-ph-mask>{member.email}</span>
                      <Badge variant="secondary" className="text-xs">
                        {member.role}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2 justify-between">
            <Button type="button" variant="outline" onClick={onSkip}>
              Skip for now
            </Button>
            <Button type="button" onClick={onSuccess}>
              Continue →
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}

function Step2ImportHomeowners({
  communityId,
  onSuccess,
  onSkip,
}: {
  communityId: string | null;
  onSuccess: () => void;
  onSkip: () => void;
}) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [sampleCsvUrl, setSampleCsvUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([HOMEOWNER_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    setSampleCsvUrl(url);
    return () => URL.revokeObjectURL(url);
  }, []);

  async function handleImport() {
    if (!pendingFile) return;
    if (!communityId) {
      toast.error("No community found. Please refresh and try again.");
      return;
    }
    setIsPending(true);
    try {
      const text = await pendingFile.text();
      await api.governance.homeowners.import(communityId, text);
      onSuccess();
    } catch (err) {
      toast.error(
        reportUserFacingError(
          err,
          "We could not import those homeowners. Check the CSV and try again.",
          { tags: { source: "setup-homeowner-import" } },
        ),
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import homeowner roster</CardTitle>
        <CardDescription>
          Upload your community&apos;s member list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <FileDropZone
          accept=".csv"
          onFile={setPendingFile}
          label="Drop your roster CSV here"
          sublabel="or click to browse"
          disabled={isPending}
        />
        {pendingFile && (
          <p className="text-sm text-muted-foreground">
            Selected: <span data-ph-mask>{pendingFile.name}</span>
          </p>
        )}
        {sampleCsvUrl && (
          <a
            href={sampleCsvUrl}
            download="homeowners-template.csv"
            className="text-sm text-primary underline underline-offset-2 hover:no-underline"
          >
            Download sample CSV template
          </a>
        )}
        {!pendingFile && !isPending && (
          <p className="text-xs text-muted-foreground">
            Select a file above to import.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex gap-2 justify-between">
        <Button type="button" variant="outline" onClick={onSkip}>
          Skip for now
        </Button>
        <Button
          type="button"
          disabled={!pendingFile || isPending}
          onClick={() => void handleImport()}
        >
          {isPending ? "Importing…" : "Import"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Step3ReserveFund({
  communityId,
  onSuccess,
  onSkip,
}: {
  communityId: string | null;
  onSuccess: () => void;
  onSkip: () => void;
}) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [sampleCsvUrl, setSampleCsvUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([RESERVE_STUDY_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    setSampleCsvUrl(url);
    return () => URL.revokeObjectURL(url);
  }, []);

  async function handleImport() {
    if (!pendingFile) return;
    if (!communityId) {
      toast.error("No community found. Please refresh and try again.");
      return;
    }
    setIsPending(true);
    try {
      const contentType = pendingFile.name.endsWith(".json")
        ? "application/json"
        : "text/csv";
      await api.finance.reserves.importStudy(
        communityId,
        pendingFile,
        contentType,
      );
      onSuccess();
    } catch (err) {
      toast.error(
        reportUserFacingError(
          err,
          "We could not import that reserve study. Check the file and try again.",
          { tags: { source: "setup-reserve-import" } },
        ),
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your reserve fund</CardTitle>
        <CardDescription>
          Import your reserve study to track long-term maintenance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <FileDropZone
          accept=".csv,.json"
          onFile={setPendingFile}
          label="Drop your reserve study (CSV or JSON)"
          sublabel="or click to browse"
          disabled={isPending}
        />
        {pendingFile && (
          <p className="text-sm text-muted-foreground">
            Selected: <span data-ph-mask>{pendingFile.name}</span>
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          List one component per row. Add its useful life, remaining life,
          replacement cost, and current reserve. We can&apos;t read PDF files.
          Copy the numbers into the sample, then save it as CSV.
        </p>
        {sampleCsvUrl && (
          <a
            href={sampleCsvUrl}
            download="reserve-study-template.csv"
            className="text-sm text-primary underline underline-offset-2 hover:no-underline"
          >
            Download sample reserve study (CSV)
          </a>
        )}
        {!pendingFile && !isPending && (
          <p className="text-xs text-muted-foreground">
            Select a file above to import.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex gap-2 justify-between">
        <Button type="button" variant="outline" onClick={onSkip}>
          Skip for now
        </Button>
        <Button
          type="button"
          disabled={!pendingFile || isPending}
          onClick={() => void handleImport()}
        >
          {isPending ? "Importing…" : "Import"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Step4Done({
  skippedSteps,
  onGoToDashboard,
}: {
  skippedSteps: Set<number>;
  onGoToDashboard: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-6">
        <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">You&apos;re all set!</h2>
          <p className="text-muted-foreground text-sm">
            Your community is ready to go. Here&apos;s a summary of what was set
            up:
          </p>
        </div>
        <ul className="w-full max-w-xs text-left space-y-2">
          {WIZARD_STEPS.map((wizardStep, index) => {
            const isOptional = wizardStep.stepIndex !== undefined;
            const stepIdx = wizardStep.stepIndex ?? 0;
            const wasSkipped = isOptional && skippedSteps.has(stepIdx);
            return (
              <li
                key={index}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  {wasSkipped ? (
                    <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  )}
                  <span className="text-sm">{wizardStep.label}</span>
                </div>
                {wasSkipped && (
                  <Badge variant="secondary" className="text-xs">
                    skipped
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
        <Button asChild onClick={onGoToDashboard}>
          <Link to="/dashboard">Go to dashboard &rarr;</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
