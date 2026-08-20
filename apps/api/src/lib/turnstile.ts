import { captureException } from "./observability.js";
import type { Env } from "../types/env.js";

/** Cloudflare Turnstile server-side verification endpoint. */
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Module-level latch so a missing-secret-in-production misconfiguration is
 * reported loudly to Sentry exactly once per Worker instance instead of on
 * every request. Reset between tests via `__resetTurnstileWarningForTests`.
 */
let warnedMissingSecretInProduction = false;

export function __resetTurnstileWarningForTests(): void {
  warnedMissingSecretInProduction = false;
}

export type VerifyTurnstileParams = {
  /** Token produced by the Turnstile widget; may be absent for no-JS clients. */
  token: string | null | undefined;
  /** Client IP (`cf-connecting-ip`) to bind the challenge to, when known. */
  ip: string | null;
  env: Env;
};

/**
 * Verify a Cloudflare Turnstile token. Fail-closed by design: any network
 * error, non-OK response, unparseable body, or `success: false` returns
 * `false`.
 *
 * Bypass policy:
 * - Secret unset **outside** production (local dev / tests): bypass (`true`)
 *   so the forms remain usable without provisioning a key.
 * - Secret unset **in** production: fail closed (`false`) and report once to
 *   Sentry, so a misconfiguration cannot silently degrade us back to the
 *   unprotected posture.
 */
export async function verifyTurnstile(
  params: VerifyTurnstileParams,
): Promise<boolean> {
  const { token, ip, env } = params;
  const secret = env.TURNSTILE_SECRET_KEY;
  const isProduction = env.SENTRY_ENVIRONMENT === "production";

  if (!secret) {
    if (isProduction) {
      if (!warnedMissingSecretInProduction) {
        warnedMissingSecretInProduction = true;
        captureException(
          new Error(
            "TURNSTILE_SECRET_KEY is unset in production; public form " +
              "verification is failing closed. Set it via `wrangler secret put`.",
          ),
          { tags: { component: "turnstile" } },
        );
      }
      return false;
    }
    return true;
  }

  if (!token) {
    return false;
  }

  let response: Response;
  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) {
      body.set("remoteip", ip);
    }
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return false;
  }

  if (!response.ok) {
    return false;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return false;
  }

  return (
    typeof data === "object" &&
    data !== null &&
    (data as { success?: unknown }).success === true
  );
}
