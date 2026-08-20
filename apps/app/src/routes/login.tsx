import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { authClient, getAuthProviders } from "@/lib/auth";
import { trackDashboardEvent } from "@/lib/analytics";
import { reportUserFacingError } from "@/lib/sentry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

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

function buildSignupLinkSearch(): { redirect?: string } {
  const redirect = getPostAuthRedirect();
  return redirect ? { redirect } : {};
}

function LoginPage() {
  const navigate = useNavigate();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const signupLinkSearch = buildSignupLinkSearch();

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

    const redirectTo = getPostAuthRedirect();
    if (redirectTo) {
      void navigate({ href: redirectTo, replace: true });
      return;
    }

    void navigate({ to: "/dashboard", replace: true });
  }, [navigate, session]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function handleGoogleSignIn() {
    if (googleAvailable !== true) {
      if (googleAvailable === false) {
        setError("Google sign-in is not configured in this environment.");
      }
      return;
    }
    setGoogleLoading(true);
    setError(null);
    const redirectTo = getPostAuthRedirect() ?? "/dashboard";
    trackDashboardEvent("oauth_login_started", {
      has_redirect: redirectTo !== "/dashboard",
      provider: "google",
    });
    try {
      const { error: authError } = await authClient.signIn.social({
        provider: "google",
        callbackURL: redirectTo,
      });
      if (authError) {
        trackDashboardEvent("oauth_login_failed", {
          failure_type: "provider_error",
          has_redirect: redirectTo !== "/dashboard",
          provider: "google",
        });
        setError(authError.message ?? "Google sign-in failed.");
        setGoogleLoading(false);
      }
    } catch {
      trackDashboardEvent("oauth_login_failed", {
        failure_type: "unexpected_error",
        has_redirect: redirectTo !== "/dashboard",
        provider: "google",
      });
      setError("Google sign-in failed.");
      setGoogleLoading(false);
    }
  }

  async function onSubmit(values: LoginFormValues) {
    setError(null);
    const hasRedirect = getPostAuthRedirect() !== null;
    trackDashboardEvent("login_started", {
      has_redirect: hasRedirect,
      method: "email",
    });
    try {
      const { data, error: authError } = await authClient.signIn.email(values);
      if (authError) {
        trackDashboardEvent("login_failed", {
          failure_type: "invalid_credentials",
          has_redirect: hasRedirect,
          method: "email",
        });
        setError(authError.message ?? "Invalid email or password.");
        return;
      }
      if (data) {
        trackDashboardEvent("login_completed", {
          has_redirect: hasRedirect,
          method: "email",
        });
        setIsRedirecting(true);
        try {
          await refetchSession?.();
        } catch {
          // The auth cookie is already set after a successful sign-in. Session
          // refresh smooths the redirect, but it should not block navigation.
        }
        const redirectTo = getPostAuthRedirect();
        if (redirectTo) {
          await navigate({ href: redirectTo });
          return;
        }
        await navigate({ to: "/dashboard" });
      }
    } catch (err) {
      setIsRedirecting(false);
      trackDashboardEvent("login_failed", {
        failure_type: "unexpected_error",
        has_redirect: hasRedirect,
        method: "email",
      });
      setError(
        reportUserFacingError(
          err,
          "We could not sign you in. Please try again.",
          { tags: { source: "login-email" } },
        ),
      );
    }
  }

  const loading = form.formState.isSubmitting || isRedirecting;

  return (
    <div className="min-h-screen flex">
      {/* Brand panel, visible md+ */}
      <div className="hidden md:flex md:w-[45%] lg:w-2/5 flex-col items-center justify-center bg-primary text-primary-foreground p-12 gap-8">
        <BrandLogo className="h-16 w-auto" />
        <p className="max-w-xs text-center text-base font-medium text-primary-foreground/90">
          Reserve fund compliance for self-managed boards.
        </p>
        <ul className="space-y-3 text-sm text-primary-foreground/75">
          <li className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-400)]"
              aria-hidden="true"
            />
            State-specific compliance tracking
          </li>
          <li className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-400)]"
              aria-hidden="true"
            />
            True fund accounting, no commingling
          </li>
          <li className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-400)]"
              aria-hidden="true"
            />
            Board-ready reports and audit packs
          </li>
        </ul>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-background p-6">
        {/* Mobile brand mark */}
        <div className="flex items-center gap-2.5 mb-6 md:hidden">
          <BrandLogo className="h-10 w-auto" />
        </div>

        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Sign in to Gavelhouse</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
                noValidate
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
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
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                        <Link
                          to="/forgot-password"
                          className="text-xs text-muted-foreground underline hover:text-foreground"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || googleLoading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isRedirecting
                    ? "Opening dashboard…"
                    : loading
                      ? "Signing in…"
                      : "Sign in"}
                </Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      or
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void handleGoogleSignIn()}
                  disabled={
                    loading || googleLoading || googleAvailable !== true
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
                    Google sign-in is unavailable in this environment. Use email
                    and password instead.
                  </p>
                )}
                <p className="text-sm text-center text-muted-foreground">
                  No account?{" "}
                  <Link
                    to="/signup"
                    search={signupLinkSearch}
                    className="underline"
                  >
                    Start free trial
                  </Link>
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
