import {
  SubscribeResponseSchema,
  type LeadMagnetSlug,
  type SubscribeResponse,
} from "@boardstack/shared";

export interface LeadMagnetSubscribeRequest {
  apiUrl: string;
  email: string;
  magnetSlug: LeadMagnetSlug;
  sourcePage: string;
  posthogDistinctId?: string;
  companyWebsite?: string;
  turnstileToken?: string;
}

interface PostHogWithDistinctId {
  get_distinct_id?: () => string | undefined;
}

export function readPosthogDistinctId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const ph = (window as unknown as { posthog?: PostHogWithDistinctId }).posthog;
  if (!ph || typeof ph.get_distinct_id !== "function") return undefined;

  try {
    const id = ph.get_distinct_id();
    return typeof id === "string" && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

export async function subscribeToLeadMagnet(
  request: LeadMagnetSubscribeRequest,
): Promise<SubscribeResponse> {
  const response = await fetch(`${request.apiUrl}/lead-magnets/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: request.email,
      magnetSlug: request.magnetSlug,
      sourcePage: request.sourcePage,
      posthogDistinctId: request.posthogDistinctId,
      companyWebsite: request.companyWebsite,
      turnstileToken: request.turnstileToken,
    }),
  });

  if (!response.ok) {
    const error = new Error(
      `Lead magnet subscribe failed with ${response.status}`,
    );
    Object.assign(error, { status: response.status });
    throw error;
  }

  const rawBody: unknown = await response.json();
  const parsed = SubscribeResponseSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new Error(
      "Lead magnet subscribe returned an invalid response shape.",
    );
  }

  return parsed.data;
}
