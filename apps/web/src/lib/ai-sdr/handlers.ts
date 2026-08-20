import { AI_SDR_PRODUCT_ID, buildAiSdrContext } from "./context";
import {
  buildAiSdrPayload,
  hmacHex,
  isRecord,
  verifyAiSdrSignature,
} from "./signing";
import { BRAND_DOMAIN, PUBLIC_WEB_URL } from "@boardstack/shared";

// Environment bindings the AI-SDR routes need. All optional so the marketing
// site still boots (and fails closed with 503) before the secrets are
// provisioned on the worker.
export interface AiSdrEnv {
  AI_SDR_CONTEXT_SECRET?: string;
  AI_SDR_CLIENT_ASSERTION_SECRET?: string;
  AI_SDR_WORKER_URL?: string;
}

export const AI_SDR_CONTEXT_PATH = "/api/ai-sdr/context";

const AI_SDR_ALLOWED_ORIGINS: readonly string[] = [
  PUBLIC_WEB_URL,
  `https://www.${BRAND_DOMAIN}`,
] as const;

const AI_SDR_PROXY_ROUTES: Record<
  string,
  "/v1/sessions" | "/v1/chat" | "/v1/handoff"
> = {
  "/api/ai-sdr/v1/sessions": "/v1/sessions",
  "/api/ai-sdr/v1/chat": "/v1/chat",
  "/api/ai-sdr/v1/handoff": "/v1/handoff",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function readEnv(env: unknown): AiSdrEnv {
  if (!isRecord(env)) return {};
  const pick = (key: keyof AiSdrEnv): string | undefined => {
    const value = env[key];
    return typeof value === "string" ? value : undefined;
  };
  return {
    AI_SDR_CONTEXT_SECRET: pick("AI_SDR_CONTEXT_SECRET"),
    AI_SDR_CLIENT_ASSERTION_SECRET: pick("AI_SDR_CLIENT_ASSERTION_SECRET"),
    AI_SDR_WORKER_URL: pick("AI_SDR_WORKER_URL"),
  };
}

export async function handleAiSdrContext(
  request: Request,
  env: AiSdrEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const productId =
    url.searchParams.get("productId") ?? url.searchParams.get("product_id");
  if (productId !== AI_SDR_PRODUCT_ID)
    return json({ error: "Unknown product" }, 404);

  const secret = env.AI_SDR_CONTEXT_SECRET?.trim();
  if (!secret) return json({ error: "Product context unavailable" }, 503);

  const timestamp = request.headers.get("X-Ventora-Timestamp");
  const nonce = request.headers.get("X-Ventora-Nonce");
  const signature = request.headers.get("X-Ventora-Signature");
  if (!timestamp || !nonce || !signature)
    return json({ error: "Missing signature" }, 401);

  const path = `${url.pathname}${url.search}`;
  const requestPayload = await buildAiSdrPayload({
    timestamp,
    nonce,
    method: "GET",
    path,
    body: { productId },
  });
  const valid = await verifyAiSdrSignature({
    payload: requestPayload,
    signature,
    secret,
    timestamp,
  });
  if (!valid) return json({ error: "Invalid signature" }, 401);

  const body = buildAiSdrContext() as unknown as Record<string, unknown>;
  const responseTimestamp = new Date().toISOString();
  const responseNonce = crypto.randomUUID().replaceAll("-", "");
  const responsePayload = await buildAiSdrPayload({
    timestamp: responseTimestamp,
    nonce: responseNonce,
    method: "GET",
    path,
    body,
  });
  const response = json(body);
  response.headers.set("Cache-Control", "private, max-age=300");
  response.headers.set("X-Ventora-Timestamp", responseTimestamp);
  response.headers.set("X-Ventora-Nonce", responseNonce);
  response.headers.set(
    "X-Ventora-Signature",
    await hmacHex(responsePayload, secret),
  );
  return response;
}

export async function handleAiSdrProxy(
  request: Request,
  env: AiSdrEnv,
  workerPath: "/v1/sessions" | "/v1/chat" | "/v1/handoff",
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);

  const origin = request.headers.get("Origin") ?? "";
  if (!AI_SDR_ALLOWED_ORIGINS.includes(origin))
    return json({ error: "forbidden" }, 403);

  const baseUrl = env.AI_SDR_WORKER_URL?.trim();
  const secret = env.AI_SDR_CLIENT_ASSERTION_SECRET?.trim();
  if (!baseUrl || !baseUrl.startsWith("https://") || !secret) {
    return json({ error: "AI assistant unavailable" }, 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (!isRecord(body)) return json({ error: "invalid_body" }, 400);

  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const payload = await buildAiSdrPayload({
    timestamp,
    nonce,
    method: "POST",
    path: workerPath,
    body,
  });
  const signature = await hmacHex(payload, secret);

  const upstreamUrl = `${baseUrl.replace(/\/+$/, "")}${workerPath}`;
  const acceptHeader =
    request.headers.get("Accept") ??
    (workerPath === "/v1/chat" ? "text/event-stream" : "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Accept: acceptHeader,
        "X-Ventora-Timestamp": timestamp,
        "X-Ventora-Nonce": nonce,
        "X-Ventora-Signature": signature,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return json({ error: "AI assistant upstream failed" }, 502);
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Cache-Control", "no-store");
  const contentType = upstream.headers.get("Content-Type");
  if (contentType) responseHeaders.set("Content-Type", contentType);
  const retryAfter = upstream.headers.get("Retry-After");
  if (retryAfter) responseHeaders.set("Retry-After", retryAfter);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

// Routes an AI-SDR request, or returns null so the caller delegates to Astro.
export function routeAiSdr(
  request: Request,
  env: unknown,
): Promise<Response> | null {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === AI_SDR_CONTEXT_PATH) {
    return handleAiSdrContext(request, readEnv(env));
  }

  const proxyPath = AI_SDR_PROXY_ROUTES[url.pathname];
  if (proxyPath) {
    return handleAiSdrProxy(request, readEnv(env), proxyPath);
  }

  return null;
}
