import { Hono } from "hono";
import type { Env } from "../types/env.js";

const health = new Hono<{ Bindings: Env }>();

declare global {
  var __BUILD_COMMIT__: string | undefined;
}

function normalizeBuildCommit(value: string | undefined): string | undefined {
  if (!value || value === "dev") return undefined;
  return value;
}

function bundledBuildCommit(): string | undefined {
  return normalizeBuildCommit(globalThis.__BUILD_COMMIT__);
}

export function resolveBuildCommit(
  env: Env | undefined,
  bundledCommit = bundledBuildCommit(),
): string {
  return (
    normalizeBuildCommit(env?.BUILD_COMMIT) ??
    normalizeBuildCommit(bundledCommit) ??
    "dev"
  );
}

function payload(env: Env | undefined): {
  ok: true;
  version: "1";
  commit: string;
} {
  return {
    ok: true,
    version: "1",
    commit: resolveBuildCommit(env),
  };
}

health.get("/health", (c) => c.json(payload(c.env)));
health.get("/api/health", (c) => c.json(payload(c.env)));

export default health;
