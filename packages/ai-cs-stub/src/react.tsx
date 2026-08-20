/**
 * Stand-in for the private `@ventora/ai-cs` package. See ../README.md.
 *
 * The prop types mirror the subset that `apps/app` actually passes, so the call
 * site in `ai-cs-support-widget.tsx` typechecks unchanged. The component renders
 * nothing: the AI-CS Worker it would talk to is not part of this repository.
 */

export interface AiCsWidgetApi {
  /** Origin of the authenticated BFF that proxies to the AI-CS Worker. */
  readonly baseUrl: string;
  /** Forwarded to fetch so the session cookie rides along cross-origin. */
  readonly credentials: RequestCredentials;
}

export interface AiCsWidgetSession {
  /** Ventora app id for the product mounting the widget. */
  readonly appId: string;
  /** Authenticated user id, empty while the session loads. */
  readonly userId: string;
  /** Current route path, surfaced to the assistant for context. */
  readonly currentPath: string;
}

export interface AiCsWidgetBrand {
  /** Brand preset id used for widget theming. */
  readonly id: string;
}

export interface AiCsWidgetProps {
  readonly api: AiCsWidgetApi;
  readonly session: AiCsWidgetSession;
  readonly brand: AiCsWidgetBrand;
}

export function AiCsWidget(_props: AiCsWidgetProps): null {
  return null;
}
