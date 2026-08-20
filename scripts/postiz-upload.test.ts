import { describe, expect, it, vi } from "vitest";
import { join } from "path";

import {
  createPostizPayload,
  extractPostizId,
  filterPosts,
  getApiKey,
  getFlag,
  nextDelayAfterRateLimit,
  postToPostiz,
  receiptPath,
  runUpload,
} from "./postiz-upload.mjs";

describe("postiz-upload", () => {
  it("parses flag values", () => {
    expect(getFlag(["--from", "2026-05-18"], "--from")).toBe("2026-05-18");
    expect(getFlag(["--dry-run"], "--from")).toBeNull();
    expect(getFlag(["--api-key"], "--api-key")).toBeNull();
  });

  it("loads API keys from CLI, env, then credentials", () => {
    expect(
      getApiKey({
        args: ["--api-key", "cli-token"],
        env: { POSTIZ_API_KEY: "env-token" },
      }),
    ).toBe("cli-token");
    expect(getApiKey({ args: [], env: { POSTIZ_API_KEY: "env-token" } })).toBe(
      "env-token",
    );
    expect(
      getApiKey({
        args: [],
        env: {},
        exists: () => true,
        readFile: () => JSON.stringify({ accessToken: "stored-token" }),
      }),
    ).toBe("stored-token");
  });

  it("uses uploaded receipt paths and filters manifest posts by date", () => {
    expect(receiptPath("content/linkedin/posts/example.md", "C:/repo")).toBe(
      join("C:/repo", "content/linkedin/posts/example.uploaded.json"),
    );

    const posts = [
      { id: "a", scheduledAt: "2026-05-17T10:00:00.000Z" },
      { id: "b", scheduledAt: "2026-05-18T10:00:00.000Z" },
    ];

    expect(filterPosts(posts, "2026-05-18")).toEqual([posts[1]]);
  });

  it("includes LinkedIn Page provider settings in Postiz payloads", () => {
    expect(
      createPostizPayload(
        "integration",
        { scheduledAt: "2026-05-18T10:00:00.000Z" },
        "Post body",
      ),
    ).toMatchObject({
      posts: [
        {
          integration: { id: "integration" },
          settings: { __type: "linkedin-page" },
          value: [{ content: "Post body", image: [], delay: 0 }],
        },
      ],
    });
  });

  it("creates CLI-compatible API requests and surfaces 429 retry metadata", async () => {
    const rateLimitedFetch = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
      headers: new Headers({ "retry-after": "7" }),
      text: async () => "too many",
    });

    await expect(
      postToPostiz({
        apiKey: "token",
        integrationId: "integration",
        entry: { scheduledAt: "2026-05-18T10:00:00.000Z" },
        body: "body",
        fetchImpl: rateLimitedFetch,
      }),
    ).rejects.toMatchObject({ isRateLimit: true, retryAfter: 7 });

    expect(nextDelayAfterRateLimit(3_000, 7)).toBe(9_000);
  });

  it("retries a 429 response and writes a receipt after success", async () => {
    const manifest = {
      posts: [
        {
          id: "post-1",
          file: "content/linkedin/posts/post-1.md",
          scheduledAt: "2026-05-18T10:00:00.000Z",
        },
      ],
    };
    const written: string[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers: new Headers(),
        text: async () => "too many",
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => [{ postId: "postiz-1" }],
      });

    await runUpload({
      args: ["--api-key", "token", "--integration-id", "integration"],
      env: {},
      root: "C:/repo",
      manifestPath: "manifest.json",
      readFile: (path: string) =>
        String(path).endsWith("manifest.json")
          ? JSON.stringify(manifest)
          : "---\ntitle: Test\n---\nPost body",
      writeFile: (_path: string, data: string) => {
        written.push(String(data));
      },
      exists: () => false,
      fetchImpl,
      sleepImpl: vi.fn(),
      uploadsDisabled: false,
      now: () => new Date("2026-05-12T00:00:00.000Z"),
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(extractPostizId([{ postId: "postiz-1" }])).toBe("postiz-1");
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0])).toMatchObject({
      postizId: "postiz-1",
      entry: { id: "post-1" },
    });
  });

  it("exits non-zero when every retry is rate limited", async () => {
    const manifest = {
      posts: [
        {
          id: "post-1",
          file: "content/linkedin/posts/post-1.md",
          scheduledAt: "2026-05-18T10:00:00.000Z",
        },
      ],
    };
    const exit = vi.fn();
    const writeFile = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
      headers: new Headers(),
      text: async () => "too many",
    });

    await runUpload({
      args: ["--api-key", "token", "--integration-id", "integration"],
      env: {},
      root: "C:/repo",
      manifestPath: "manifest.json",
      readFile: (path: string) =>
        String(path).endsWith("manifest.json")
          ? JSON.stringify(manifest)
          : "---\ntitle: Test\n---\nPost body",
      writeFile,
      exists: () => false,
      fetchImpl,
      sleepImpl: vi.fn(),
      uploadsDisabled: false,
      now: () => new Date("2026-05-12T00:00:00.000Z"),
      log: vi.fn(),
      error: vi.fn(),
      exit,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(writeFile).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("refuses live uploads after shutdown", async () => {
    const manifest = {
      posts: [
        {
          id: "post-1",
          file: "content/linkedin/posts/post-1.md",
          scheduledAt: "2026-06-12T10:00:00.000Z",
        },
      ],
    };
    const error = vi.fn();
    const exit = vi.fn();
    const fetchImpl = vi.fn();

    await runUpload({
      args: ["--api-key", "token", "--integration-id", "integration"],
      env: {},
      root: "C:/repo",
      manifestPath: "manifest.json",
      readFile: () => JSON.stringify(manifest),
      exists: () => false,
      fetchImpl,
      log: vi.fn(),
      error,
      exit,
    });

    expect(error).toHaveBeenCalledWith(
      "Error: LinkedIn/Postiz uploads are disabled because Gavelhouse is shut down.",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
