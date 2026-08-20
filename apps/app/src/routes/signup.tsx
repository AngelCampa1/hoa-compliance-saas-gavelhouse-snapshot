import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { z } from "zod";
import { knowledgeBase } from "@boardstack/shared";
import {
  authClient,
  getAuthProviders,
  sendVerificationEmail,
} from "@/lib/auth";
import { reportUserFacingError } from "@/lib/sentry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trackDashboardEvent } from "@/lib/analytics";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

const signupSchema = z.object({
  name: z.string().min(1, "Your name is required."),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type SignupValues = z.infer<typeof signupSchema>;

const POST_SIGNUP_DEFAULT = "/setup";
const signupPriceChip = `Flat ${knowledgeBase.marketing.pricing.displayRange.replace(
  " billed annually with",
  " with",
)}`;
const trialDurationLabel = `${knowledgeBase.marketing.offer.guaranteeDays}-day`;

function getPostAuthRedirect(): string | null {
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return null;
  }
  try {
    const parsed = new URL(redirect, window.location.origin);
    if (parsed.pathname === "/login" || parsed.pathname === "/signup") {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function buildPostAuthDestination(): string {
  return getPostAuthRedirect() ?? POST_SIGNUP_DEFAULT;
}

function signupRedirectTarget(): "setup" | "redirect" {
  return getPostAuthRedirect() ? "redirect" : "setup";
}

function isDuplicateSignupError(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already") ||
    normalized.includes("exists") ||
    normalized.includes("in use")
  );
}

function buildLoginLinkSearch(): { redirect?: string } {
  const redirect = getPostAuthRedirect();
  return redirect ? { redirect } : {};
}

function SignupPage() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(
    null,
  );
  const [resendState, setResendState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  useEffect(() => {
    let active = true;
    void getAuthProviders()
      .then((providers) => {
        if (active) {
          setGoogleAvailable(providers.google);
        }
      })
      .catch(() => {
        if (active) {
          setGoogleAvailable(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (confirmationEmail) {
      // Account just created in this session — let the post-submit navigate run.
      return;
    }
    void navigate({
      href: buildPostAuthDestination(),
      replace: true,
    });
  }, [navigate, session, confirmationEmail]);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function handleGoogleSignUp() {
    if (googleAvailable !== true) {
      if (googleAvailable === false) {
        setError("Google sign-in is not configured in this environment.");
        trackDashboardEvent("signup_failed", {
          failure_type: "provider_unavailable",
          method: "google",
          redirect_target: signupRedirectTarget(),
        });
      }
      return;
    }
    setGoogleLoading(true);
    setError(null);
    trackDashboardEvent("signup_started", {
      method: "google",
      redirect_target: signupRedirectTarget(),
    });
    const { error: authError } = await authClient.signIn.social({
      provider: "google",
      callbackURL: buildPostAuthDestination(),
    });
    if (authError) {
      setError(authError.message ?? "Google sign-in failed.");
      trackDashboardEvent("signup_failed", {
        failure_type: "provider_error",
        method: "google",
        redirect_target: signupRedirectTarget(),
      });
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(values: SignupValues) {
    setError(null);
    trackDashboardEvent("signup_started", {
      method: "email",
      redirect_target: signupRedirectTarget(),
    });
    try {
      const { data, error: signUpError } =
        await authClient.signUp.email(values);
      if (signUpError ?? !data) {
        setError(signUpError?.message ?? "Account creation failed.");
        trackDashboardEvent(
          isDuplicateSignupError(signUpError?.message)
            ? "signup_duplicate"
            : "signup_failed",
          {
            failure_type: signUpError ? "auth_error" : "missing_data",
            method: "email",
            redirect_target: signupRedirectTarget(),
          },
        );
        return;
      }
      trackDashboardEvent("signup_completed", {
        method: "email",
        redirect_target: signupRedirectTarget(),
      });
      setConfirmationEmail(values.email);
      setResendState("idle");
      void navigate({ href: buildPostAuthDestination() });
    } catch (err) {
      trackDashboardEvent("signup_failed", {
        failure_type: "exception",
        method: "email",
        redirect_target: signupRedirectTarget(),
      });
      setError(
        reportUserFacingError(
          err,
          "We could not create your account. Please try again.",
          { tags: { source: "signup-account-create" } },
        ),
      );
    }
  }

  async function handleResendConfirmation() {
    if (!confirmationEmail || resendState === "sending") return;
    setResendState("sending");
    try {
      await sendVerificationEmail(confirmationEmail);
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  }

  const submitting = form.formState.isSubmitting;
  const loginLinkSearch = buildLoginLinkSearch();

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex md:w-[45%] lg:w-2/5 flex-col justify-between bg-primary text-primary-foreground p-12 gap-10">
        <BrandLogo className="h-12 w-auto" />

        <div className="space-y-6 max-w-md">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary-foreground/70 uppercase">
            Reserve fund compliance for self-managed boards
          </p>
          <h1 className="text-3xl lg:text-4xl font-semibold leading-tight">
            Boards on a spreadsheet are accepting personal liability they
            probably haven&apos;t read.
          </h1>
          <p className="text-base text-primary-foreground/80 leading-relaxed">
            State statutes require boards to fund, separate, and report reserves
            to specific standards. QuickBooks doesn&apos;t. Gavelhouse is the
            compliance-first operating record.
          </p>

          <div className="rounded-lg border border-primary-foreground/15 bg-primary-foreground/5 p-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary-foreground/60 uppercase mb-2">
              What changes
            </p>
            <p className="text-sm text-primary-foreground/90 leading-relaxed">
              Reserve fund and operating cash stop commingling. Audit packs stop
              being a quarter-end fire drill.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <SalesChip eyebrow="SETUP" title="Guided 4-step setup" />
          <SalesChip eyebrow="REPORTS" title="Audit-ready exports" />
          <SalesChip eyebrow="PRICING" title={signupPriceChip} />
        </div>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center bg-background p-6">
        <div className="flex items-center gap-2.5 mb-6 md:hidden">
          <BrandLogo className="h-10 w-auto" />
        </div>

        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold leading-tight">
            Create your Gavelhouse account
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start your {trialDurationLabel} free trial. No credit card required.
          </p>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="mt-6 space-y-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your name</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          className="pr-10"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-pressed={showPassword}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <FormDescription>At least 8 characters.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {confirmationEmail && (
                <Alert
                  variant="success"
                  icon={<MailCheck className="h-4 w-4" />}
                >
                  <div className="text-sm">
                    <span className="block font-medium">Check your email</span>
                    <span className="block">
                      We sent a confirmation link to {confirmationEmail}. You
                      can keep going while it is pending.
                    </span>
                    <span className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleResendConfirmation()}
                        disabled={resendState === "sending"}
                      >
                        {resendState === "sending" && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Resend confirmation
                      </Button>
                      {resendState === "sent" && (
                        <span className="text-xs text-muted-foreground">
                          Confirmation email sent.
                        </span>
                      )}
                      {resendState === "error" && (
                        <span className="text-xs font-medium text-destructive">
                          We could not resend the confirmation email.
                        </span>
                      )}
                    </span>
                  </div>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || googleLoading}
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create account
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    or
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void handleGoogleSignUp()}
                disabled={
                  googleLoading || submitting || googleAvailable !== true
                }
              >
                {googleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 mr-2"
                    aria-hidden="true"
                  >
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                Continue with Google
              </Button>
              {googleAvailable === false && (
                <p className="text-xs text-center text-muted-foreground">
                  Google sign-in is unavailable in this environment. Create your
                  account with email and password instead.
                </p>
              )}

              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{" "}
                <Link
                  to="/login"
                  search={loginLinkSearch}
                  className="underline"
                >
                  Sign in
                </Link>
              </p>
            </form>
          </Form>

          <div className="mt-8 flex items-center justify-between text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
            <span>Encrypted session</span>
            <span>{trialDurationLabel} trial</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SalesChip({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="rounded-md border border-primary-foreground/15 bg-primary-foreground/5 p-3">
      <p className="text-[10px] font-semibold tracking-[0.18em] text-primary-foreground/60 uppercase">
        {eyebrow}
      </p>
      <p className="mt-1 text-xs text-primary-foreground/90 leading-snug">
        {title}
      </p>
    </div>
  );
}
