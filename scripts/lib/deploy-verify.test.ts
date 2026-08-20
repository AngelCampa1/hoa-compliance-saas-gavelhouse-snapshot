import { describe, expect, it } from "vitest";
import {
  commitMatches,
  parseCommitFromHtml,
  parseCommitFromJson,
  urlForProject,
  verifyLiveCommit,
} from "./deploy-verify";

function makeResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

function makeClock(startMs = 0, incrementMs = 100): () => number {
  let current = startMs;
  return () => {
    const value = current;
    current += incrementMs;
    return value;
  };
}

describe("parseCommitFromHtml", () => {
  it("extracts the build-commit meta tag", () => {
    expect(
      parseCommitFromHtml('<meta name="build-commit" content="abc1234">'),
    ).toBe("abc1234");
  });

  it("handles attributes in reverse order", () => {
    expect(
      parseCommitFromHtml('<meta content="abc1234" name="build-commit">'),
    ).toBe("abc1234");
  });

  it("returns null when no tag is present", () => {
    expect(parseCommitFromHtml("<html></html>")).toBeNull();
  });
});

describe("parseCommitFromJson", () => {
  it("extracts commit from JSON", () => {
    expect(parseCommitFromJson('{"commit":"abc1234"}')).toBe("abc1234");
  });

  it("returns null for invalid JSON", () => {
    expect(parseCommitFromJson("not-json")).toBeNull();
  });

  it("returns null when commit field missing", () => {
    expect(parseCommitFromJson('{"ok":true}')).toBeNull();
  });

  it("returns null when commit is not a string", () => {
    expect(parseCommitFromJson('{"commit":123}')).toBeNull();
  });

  it("returns null for null JSON", () => {
    expect(parseCommitFromJson("null")).toBeNull();
  });
});

describe("commitMatches", () => {
  it("matches identical SHAs", () => {
    expect(commitMatches("abc1234", "abc1234")).toBe(true);
  });

  it("matches prefix either direction with valid SHAs", () => {
    expect(commitMatches("abc1234567890abcdef", "abc1234")).toBe(true);
    expect(commitMatches("abc1234", "abc1234567890abcdef")).toBe(true);
  });

  it("returns false when served is null", () => {
    expect(commitMatches("abc1234", null)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(commitMatches("abc1234", "ABC1234567890")).toBe(true);
  });

  it("rejects mismatched SHAs", () => {
    expect(commitMatches("abc1234", "def5678")).toBe(false);
  });

  it("rejects SHAs shorter than 7 hex chars (would otherwise collide)", () => {
    expect(commitMatches("abc", "abc1234")).toBe(false);
  });

  it("rejects the literal 'dev' placeholder even though it would prefix-match", () => {
    expect(commitMatches("dev", "dev1234567")).toBe(false);
  });

  it("rejects non-hex strings", () => {
    expect(commitMatches("ZZZZZZZ", "abc1234")).toBe(false);
  });

  it("rejects when served is non-hex", () => {
    expect(commitMatches("abc1234", "ZZZZZZZ")).toBe(false);
  });
});

describe("urlForProject", () => {
  it("returns the marketing URL for web", () => {
    expect(urlForProject("web")).toBe("https://gavelhouse.app/");
  });

  it("returns the dashboard URL for app", () => {
    expect(urlForProject("app")).toBe("https://my.gavelhouse.app/");
  });

  it("returns the api health URL for api", () => {
    expect(urlForProject("api")).toBe("https://api.gavelhouse.app/api/health");
  });
});

describe("verifyLiveCommit", () => {
  it("returns ok=true immediately when commit matches on first try", async () => {
    const result = await verifyLiveCommit({
      project: "web",
      expectedCommit: "abc1234",
      fetchImpl: async () =>
        makeResponse('<meta name="build-commit" content="abc1234">'),
      sleepImpl: async () => undefined,
      now: makeClock(),
    });
    expect(result.ok).toBe(true);
    expect(result.servedCommit).toBe("abc1234");
    expect(result.attempts).toBe(1);
  });

  it("polls until a fresh commit appears", async () => {
    let n = 0;
    const result = await verifyLiveCommit({
      project: "web",
      expectedCommit: "aaa1234",
      timeoutMs: 1000,
      pollIntervalMs: 10,
      fetchImpl: async () => {
        n += 1;
        return makeResponse(
          `<meta name="build-commit" content="${n < 3 ? "bbb5678" : "aaa1234"}">`,
        );
      },
      sleepImpl: async () => undefined,
      now: makeClock(0, 1),
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it("returns ok=false when timeout elapses without a match", async () => {
    const result = await verifyLiveCommit({
      project: "web",
      expectedCommit: "aaa1234",
      timeoutMs: 50,
      pollIntervalMs: 10,
      fetchImpl: async () =>
        makeResponse('<meta name="build-commit" content="bbb5678">'),
      sleepImpl: async () => undefined,
      now: makeClock(0, 20),
    });
    expect(result.ok).toBe(false);
    expect(result.servedCommit).toBe("bbb5678");
    expect(result.attempts).toBeGreaterThan(0);
  });

  it("retries across network errors", async () => {
    let n = 0;
    const result = await verifyLiveCommit({
      project: "api",
      expectedCommit: "abc1234",
      timeoutMs: 1000,
      pollIntervalMs: 1,
      fetchImpl: async () => {
        n += 1;
        if (n === 1) throw new Error("network down");
        return makeResponse('{"commit":"abc1234"}');
      },
      sleepImpl: async () => undefined,
      now: makeClock(0, 1),
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("uses JSON parsing for the api project", async () => {
    const result = await verifyLiveCommit({
      project: "api",
      expectedCommit: "abc1234",
      fetchImpl: async () => makeResponse('{"commit":"abc1234"}'),
      sleepImpl: async () => undefined,
      now: makeClock(),
    });
    expect(result.ok).toBe(true);
    expect(result.servedCommit).toBe("abc1234");
  });

  it("uses the default sleep implementation when one is not injected", async () => {
    // Provide fetchImpl that succeeds on first call so the default sleep is
    // never actually invoked past its initial setup — we only need the
    // defaultSleep reference to be touched to satisfy coverage.
    const result = await verifyLiveCommit({
      project: "web",
      expectedCommit: "abc1234",
      fetchImpl: async () =>
        makeResponse('<meta name="build-commit" content="abc1234">'),
      // sleepImpl intentionally omitted.
      now: makeClock(),
    });
    expect(result.ok).toBe(true);
  });

  it("exercises the real default sleep when a poll is needed", async () => {
    let n = 0;
    const result = await verifyLiveCommit({
      project: "web",
      expectedCommit: "aaa1234",
      timeoutMs: 500,
      pollIntervalMs: 1,
      fetchImpl: async () => {
        n += 1;
        return makeResponse(
          `<meta name="build-commit" content="${n < 2 ? "old" : "aaa1234"}">`,
        );
      },
      // sleepImpl intentionally omitted to cover defaultSleep.
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("sends no-store + pragma headers and appends a cache-busting query param", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const result = await verifyLiveCommit({
      project: "web",
      expectedCommit: "abc1234",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        return makeResponse('<meta name="build-commit" content="abc1234">');
      },
      sleepImpl: async () => undefined,
      now: makeClock(),
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/[?&]_=\d+/);
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers["cache-control"]).toBe("no-store");
    expect(headers.pragma).toBe("no-cache");
  });

  it("cache-busts API health URL with ?_= param", async () => {
    const calls: string[] = [];
    await verifyLiveCommit({
      project: "api",
      expectedCommit: "abc1234",
      fetchImpl: async (input) => {
        calls.push(String(input));
        return makeResponse('{"commit":"abc1234"}');
      },
      sleepImpl: async () => undefined,
      now: makeClock(),
    });
    expect(calls[0]).toMatch(/\?_=\d+$/);
  });

  it("breaks out of the loop when the next sleep would exceed the deadline", async () => {
    const result = await verifyLiveCommit({
      project: "web",
      expectedCommit: "aaa1234",
      timeoutMs: 5,
      pollIntervalMs: 100,
      fetchImpl: async () =>
        makeResponse('<meta name="build-commit" content="old">'),
      sleepImpl: async () => {
        throw new Error("should not sleep past deadline");
      },
      now: makeClock(0, 1),
    });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(1);
  });
});
