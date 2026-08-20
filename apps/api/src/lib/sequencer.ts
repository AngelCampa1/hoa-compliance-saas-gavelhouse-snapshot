import type { Env } from "../types/env.js";

const PRODUCT_ID = "boardstack";

type ContactInput = {
  email: string;
  firstName?: string | null;
  metadata?: Record<string, unknown>;
};

type EnrollmentInput = {
  email: string;
  sequenceSlug: "boardstack-fulfillment-welcome" | "boardstack-nurture-value-1";
  externalId: string;
  metadata?: Record<string, unknown>;
};

function getSequencerConfig(env: Env): {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
} | null {
  const baseUrl = env.SEQUENCER_BASE_URL?.trim().replace(/\/+$/, "");
  const clientId = env.SEQUENCER_CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = env.SEQUENCER_CF_ACCESS_CLIENT_SECRET?.trim();

  if (!baseUrl || !clientId || !clientSecret) {
    return null;
  }

  return { baseUrl, clientId, clientSecret };
}

async function callSequencer(
  env: Env,
  path: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const config = getSequencerConfig(env);
  if (!config) return false;

  const res = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Access-Client-Id": config.clientId,
      "CF-Access-Client-Secret": config.clientSecret,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    throw new Error(
      `Sequencer request failed: ${res.status} ${res.statusText} ${responseBody}`.trim(),
    );
  }

  return true;
}

export async function upsertSequencerContact(
  env: Env,
  input: ContactInput,
): Promise<boolean> {
  return callSequencer(env, "/api/v1/contacts", {
    product: PRODUCT_ID,
    email: input.email,
    first_name: input.firstName ?? undefined,
    properties: input.metadata ?? {},
  });
}

export async function enrollSequencerSequence(
  env: Env,
  input: EnrollmentInput,
): Promise<boolean> {
  await upsertSequencerContact(env, {
    email: input.email,
    metadata: input.metadata,
  });

  return callSequencer(env, "/api/v1/enrollments", {
    product: PRODUCT_ID,
    email: input.email,
    sequence_slug: input.sequenceSlug,
    source: "boardstack-api",
    properties: {
      ...(input.metadata ?? {}),
      externalId: input.externalId,
      external_id: input.externalId,
    },
  });
}

export async function unsubscribeSequencerContact(
  env: Env,
  email: string,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  return callSequencer(env, "/api/v1/unsubscribe", {
    product: PRODUCT_ID,
    email,
    scope: "product",
    reason:
      typeof metadata["reason"] === "string"
        ? metadata["reason"]
        : "Gavelhouse lead unsubscribe",
  });
}
