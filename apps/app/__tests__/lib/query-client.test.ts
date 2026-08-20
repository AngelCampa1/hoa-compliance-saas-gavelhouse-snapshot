import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sentry", () => ({
  captureUnexpectedError: vi.fn(),
}));

import { captureUnexpectedError } from "@/lib/sentry";
import { captureQueryError, createAppQueryClient } from "@/lib/query-client";

describe("query-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a QueryClient with query and mutation caches", () => {
    const client = createAppQueryClient();

    expect(client.getQueryCache()).toBeDefined();
    expect(client.getMutationCache()).toBeDefined();
  });

  it("reports query failures with a stable key", () => {
    const error = new Error("request failed");

    captureQueryError(error, "query", ["communities", "me"]);

    expect(captureUnexpectedError).toHaveBeenCalledWith(error, {
      tags: { source: "react-query-query" },
      extra: { key: '["communities","[redacted]"]' },
    });
  });

  it("redacts sensitive query key values before reporting failures", () => {
    const error = new Error("portal request failed");

    captureQueryError(error, "query", ["owner-portal", "secret-token"]);

    expect(captureUnexpectedError).toHaveBeenCalledWith(error, {
      tags: { source: "react-query-query" },
      extra: { key: '["owner-portal","[redacted]"]' },
    });
    expect(
      JSON.stringify(vi.mocked(captureUnexpectedError).mock.calls),
    ).not.toContain("secret-token");
  });

  it("keeps key shape while redacting primitive values", () => {
    const error = new Error("request failed");

    captureQueryError(error, "query", [
      "ledger-entry",
      42,
      false,
      null,
      undefined,
    ]);

    expect(captureUnexpectedError).toHaveBeenCalledWith(error, {
      tags: { source: "react-query-query" },
      extra: {
        key: '["ledger-entry","[number]",false,null,null]',
      },
    });
  });

  it("redacts object query key values in sorted field order", () => {
    const error = new Error("request failed");

    captureQueryError(error, "query", {
      label: "secret",
      id: 42,
      active: true,
    });

    expect(captureUnexpectedError).toHaveBeenCalledWith(error, {
      tags: { source: "react-query-query" },
      extra: {
        key: '{"active":true,"id":"[number]","label":"[redacted]"}',
      },
    });
  });

  it("labels unsupported query key values without serializing them", () => {
    const error = new Error("request failed");

    captureQueryError(error, "query", Symbol("secret"));

    expect(captureUnexpectedError).toHaveBeenCalledWith(error, {
      tags: { source: "react-query-query" },
      extra: { key: '"[symbol]"' },
    });
  });

  it("reports mutation failures with a fallback key", () => {
    const error = Object.assign(new Error("conflict"), { status: 409 });

    captureQueryError(error, "mutation", "anonymous");

    expect(captureUnexpectedError).toHaveBeenCalledWith(error, {
      tags: { source: "react-query-mutation" },
      extra: { key: '"anonymous"' },
    });
  });

  it("reports unserializable query keys with a fallback label", () => {
    const error = new Error("request failed");
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    captureQueryError(error, "query", circular);

    expect(captureUnexpectedError).toHaveBeenCalledWith(error, {
      tags: { source: "react-query-query" },
      extra: { key: "unserializable" },
    });
  });

  it("reports errors from query cache callbacks", async () => {
    const client = createAppQueryClient();
    const error = new Error("query failed");

    await expect(
      client.fetchQuery({
        queryKey: ["communities", "me"],
        queryFn: async () => {
          throw error;
        },
        retry: false,
      }),
    ).rejects.toThrow(error);

    expect(captureUnexpectedError).toHaveBeenCalledWith(error, {
      tags: { source: "react-query-query" },
      extra: { key: '["communities","[redacted]"]' },
    });
  });

  it("reports errors from mutation cache callbacks", async () => {
    const client = createAppQueryClient();
    const error = new Error("mutation failed");
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ["save-community"],
      mutationFn: async () => {
        throw error;
      },
      retry: false,
    });

    await expect(mutation.execute(undefined)).rejects.toThrow(error);

    expect(captureUnexpectedError).toHaveBeenCalledWith(error, {
      tags: { source: "react-query-mutation" },
      extra: { key: '["save-community"]' },
    });
  });

  it("uses an anonymous mutation key when none is configured", async () => {
    const client = createAppQueryClient();
    const error = new Error("anonymous mutation failed");
    const mutation = client.getMutationCache().build(client, {
      mutationFn: async () => {
        throw error;
      },
      retry: false,
    });

    await expect(mutation.execute(undefined)).rejects.toThrow(error);

    expect(captureUnexpectedError).toHaveBeenCalledWith(error, {
      tags: { source: "react-query-mutation" },
      extra: { key: '"anonymous"' },
    });
  });
});
