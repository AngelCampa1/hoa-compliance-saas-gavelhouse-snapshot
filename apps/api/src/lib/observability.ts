import * as Sentry from "@sentry/cloudflare";
import type { CloudflareOptions } from "@sentry/cloudflare";
import { buildAnalyticsEvent } from "@boardstack/shared";
import type { Env } from "../types/env.js";

type Primitive = string | number | boolean | null | undefined;

export type ErrorCaptureContext = {
  tags?: Record<string, Primitive>;
  extra?: Record<string, unknown>;
};

/**
 * Returns a Sentry CloudflareOptions config when SENTRY_DSN is present,
 * null otherwise. The caller passes this config to withSentry in the Worker
 * export.
 */
export function initSentry(env: Env | undefined): CloudflareOptions | null {
  if (!env?.SENTRY_DSN) return null;
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.SENTRY_RELEASE,
    sendDefaultPii: false,
  };
}

/**
 * Captures an exception via Sentry. No-ops silently if Sentry is not
 * initialized (SENTRY_DSN absent in env).
 */
export function captureException(
  err: unknown,
  context?: ErrorCaptureContext,
): string | undefined {
  let eventId: string | undefined;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context?.tags ?? {})) {
      if (value !== undefined) scope.setTag(key, String(value));
    }
    for (const [key, value] of Object.entries(context?.extra ?? {})) {
      scope.setExtra(key, value);
    }
    eventId = Sentry.captureException(err);
  });
  return eventId;
}

export type InternalErrorBody = {
  error: string;
  trackingId?: string;
};

export function buildInternalErrorBody(trackingId?: string): InternalErrorBody {
  return {
    error: "Something went wrong. Please try again.",
    ...(trackingId ? { trackingId } : {}),
  };
}

/**
 * Fires a server-side PostHog event via raw fetch.
 * No-ops when POSTHOG_KEY is absent. Never throws — analytics failures
 * must never crash the Worker.
 */
export async function captureEvent(
  name: string,
  props: Record<string, unknown> = {},
  userId: string | undefined,
  env: Env | undefined,
  options: { uuid?: string } = {},
): Promise<void> {
  if (!env?.POSTHOG_KEY) return;

  const host =
    !env.POSTHOG_HOST || env.POSTHOG_HOST === "https://app.posthog.com"
      ? "https://us.i.posthog.com"
      : env.POSTHOG_HOST;
  const distinctId = userId ?? `anon-${crypto.randomUUID()}`;
  let event;
  try {
    event = buildAnalyticsEvent(name as never, props);
  } catch {
    // Drop invalid analytics payloads instead of leaking unsafe or non-canonical data.
    return;
  }

  const payload = {
    api_key: env.POSTHOG_KEY,
    event: event.name,
    distinct_id: distinctId,
    timestamp: new Date().toISOString(),
    uuid: options.uuid ?? crypto.randomUUID(),
    properties: {
      ...event.properties,
      distinct_id: distinctId,
      ...(typeof event.properties["community_id"] === "string"
        ? { $groups: { community: event.properties["community_id"] } }
        : {}),
    },
  };

  try {
    await fetch(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // PostHog is best-effort; analytics failures must never crash the Worker.
  }
}
