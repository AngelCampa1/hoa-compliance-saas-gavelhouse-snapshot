import { describe, it, expect } from "vitest";
import health, { resolveBuildCommit } from "../../src/routes/health.js";

describe("GET /health", () => {
  it("returns ok: true, version: '1', commit: 'dev' when BUILD_COMMIT is unset", async () => {
    const res = await health.request("/health", {}, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, version: "1", commit: "dev" });
  });

  it("exposes the injected BUILD_COMMIT value", async () => {
    const res = await health.request("/health",
      {},
      { BUILD_COMMIT: "abc1234" },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, version: "1", commit: "abc1234" });
  });

  it("also serves the payload at /api/health", async () => {
    const res = await health.request("/api/health",
      {},
      { BUILD_COMMIT: "deadbee" },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, version: "1", commit: "deadbee" });
  });

  it("falls back to the bundled deploy commit when the env binding is absent", () => {
    expect(resolveBuildCommit(undefined, "feed123")).toBe("feed123");
  });

  it("falls back to dev when the bundled deploy commit is empty", () => {
    expect(resolveBuildCommit(undefined, "")).toBe("dev");
  });

  it("reads the bundled deploy commit from globalThis by default", () => {
    const previous = globalThis.__BUILD_COMMIT__;
    try {
      globalThis.__BUILD_COMMIT__ = "face123";
      expect(resolveBuildCommit(undefined)).toBe("face123");
    } finally {
      globalThis.__BUILD_COMMIT__ = previous;
    }
  });

  it("prefers the env binding over the bundled deploy commit", () => {
    expect(
      resolveBuildCommit({ BUILD_COMMIT: "abc1234" } as never, "feed123"),
    ).toBe("abc1234");
  });

  it("ignores the dev placeholder env binding when a bundled deploy commit is present", () => {
    expect(
      resolveBuildCommit({ BUILD_COMMIT: "dev" } as never, "feed123"),
    ).toBe("feed123");
  });
});
