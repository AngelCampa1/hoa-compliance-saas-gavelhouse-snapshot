import { Hono } from "hono";
import {
  BRAND_NAME,
  PRODUCT_HELP_TOPICS,
  PRODUCT_ONBOARDING_STEPS,
  PRODUCT_PAGE_HELP,
  PUBLIC_APP_URL,
  knowledgeBase,
} from "@boardstack/shared";
import type { Env } from "../types/env.js";
import {
  buildHmacPayload,
  signHmacPayload,
  stableJson,
  verifyHmacSignature,
} from "./aiSdrContext.js";

/**
 * Signed AI-CS application-context endpoint.
 *
 * The Ventora AI-CS Worker calls this endpoint server-to-server while answering
 * an authenticated support question. It mirrors the AI-SDR context endpoint:
 *   - the Worker signs `GET /api/ai-cs/context?appId&userId[&currentPath]` with
 *     the shared `AI_CS_CONTEXT_SECRET` over the request body `{ appId, userId }`;
 *   - this endpoint verifies the signature, consumes the nonce once (replay
 *     protection in D1), then returns a signed `AiCsAppContext` describing the
 *     Gavelhouse dashboard's help, navigation, and onboarding workflow.
 *
 * The returned context contains only public in-app help surface area — no
 * secrets, credentials, or tenant data.
 */

type ContextSource = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
};

type NavigationTarget = {
  label: string;
  path: string;
  description: string;
};

type WorkflowStep = {
  id: string;
  label: string;
  status: "next";
  path: string;
};

type AiCsAppContext = {
  assistantId: "ai-cs";
  appId: string;
  appName: string;
  authenticatedOnly: true;
  description: string;
  sources: ContextSource[];
  navigation: NavigationTarget[];
  workflow: WorkflowStep[];
};

type HmacHeaders = {
  timestamp: string;
  nonce: string;
  signature: string;
};

const APP_ID = knowledgeBase.marketing.product.id;
const APP_NAME = BRAND_NAME;
const APP_BASE_URL = PUBLIC_APP_URL;
const MAX_SKEW_MS = 5 * 60 * 1000;
const MAX_SOURCES = 8;
const MAX_NAVIGATION = 12;

const aiCsContextRouter = new Hono<{ Bindings: Env }>();

aiCsContextRouter.get("/api/ai-cs/context", async (c) => {
  const appId = c.req.query("appId");
  if (appId !== APP_ID) {
    return c.json({ error: "Unknown app" }, 404);
  }

  const secret = c.env.AI_CS_CONTEXT_SECRET;
  if (!secret || !c.env.AI_CS_NONCE_DB) {
    return c.json({ error: "App context unavailable" }, 503);
  }

  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "Missing signature" }, 401);
  }

  const headers = readHmacHeaders(c.req.raw.headers);
  if (!headers) {
    return c.json({ error: "Missing signature" }, 401);
  }

  const requestUrl = new URL(c.req.url);
  const path = `${requestUrl.pathname}${requestUrl.search}`;
  const requestPayload = await buildHmacPayload({
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    method: "GET",
    path,
    body: { appId, userId },
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
    c.env.AI_CS_NONCE_DB,
  ).catch(() => null);
  if (nonceAccepted === null) {
    return c.json({ error: "App context unavailable" }, 503);
  }
  if (!nonceAccepted) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const body = buildGavelhouseAppContext();
  const responseTimestamp = new Date().toISOString();
  const responseNonce = crypto.randomUUID();
  const responsePayload = await buildHmacPayload({
    timestamp: responseTimestamp,
    nonce: responseNonce,
    method: "GET",
    path,
    body,
  });

  // Emit the exact canonical (key-sorted) bytes the X-Ventora-Signature commits
  // to. c.json would serialize the AiCsAppContext in insertion order, so the
  // Ventora AI-CS Worker re-hashing the received body would compute a different
  // digest and reject the signature. Mirrors the AI-SDR context endpoint.
  return c.body(stableJson(body), 200, {
    "Content-Type": "application/json",
    "Cache-Control": "private, max-age=300",
    "X-Ventora-Timestamp": responseTimestamp,
    "X-Ventora-Nonce": responseNonce,
    "X-Ventora-Signature": await signHmacPayload(responsePayload, secret),
  });
});

export function buildGavelhouseAppContext(): AiCsAppContext {
  return {
    assistantId: "ai-cs",
    appId: APP_ID,
    appName: APP_NAME,
    authenticatedOnly: true,
    description:
      "Authenticated in-app support for Gavelhouse, the HOA governance and finance platform. Helps board members and treasurers with community setup, homeowner rosters, dues, reserves, bank reconciliation, board reporting, and the owner portal.",
    sources: PRODUCT_HELP_TOPICS.slice(0, MAX_SOURCES).map((topic) => ({
      id: topic.slug,
      title: topic.title,
      url: `${APP_BASE_URL}/help/${topic.slug}`,
      excerpt: topic.summary,
    })),
    navigation: PRODUCT_PAGE_HELP.slice(0, MAX_NAVIGATION)
      .filter((help) => help.routes.length > 0)
      .map((help) => ({
        label: help.title,
        path: help.routes[0],
        description: help.purpose,
      })),
    workflow: PRODUCT_ONBOARDING_STEPS.map((step) => ({
      id: slugify(step.title),
      label: step.title,
      status: "next",
      path: step.href,
    })),
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readHmacHeaders(headers: Headers): HmacHeaders | null {
  const timestamp = headers.get("X-Ventora-Timestamp");
  const nonce = headers.get("X-Ventora-Nonce");
  const signature = headers.get("X-Ventora-Signature");
  return timestamp && nonce && signature
    ? { timestamp, nonce, signature }
    : null;
}

async function consumeNonce(
  nonce: string,
  timestamp: string,
  database: D1Database,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const timestampMs = Date.parse(timestamp);
  const expiresAt = timestampMs + MAX_SKEW_MS;

  await database
    .prepare("DELETE FROM ai_cs_nonces WHERE expires_at <= ?")
    .bind(nowMs)
    .run();
  const result = await database
    .prepare(
      "INSERT OR IGNORE INTO ai_cs_nonces (nonce, expires_at) VALUES (?, ?)",
    )
    .bind(nonce, expiresAt)
    .run();

  if (!result.success) {
    return false;
  }
  return result.meta.changes === 1;
}

export default aiCsContextRouter;
