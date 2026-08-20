import * as Sentry from "@sentry/react";

type Primitive = string | number | boolean | null | undefined;

export type ErrorCaptureContext = {
  tags?: Record<string, Primitive>;
  extra?: Record<string, unknown>;
};

type StatusLike = {
  status?: unknown;
};

type SentryQueryString = string | Array<[string, string]> | undefined;

function getStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as StatusLike).status;
    return typeof status === "number" ? status : undefined;
  }

  return undefined;
}

export function shouldCaptureError(error: unknown): boolean {
  const status = getStatus(error);
  if (status !== undefined) return status >= 500;
  return true;
}

const SENSITIVE_QUERY_PARAMS = new Set([
  "token",
  "code",
  "invitation",
  "invite",
  "resettoken",
]);

function isSensitiveQueryParam(key: string): boolean {
  return SENSITIVE_QUERY_PARAMS.has(key.toLowerCase());
}

function scrubQueryParamValue(key: string, value: string): string {
  if (isSensitiveQueryParam(key)) return "[Filtered]";
  return (scrubUrl(value) ?? value).replace(/%5BFiltered%5D/gi, "[Filtered]");
}

function scrubParsedUrl(url: URL): boolean {
  let changed = false;
  const params = new URLSearchParams();
  url.searchParams.forEach((paramValue, key) => {
    const scrubbedValue = scrubQueryParamValue(key, paramValue);
    if (scrubbedValue !== paramValue) {
      changed = true;
    }
    params.append(key, scrubbedValue);
  });
  if (changed) {
    url.search = params.toString();
  }

  const scrubbedPath = url.pathname.replace(
    /\/invitations\/[^/]+\/accept\b/,
    "/invitations/[Filtered]/accept",
  );
  if (scrubbedPath !== url.pathname) {
    url.pathname = scrubbedPath;
    changed = true;
  }

  return changed;
}

function scrubUrl(value: string | undefined): string | undefined {
  if (value === undefined) return value;
  try {
    const url = new URL(value);
    const changed = scrubParsedUrl(url);
    return changed ? url.toString() : value;
  } catch {
    if (value.startsWith("/")) {
      const url = new URL(value, "https://gavelhouse.local");
      const changed = scrubParsedUrl(url);
      return changed ? `${url.pathname}${url.search}${url.hash}` : value;
    }

    return value
      .replace(
        /([?&](?:token|code|invitation|invite|resetToken)=)[^&#]*/gi,
        "$1[Filtered]",
      )
      .replace(
        /\/invitations\/[^/?#]+\/accept\b/g,
        "/invitations/[Filtered]/accept",
      );
  }
}

function scrubUnknownUrl(value: unknown): unknown {
  return typeof value === "string" ? scrubUrl(value) : value;
}

function scrubQueryString(value: SentryQueryString): SentryQueryString {
  if (value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(([key, queryValue]) => [
      key,
      scrubQueryParamValue(key, queryValue),
    ]) as typeof value;
  }
  const params = new URLSearchParams(value);
  const scrubbedParams = new URLSearchParams();
  let changed = false;
  params.forEach((queryValue, key) => {
    const scrubbedValue = scrubQueryParamValue(key, queryValue);
    if (scrubbedValue !== queryValue) {
      changed = true;
    }
    scrubbedParams.append(key, scrubbedValue);
  });
  return changed ? scrubbedParams.toString() : value;
}

function scrubDataUrls(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) return data;
  const scrubbed = { ...data };
  for (const key of ["url", "to", "from", "href"]) {
    if (key in scrubbed) {
      scrubbed[key] = scrubUnknownUrl(scrubbed[key]);
    }
  }
  return scrubbed;
}

export function scrubSensitiveUrls(
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent {
  return {
    ...event,
    request: event.request
      ? {
          ...event.request,
          url: scrubUrl(event.request.url),
          query_string: scrubQueryString(
            event.request.query_string as SentryQueryString,
          ),
        }
      : event.request,
    breadcrumbs: event.breadcrumbs?.map((breadcrumb) => ({
      ...breadcrumb,
      data: scrubDataUrls(breadcrumb.data),
    })),
  };
}

export function initSentry(): void {
  const dsn = import.meta.env["VITE_SENTRY_DSN"] as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      (import.meta.env["VITE_SENTRY_ENVIRONMENT"] as string | undefined) ||
      import.meta.env.MODE,
    release: import.meta.env["VITE_SENTRY_RELEASE"] as string | undefined,
    sendDefaultPii: false,
    beforeSend: scrubSensitiveUrls,
  });
}

export function captureUnexpectedError(
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

/**
 * Pure, render-safe sibling of {@link reportUserFacingError}. Maps an error to a
 * user-facing string using the same policy — actionable 4xx messages pass
 * through, server/unknown errors fall back to friendly copy — but does NOT
 * capture to Sentry. Use this when reading a mutation/query error directly in
 * JSX, where capture already happens in the matching `onError` handler and a
 * second capture-on-every-render would be wrong.
 */
export function userFacingErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  const trackingId = getTrackingId(error);
  if (trackingId) {
    return formatUserError(fallbackMessage, trackingId);
  }

  if (!shouldCaptureError(error)) {
    // ApiError instances from @/lib/api are always Error subclasses, so a real
    // actionable 4xx message reaches the user here. A bare 4xx-shaped plain
    // object (`{ status, message }`) is not passed through by design — without
    // the Error guard we could surface an arbitrary attacker- or
    // proxy-controlled `message` field, so we fall back instead.
    return error instanceof Error ? error.message : fallbackMessage;
  }

  return fallbackMessage;
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

  const eventId = captureUnexpectedError(error, context);
  return formatUserError(fallbackMessage, eventId);
}
