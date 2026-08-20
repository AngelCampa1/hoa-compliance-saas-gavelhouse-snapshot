import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";
import { trackDashboardEvent } from "@/lib/analytics";
import { reportUserFacingError } from "@/lib/sentry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ResetPasswordSearch = {
  token?: string;
};

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();

  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword) {
      setError("Password is required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!token) {
      setError("Invalid or missing reset token. Request a new reset link.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await authClient.resetPassword({
        newPassword,
        token,
      });
      if (authError) {
        trackDashboardEvent("password_reset_failed", {
          failure_type: "api_error",
          source: "reset_password",
        });
        setError(authError.message ?? "Password reset failed.");
        return;
      }
      trackDashboardEvent("password_reset_completed", {
        source: "reset_password",
      });
      setSuccess(true);
    } catch (err) {
      trackDashboardEvent("password_reset_failed", {
        failure_type: "api_error",
        source: "reset_password",
      });
      setError(
        reportUserFacingError(
          err,
          "We could not reset your password. Please try again.",
          { tags: { source: "reset-password" } },
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background p-6">
      <BrandLogo className="h-10 w-auto" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            Choose a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                We saved your new password. Sign in to continue.
              </p>
              <Link
                to="/login"
                className="block text-sm underline text-primary hover:opacity-80"
              >
                Back to sign in
              </Link>
            </div>
          ) : !token ? (
            <div className="space-y-4 text-center">
              <Alert variant="destructive">
                <AlertDescription>
                  This reset link is invalid or has expired.
                </AlertDescription>
              </Alert>
              <Link
                to="/forgot-password"
                className="block text-sm underline text-primary hover:opacity-80"
              >
                Request a new reset link
              </Link>
              <Link
                to="/login"
                className="block text-sm underline text-primary hover:opacity-80"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {loading ? "Saving…" : "Set new password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
