import { useMemo } from "react";
import { AiCsWidget } from "@ventora/ai-cs/react";
import { getApiBase } from "@/lib/api";

/** Fixed Ventora app id for this product (Gavelhouse / internal boardstack). */
const APP_ID = "gavelhouse";

/** Gavelhouse brand preset shipped in @ventora/ai-cs adapts widget theming. */
const BRAND = { id: "boardstack" } as const;

interface AiCsSupportWidgetProps {
  /** Authenticated dashboard user id, or undefined while the session loads. */
  userId: string | undefined;
  /** Current route path, surfaced to the assistant for context. */
  currentPath: string;
}

/**
 * Mounts the Ventora AI-CS support widget on the authenticated app surface.
 *
 * The dashboard SPA cannot hold the HMAC client-assertion secret, so the widget
 * talks to the same-origin authenticated BFF at `<api-origin>/api/ai-cs`, which
 * gates on the better-auth session and signs each forwarded request to the
 * AI-CS Worker. We therefore pass only `baseUrl` + `credentials: "include"`
 * (the session cookie rides along cross-origin) and never a `signRequest`.
 *
 * Rendering is gated to authenticated users: when there is no `userId` (the
 * anonymous/loading state) the widget is not mounted at all, so it never opens
 * a session for a user the BFF would reject anyway.
 */
export function AiCsSupportWidget({
  userId,
  currentPath,
}: AiCsSupportWidgetProps) {
  // Memoized so the underlying session manager stays stable across renders
  // (the api origin is constant for the app's lifetime).
  const api = useMemo(
    () =>
      ({
        baseUrl: `${getApiBase()}/api/ai-cs`,
        credentials: "include",
      }) as const,
    [],
  );

  const session = useMemo(
    () => ({ appId: APP_ID, userId: userId ?? "", currentPath }),
    [userId, currentPath],
  );

  if (!userId) return null;

  return <AiCsWidget api={api} session={session} brand={BRAND} />;
}
