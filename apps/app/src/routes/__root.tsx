import { createRootRoute, Outlet, Link } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth";
import type { Session } from "@/lib/auth";
import { captureUnexpectedError, reportUserFacingError } from "@/lib/sentry";
import { AlertCircle, Home, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export interface RouterContext {
  session: Session | null;
  /** True when the initial session fetch threw a network/fetch error. */
  sessionCheckFailed?: boolean;
}

function RootErrorComponent({ error }: { error: unknown }) {
  const [message, setMessage] = useState("Something went wrong.");

  useEffect(() => {
    setMessage(
      reportUserFacingError(
        error,
        "Gavelhouse hit an unexpected error. Refresh the page and try again.",
        { tags: { source: "router" } },
      ),
    );
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <div className="flex justify-center">
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              Go home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <p className="text-6xl font-bold text-muted-foreground">404</p>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            The page you&#39;re looking for doesn&#39;t exist.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Go home
          </Link>
        </Button>
      </div>
    </div>
  );
}

function RootComponent() {
  const { sessionCheckFailed } = Route.useLoaderData();
  return (
    <>
      {sessionCheckFailed && (
        <Alert variant="default" className="rounded-none border-x-0 border-t-0">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Connection issue</AlertTitle>
          <AlertDescription>
            We couldn&apos;t reach the server. You may need to reload or
            re-login once your connection is restored.
          </AlertDescription>
        </Alert>
      )}
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  );
}

export const Route = createRootRoute({
  // Single session fetch per navigation: beforeLoad populates context (used by
  // child route guards), loader reads the same result for the banner flag.
  // Previously both called getSession() independently, doubling auth round-trips
  // on every route change (HIGH-APP-6).
  beforeLoad: async () => {
    try {
      const { data: session } = await authClient.getSession();
      return { session: session ?? null, sessionCheckFailed: false };
    } catch (err) {
      captureUnexpectedError(err, { tags: { source: "root-beforeLoad" } });
      return { session: null, sessionCheckFailed: true };
    }
  },
  loader: ({
    context,
  }: {
    context: { session: unknown; sessionCheckFailed: boolean };
  }) => {
    return {
      sessionCheckFailed: context.sessionCheckFailed,
      session: context.session,
    };
  },
  errorComponent: ({ error }: { error: unknown }) => (
    <RootErrorComponent error={error} />
  ),
  notFoundComponent: NotFoundComponent,
  component: RootComponent,
});
