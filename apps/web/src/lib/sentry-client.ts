import * as Sentry from "@sentry/browser";

type Primitive = string | number | boolean | null | undefined;

export type ErrorCaptureContext = {
  tags?: Record<string, Primitive>;
  extra?: Record<string, unknown>;
};

// Access import.meta.env directly so vi.stubEnv() can override values in
// tests. Vite replaces import.meta.env.* at build time.
export const SENTRY_DSN = import.meta.env.PUBLIC_SENTRY_DSN ?? "";

export const IGNORED_ERRORS: Array<string | RegExp> = [
  /Failed to fetch dynamically imported module/,
  "ChunkLoadError",
  /Loading chunk \d+ failed/,
  /^Load failed$/,
  /^Failed to fetch$/,
  /(?:jsxDEV|jsx|jsxs) is not a function/,
  /evaluating '.*\.pluginConfig'/,
  /Invalid call to runtime\.sendMessage\(\)/,
  /^options is not defined$/,
  /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/,
];

export const DENY_URLS: Array<string | RegExp> = [
  /webkit-masked-url:\/\/hidden/,
  /extensions\//,
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari-extension:\/\//,
];

export function initSentry(siteName: string): void {
  // Access import.meta.env directly so vi.stubEnv() can override values in
  // tests. Vite replaces import.meta.env.* at build time; the cast is only
  // needed to satisfy tsc for the non-standard PROD/MODE env vars.
  if (!import.meta.env.PROD) return;

  const dsn = import.meta.env.PUBLIC_SENTRY_DSN ?? "";
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      import.meta.env.PUBLIC_SENTRY_ENVIRONMENT ??
      import.meta.env.MODE ??
      "production",
    release: import.meta.env.PUBLIC_SENTRY_RELEASE,
    sendDefaultPii: false,
    ignoreErrors: IGNORED_ERRORS,
    denyUrls: DENY_URLS,
    initialScope: {
      tags: { site: siteName },
    },
  });
}

export function shouldCaptureStatus(status: number): boolean {
  return status >= 500;
}

function getErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return undefined;
}

export function shouldCaptureError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === undefined || shouldCaptureStatus(status);
}

export function captureException(
  error: unknown,
  context: ErrorCaptureContext = {},
): string | undefined {
  if (!shouldCaptureError(error)) return undefined;

  let eventId: string | undefined;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context.tags ?? {})) {
      if (value !== undefined) scope.setTag(key, String(value));
    }
    for (const [key, value] of Object.entries(context.extra ?? {})) {
      scope.setExtra(key, value);
    }
    eventId = Sentry.captureException(error);
  });
  return eventId;
}

export function captureHttpError(
  status: number,
  context: ErrorCaptureContext = {},
): string | undefined {
  if (!shouldCaptureStatus(status)) return undefined;

  return captureException(new Error(`HTTP ${status}`), {
    tags: { ...context.tags, status },
    extra: context.extra,
  });
}

export function formatUserError(message: string, trackingId?: string): string {
  return trackingId ? `${message} Tracking ID: ${trackingId}` : message;
}

type TrackingIdLike = {
  trackingId?: unknown;
};

function getTrackingId(error: unknown): string | undefined {
  if (error && typeof error === "object" && "trackingId" in error) {
    const trackingId = (error as TrackingIdLike).trackingId;
    return typeof trackingId === "string" && trackingId.length > 0
      ? trackingId
      : undefined;
  }

  return undefined;
}

export function reportUserFacingError(
  error: unknown,
  fallbackMessage: string,
  context: ErrorCaptureContext = {},
): string {
  const trackingId = getTrackingId(error);
  if (trackingId) {
    return formatUserError(fallbackMessage, trackingId);
  }

  if (!shouldCaptureError(error)) {
    return error instanceof Error ? error.message : fallbackMessage;
  }

  const eventId = captureException(error, context);
  return formatUserError(fallbackMessage, eventId);
}
