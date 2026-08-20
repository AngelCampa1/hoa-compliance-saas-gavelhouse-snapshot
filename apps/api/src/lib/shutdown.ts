import type { Context, Next } from "hono";
import type { Env } from "../types/env.js";

const SHUTDOWN_BODY = {
  error: "Gavelhouse has been shut down.",
  code: "gavelhouse_shutdown",
} as const;

export function isGavelhouseShutdown(
  env: Pick<Env, "GAVELHOUSE_SHUTDOWN"> | undefined,
) {
  return env?.GAVELHOUSE_SHUTDOWN === "true";
}

export async function shutdownMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
) {
  if (!isGavelhouseShutdown(c.env)) {
    await next();
    return;
  }

  return c.json(SHUTDOWN_BODY, 410, {
    "Cache-Control": "no-store",
    "X-Gavelhouse-Shutdown": "true",
  });
}
