import { Hono } from "hono";
import {
  PUBLIC_APP_URL,
  PUBLIC_WEB_URL,
  knowledgeBase,
} from "@boardstack/shared";
import { getAuth } from "../lib/auth.js";
import { createDb } from "../db/client.js";
import { aiCsEscalations } from "../db/schema/index.js";
import { captureEvent, captureException } from "../lib/observability.js";
import {
  sendEscalationNotification,
  type EscalationTicket,
} from "../lib/aiCsEscalationMailer.js";
import type { Env } from "../types/env.js";

/**
 * Authenticated backend-for-frontend (BFF) for the Ventora AI-CS Worker.
 *
 * The dashboard SPA cannot hold the HMAC client-assertion secret, so it posts
 * unsigned requests to this same-origin BFF, which:
 *   1. gates every call behind a valid better-auth dashboard session;
 *   2. forwards to the AI-CS Worker `/v1/{sessions,chat,escalations}` contract,
 *      injecting the authenticated `userId` and the fixed `appId` for session
 *      creation (never trusting client-supplied identity);
 *   3. signs each forwarded request with `AI_CS_CLIENT_ASSERTION_SECRET` over the
 *      exact body it sends, forwarding the dashboard `Origin`;
 *   4. streams the chat Server-Sent Events response straight through, unbuffered.
 *
 * It fails closed: 503 when the secret/origin are unset, 401 when unauthenticated,
 * 400 for malformed bodies, and 502 when the Worker is unreachable or errors.
 */

type StableJsonValue =
  | string
  | number
  | boolean
  | null
  | StableJsonValue[]
  | { [key: string]: StableJsonValue | undefined };

type AiCsRoute = "sessions" | "chat" | "escalations";
type AiCsAction = "session" | "chat" | "escalation";

type Variables = {
  userId: string;
  userEmail: string;
};

const APP_ID = knowledgeBase.marketing.product.id;
const ROUTES: readonly AiCsRoute[] = ["sessions", "chat", "escalations"];
const AI_CS_ACTION_BY_ROUTE: Record<AiCsRoute, AiCsAction> = {
  sessions: "session",
  chat: "chat",
  escalations: "escalation",
};

const aiCsProxyRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

aiCsProxyRouter.use("/api/ai-cs/v1/*", async (c, next) => {
  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  c.set("userId", session.user.id);
  c.set("userEmail", session.user.email);
  await next();
});

for (const route of ROUTES) {
  aiCsProxyRouter.post(`/api/ai-cs/v1/${route}`, async (c) => {
    const secret = c.env.AI_CS_CLIENT_ASSERTION_SECRET;
    const workerOrigin = c.env.AI_CS_WORKER_ORIGIN;
    if (!secret || !workerOrigin) {
      return c.json({ error: "AI support unavailable" }, 503);
    }

    const requestBody = (await c.req
      .json()
      .catch(() => null)) as StableJsonValue | null;
    if (
      requestBody === null ||
      typeof requestBody !== "object" ||
      Array.isArray(requestBody)
    ) {
      return c.json({ error: "Invalid request" }, 400);
    }

    // Escalations are persisted (durable support ticket) and emailed to the
    // team BEFORE forwarding, so a human-actionable record survives even when
    // the Worker is unreachable. Both side effects are best-effort and never
    // block the forward.
    if (route === "escalations") {
      const ticket = buildEscalationTicket(
        requestBody,
        c.get("userId"),
        c.get("userEmail"),
      );
      if (!ticket) {
        return c.json({ error: "Invalid request" }, 400);
      }
      await recordEscalation(c.env, ticket);
    }

    const forwardBody = buildForwardBody(route, requestBody, c.get("userId"));
    // Send the exact canonical (key-sorted) bytes the HMAC signature commits to.
    // The signature hashes stableJson(forwardBody); serializing the wire body
    // with plain JSON.stringify here would emit insertion-order keys, so any
    // body whose natural order is not already alphabetical (e.g. a session with
    // currentPath/metadata, or a chat {sessionId,message}) would ship bytes the
    // upstream Worker re-hashes to a different digest and rejects as a mismatch.
    const serialized = stableJson(forwardBody);
    const workerPath = `/v1/${route}`;
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();
    const payload = await buildAiCsAssertionPayload({
      timestamp,
      nonce,
      method: "POST",
      path: workerPath,
      body: forwardBody,
    });
    const origin = getDashboardOrigin(c.req.raw.headers, c.env);

    const upstream = await fetch(`${workerOrigin}${workerPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-Ventora-Timestamp": timestamp,
        "X-Ventora-Nonce": nonce,
        "X-Ventora-Signature": await signAiCsPayload(payload, secret),
      },
      body: serialized,
    }).catch(() => null);

    if (!upstream) {
      await captureAiCsProxyEvent(c.env, c.get("userId"), {
        action: AI_CS_ACTION_BY_ROUTE[route],
        failure_type: "upstream_unavailable",
        request_field_count: Object.keys(requestBody).length,
        status: "failed",
      });
      return c.json({ error: "AI support unavailable" }, 502);
    }

    // Chat responses are a Server-Sent Events stream. Pass the upstream body
    // through unbuffered so deltas reach the browser as they are produced.
    if (route === "chat") {
      if (!upstream.ok || !upstream.body) {
        await captureAiCsProxyEvent(c.env, c.get("userId"), {
          action: "chat",
          failure_type: "upstream_unavailable",
          request_field_count: Object.keys(requestBody).length,
          status: "failed",
        });
        return c.json({ error: "AI support unavailable" }, 502);
      }
      await captureAiCsProxyEvent(c.env, c.get("userId"), {
        action: "chat",
        request_field_count: Object.keys(requestBody).length,
        status: "succeeded",
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type":
            upstream.headers.get("Content-Type") ?? "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (!upstream.ok) {
      await captureAiCsProxyEvent(c.env, c.get("userId"), {
        action: AI_CS_ACTION_BY_ROUTE[route],
        failure_type: "upstream_unavailable",
        request_field_count: Object.keys(requestBody).length,
        status: "failed",
      });
      return c.json({ error: "AI support unavailable" }, 502);
    }

    await captureAiCsProxyEvent(c.env, c.get("userId"), {
      action: AI_CS_ACTION_BY_ROUTE[route],
      request_field_count: Object.keys(requestBody).length,
      status: "succeeded",
    });

    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

/**
 * Build the exact body forwarded to the Worker for each route. Session creation
 * injects the authenticated identity and fixed app id, dropping any client
 * attempt to spoof them; chat and escalation bodies are forwarded as received
 * (the Worker validates their `sessionId`).
 */
function buildForwardBody(
  route: AiCsRoute,
  requestBody: { [key: string]: StableJsonValue | undefined },
  userId: string,
): StableJsonValue {
  if (route === "sessions") {
    const forward: { [key: string]: StableJsonValue | undefined } = {
      appId: APP_ID,
      userId,
    };
    if (requestBody.currentPath !== undefined) {
      forward.currentPath = requestBody.currentPath;
    }
    if (requestBody.metadata !== undefined) {
      forward.metadata = requestBody.metadata;
    }
    return forward;
  }
  return requestBody;
}

/**
 * Builds a durable escalation ticket from the request body and the
 * server-authenticated identity. Returns `null` when the body lacks a usable
 * `sessionId` — an escalation with no session cannot be triaged or forwarded.
 */
export function buildEscalationTicket(
  requestBody: { [key: string]: StableJsonValue | undefined },
  userId: string,
  userEmail: string,
): EscalationTicket | null {
  const sessionId = requestBody.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return null;
  }
  return {
    userId,
    userEmail,
    sessionId,
    reason: typeof requestBody.reason === "string" ? requestBody.reason : null,
    message:
      typeof requestBody.message === "string" ? requestBody.message : null,
    contact: serializeContact(requestBody.contact),
  };
}

/** Normalizes an optional contact value to a stored string, or `null`. */
function serializeContact(contact: StableJsonValue | undefined): string | null {
  if (contact === undefined || contact === null) return null;
  if (typeof contact === "string") return contact;
  return JSON.stringify(contact);
}

/**
 * Persists the escalation, then emails the support team. Each step is
 * independently best-effort: a failure is reported to Sentry but never thrown,
 * so the escalation still forwards to the Worker.
 */
async function recordEscalation(
  env: Env,
  ticket: EscalationTicket,
): Promise<void> {
  try {
    const db = createDb(env);
    await db.insert(aiCsEscalations).values(ticket);
  } catch (error) {
    captureException(error, { tags: { source: "ai-cs-escalation-persist" } });
  }

  try {
    await sendEscalationNotification(env, ticket);
  } catch (error) {
    captureException(error, { tags: { source: "ai-cs-escalation-email" } });
  }
}

async function captureAiCsProxyEvent(
  env: Env,
  userId: string,
  input:
    | {
        action: AiCsAction;
        request_field_count: number;
        status: "succeeded";
      }
    | {
        action: AiCsAction;
        failure_type: "upstream_unavailable";
        request_field_count: number;
        status: "failed";
      },
): Promise<void> {
  try {
    if (input.status === "succeeded") {
      await captureEvent(
        "ai_support_proxy_succeeded",
        {
          action: input.action,
          request_field_count: input.request_field_count,
        },
        userId,
        env,
      );
      return;
    }

    await captureEvent(
      "ai_support_proxy_failed",
      {
        action: input.action,
        failure_type: input.failure_type,
        request_field_count: input.request_field_count,
      },
      userId,
      env,
    );
  } catch {
    // Analytics is best-effort and must not break support proxy responses.
  }
}

function getDashboardOrigin(headers: Headers, env: Env): string {
  const origin = headers.get("Origin");
  if (
    origin === PUBLIC_WEB_URL ||
    origin === PUBLIC_APP_URL ||
    origin === env.APP_URL
  ) {
    return origin;
  }
  return env.APP_URL || PUBLIC_WEB_URL;
}

export async function buildAiCsAssertionPayload(input: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: StableJsonValue;
}): Promise<string> {
  const bodyHash = await sha256Hex(stableJson(input.body));
  return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${input.path}.${bodyHash}`;
}

async function signAiCsPayload(
  payload: string,
  secret: string,
): Promise<string> {
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
    encoder.encode(payload),
  );
  return bytesToHex(new Uint8Array(signature));
}

function stableJson(value: StableJsonValue): string {
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

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default aiCsProxyRouter;
