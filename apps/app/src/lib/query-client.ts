import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { captureUnexpectedError } from "@/lib/sentry";

function sanitizeKey(key: unknown, preserveLabel = false): unknown {
  if (typeof key === "string") {
    return preserveLabel ? key : "[redacted]";
  }

  if (typeof key === "number") {
    return "[number]";
  }

  if (typeof key === "boolean" || key === null || key === undefined) {
    return key;
  }

  if (Array.isArray(key)) {
    return key.map((part, index) => sanitizeKey(part, index === 0));
  }

  if (typeof key === "object") {
    return Object.fromEntries(
      Object.keys(key)
        .sort()
        .map((entryKey) => [
          entryKey,
          sanitizeKey((key as Record<string, unknown>)[entryKey]),
        ]),
    );
  }

  return `[${typeof key}]`;
}

function hashKey(key: unknown): string {
  try {
    return JSON.stringify(sanitizeKey(key, key === "anonymous"));
  } catch {
    return "unserializable";
  }
}

export function captureQueryError(
  error: unknown,
  source: "query" | "mutation",
  key: unknown,
): void {
  captureUnexpectedError(error, {
    tags: { source: `react-query-${source}` },
    extra: { key: hashKey(key) },
  });
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        captureQueryError(error, "query", query.queryKey);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        captureQueryError(
          error,
          "mutation",
          mutation.options.mutationKey ?? "anonymous",
        );
      },
    }),
  });
}
