import { Hono } from "hono";
import type { Env } from "../types/env.js";
import { getAuth, getAuthProviders } from "../lib/auth.js";
import { checkRateLimit } from "../lib/rateLimiter.js";

const authRouter = new Hono<{ Bindings: Env }>();

/** Auth endpoints that carry brute-force risk and must be rate-limited. */
const RATE_LIMITED_AUTH_PATHS = [
  "/api/auth/sign-in/email",
  "/api/auth/sign-up/email",
  "/api/auth/forget-password",
];

/**
 * Rate-limit sensitive auth paths: 5 attempts per email (from body) and per IP
 * within a 15-minute rolling window. Both limits are enforced independently so
 * a shared IP cannot be used to bypass the per-email guard and vice versa.
 */
authRouter.post("/api/auth/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const isRateLimited = RATE_LIMITED_AUTH_PATHS.some((p) => path.startsWith(p));
  if (!isRateLimited) {
    return next();
  }

  const kv = c.env.AUTH_RATE_LIMIT_KV;
  // Use only the Cloudflare-injected header — x-forwarded-for is client-
  // spoofable and must never be used as a rate-limit key.
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";

  // Extract email from body for per-email limiting.
  // Clone the request so the handler can still read the body afterwards.
  let email: string | undefined;
  try {
    const cloned = c.req.raw.clone();
    const body = await cloned.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "email" in body &&
      typeof (body as Record<string, unknown>).email === "string"
    ) {
      email = ((body as Record<string, unknown>).email as string)
        .trim()
        .toLowerCase();
    }
  } catch {
    // Body not JSON — continue without per-email limiting
  }

  const windowSeconds = 15 * 60; // 15 minutes
  const maxRequests = 5;

  // Check per-IP limit
  const ipResult = await checkRateLimit({
    kv,
    namespace: "auth-ip",
    identifier: ip,
    maxRequests,
    windowSeconds,
  });
  if (!ipResult.allowed) {
    return c.json(
      { error: "Too many requests. Please try again in 15 minutes." },
      429,
    );
  }

  // Check per-email limit (only when we could extract the email)
  if (email) {
    const emailResult = await checkRateLimit({
      kv,
      namespace: "auth-email",
      identifier: email,
      maxRequests,
      windowSeconds,
    });
    if (!emailResult.allowed) {
      return c.json(
        { error: "Too many requests. Please try again in 15 minutes." },
        429,
      );
    }
  }

  return next();
});

authRouter.get("/api/auth/providers", (c) => {
  return c.json(getAuthProviders(c.env));
});

authRouter.all("/api/auth/*", async (c) => {
  const auth = getAuth(c.env);
  return auth.handler(c.req.raw);
});

export default authRouter;
