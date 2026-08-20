import { Hono } from "hono";
import { getDiscountedDisplayPrice, knowledgeBase } from "@boardstack/shared";
import type { Tier } from "@boardstack/shared";
import type { Env } from "../types/env.js";
import { timingSafeEqual } from "../lib/timingSafeEqual.js";

type StableJsonValue =
  | string
  | number
  | boolean
  | null
  | StableJsonValue[]
  | { [key: string]: StableJsonValue | undefined };

type ProductContext = {
  productId: string;
  name: string;
  description: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    excerpt: string;
  }>;
  plans: Array<{
    id: string;
    name: string;
    price: string;
    monthlyPrice: string;
    annualPrice: string;
    discount: string;
    defaultCadence: "year";
    trialDays: number;
    ctaUrl: string;
    features: string[];
  }>;
};

type HmacHeaders = {
  timestamp: string;
  nonce: string;
  signature: string;
};

const PRODUCT_ID = "gavelhouse";
const MAX_SKEW_MS = 5 * 60 * 1000;

const aiSdrContextRouter = new Hono<{ Bindings: Env }>();

aiSdrContextRouter.get("/api/ai-sdr/context", async (c) => {
  const productId = c.req.query("productId");
  if (productId !== PRODUCT_ID) {
    return c.json({ error: "Unknown product" }, 404);
  }

  const secret = c.env.AI_SDR_CONTEXT_SECRET;
  if (!secret || !c.env.AI_SDR_NONCE_DB) {
    return c.json({ error: "Product context unavailable" }, 503);
  }

  const requestUrl = new URL(c.req.url);
  const headers = readHmacHeaders(c.req.raw.headers);
  if (!headers) {
    return c.json({ error: "Missing signature" }, 401);
  }

  const requestPayload = await buildHmacPayload({
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    method: "GET",
    path: `${requestUrl.pathname}${requestUrl.search}`,
    body: { productId },
  });
  const verified = await verifyHmacSignature({
    payload: requestPayload,
    signature: headers.signature,
    secret,
    timestamp: headers.timestamp,
  });
  if (!verified) {
    return c.json({ error: "Invalid signature" }, 401);
  }
  const nonceAccepted = await consumeNonce(
    headers.nonce,
    headers.timestamp,
    c.env.AI_SDR_NONCE_DB,
  ).catch(() => null);
  if (nonceAccepted === null) {
    return c.json({ error: "Product context unavailable" }, 503);
  }
  if (!nonceAccepted) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = buildGavelhouseContext();
  const responseTimestamp = new Date().toISOString();
  const responseNonce = crypto.randomUUID();
  const responsePayload = await buildHmacPayload({
    timestamp: responseTimestamp,
    nonce: responseNonce,
    method: "GET",
    path: `${requestUrl.pathname}${requestUrl.search}`,
    body,
  });

  // Emit the exact canonical (key-sorted) bytes the X-Ventora-Signature commits
  // to. c.json would serialize the ProductContext in insertion order, so a
  // consumer that re-hashes the received response body would compute a
  // different digest and reject the signature.
  return c.body(stableJson(body), 200, {
    "Content-Type": "application/json",
    "Cache-Control": "private, max-age=300",
    "X-Ventora-Timestamp": responseTimestamp,
    "X-Ventora-Nonce": responseNonce,
    "X-Ventora-Signature": await signHmacPayload(responsePayload, secret),
  });
});

export function buildGavelhouseContext(): ProductContext {
  const marketing = knowledgeBase.marketing;
  return {
    productId: PRODUCT_ID,
    name: marketing.product.name,
    description: marketing.product.description,
    sources: [
      {
        id: "positioning",
        title: `${marketing.product.name} positioning`,
        url: `https://${marketing.product.domain}/`,
        excerpt: `${marketing.product.tagline} ${marketing.product.targetAudience}`,
      },
      {
        id: "pricing",
        title: "Pricing and trial",
        url: `https://${marketing.product.domain}/pricing/`,
        excerpt: `${marketing.pricing.displayRange}. ${marketing.offer.guaranteeLabel}. ${marketing.funnel.ctaSubtitle}`,
      },
      {
        id: "capabilities",
        title: "Product capabilities",
        url: `https://${marketing.product.domain}/features/`,
        excerpt: marketing.product.benefits.join(""),
      },
      {
        id: "founder-contact",
        title: "Founder contact",
        url: `https://${marketing.product.domain}${marketing.founderContact.contactPath}`,
        excerpt: `Founder contact is available at ${marketing.founderContact.email}.`,
      },
    ],
    plans: marketing.pricing.plans.map((plan) => {
      const tier = plan.id as Tier;
      return {
        id: plan.id,
        name: plan.name,
        price: getDiscountedDisplayPrice(tier, "annual"),
        monthlyPrice: getDiscountedDisplayPrice(tier, "monthly"),
        annualPrice: `${getDiscountedDisplayPrice(tier, "annual")} billed annually`,
        discount: `${marketing.pricing.config.promoCode}: ${marketing.offer.label}`,
        defaultCadence: "year",
        trialDays: marketing.offer.guaranteeDays,
        ctaUrl: marketing.funnel.publicSignupUrl,
        features: plan.features,
      };
    }),
  };
}

export async function buildHmacPayload(input: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: StableJsonValue;
}): Promise<string> {
  const bodyHash = await sha256Hex(stableJson(input.body));
  return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${input.path}.${bodyHash}`;
}

export async function signHmacPayload(
  payload: string,
  secret: string,
): Promise<string> {
  return hmacSha256Hex(secret, payload);
}

export async function verifyHmacSignature(input: {
  payload: string;
  signature: string;
  secret: string;
  timestamp: string;
  now?: Date;
}): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(input.signature)) {
    return false;
  }

  const timestampMs = Date.parse(input.timestamp);
  const nowMs = (input.now ?? new Date()).getTime();
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(nowMs - timestampMs) > MAX_SKEW_MS
  ) {
    return false;
  }

  const expected = await signHmacPayload(input.payload, input.secret);
  return timingSafeEqual(expected, input.signature);
}

export function clearAiSdrNonceCache(): void {}

async function consumeNonce(
  nonce: string,
  timestamp: string,
  database: D1Database,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const timestampMs = Date.parse(timestamp);
  const expiresAt = timestampMs + MAX_SKEW_MS;

  await database
    .prepare("DELETE FROM ai_sdr_nonces WHERE expires_at <= ?")
    .bind(nowMs)
    .run();
  const result = await database
    .prepare(
      "INSERT OR IGNORE INTO ai_sdr_nonces (nonce, expires_at) VALUES (?, ?)",
    )
    .bind(nonce, expiresAt)
    .run();

  if (!result.success) {
    return false;
  }
  return result.meta.changes === 1;
}

function readHmacHeaders(headers: Headers): HmacHeaders | null {
  const timestamp = headers.get("X-Ventora-Timestamp");
  const nonce = headers.get("X-Ventora-Nonce");
  const signature = headers.get("X-Ventora-Signature");
  return timestamp && nonce && signature
    ? { timestamp, nonce, signature }
    : null;
}

export function stableJson(value: StableJsonValue): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: StableJsonValue): StableJsonValue {
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const sorted: { [key: string]: StableJsonValue } = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) {
      sorted[key] = sortStable(child);
    }
  }
  return sorted;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return bytesToHex(new Uint8Array(signature));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default aiSdrContextRouter;
