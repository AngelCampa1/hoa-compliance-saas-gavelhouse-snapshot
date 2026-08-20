import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { userFacingErrorMessage } from "@/lib/sentry";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/invitations/$token/accept")({
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const acceptPath = `/invitations/${token}/accept`;

  const mutation = useMutation({
    mutationFn: () => api.communities.acceptInvitation(token),
    onSuccess: () => {
      void navigate({ to: "/dashboard" });
    },
  });

  // Use a ref to ensure we only attempt the mutation once per mount, regardless
  // of how many times the mutation object reference or session value changes.
  // Depending on the `mutation` object directly caused an infinite retry loop
  // because useMutation returns a new object reference on every render.
  const attemptedRef = useRef(false);
  useEffect(() => {
    if (session?.user?.id && !attemptedRef.current) {
      attemptedRef.current = true;
      mutation.mutate();
    }
    // Stable deps: session user id (primitive) + token (primitive from URL params).
    // The mutation object is intentionally excluded to prevent re-fire loops.
    // (react-hooks/exhaustive-deps is not enabled in this workspace's ESLint
    // config, so no disable directive is needed or valid here.)
  }, [session?.user?.id, token]);

  if (!session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Join your community</CardTitle>
            <CardDescription>
              Sign in or create an account with the invited email address to
              accept this invitation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full"
              onClick={() =>
                void navigate({
                  to: "/login",
                  search: { redirect: acceptPath },
                })
              }
            >
              Sign in
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                void navigate({
                  to: "/signup",
                  search: { redirect: acceptPath },
                })
              }
            >
              Create account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Join community</CardTitle>
          <CardDescription>
            {mutation.isError
              ? "Something went wrong."
              : "Accepting your invitation…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mutation.isPending && (
            <p className="text-sm text-muted-foreground">
              Please wait while we add you to the community.
            </p>
          )}
          {mutation.isError && (
            <div className="space-y-3">
              <p className="text-sm text-destructive" role="alert">
                {userFacingErrorMessage(
                  mutation.error,
                  "We could not accept this invitation. Please try again.",
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => mutation.mutate()}
              >
                Try again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
