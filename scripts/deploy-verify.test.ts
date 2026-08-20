import { describe, expect, it } from "vitest";
import { parseArgs } from "./deploy-verify";

describe("parseArgs", () => {
  it("parses a valid --project/--commit pair", () => {
    const result = parseArgs(["--project", "web", "--commit", "abc1234"]);
    expect(result.project).toBe("web");
    expect(result.commit).toBe("abc1234");
    expect(result.timeoutMs).toBe(60_000);
  });

  it("accepts a full 40-char SHA", () => {
    const sha = "abcdef0123456789abcdef0123456789abcdef01";
    const result = parseArgs(["--project", "api", "--commit", sha]);
    expect(result.commit).toBe(sha);
  });

  it("throws when --commit is shorter than 7 hex chars", () => {
    expect(() =>
      parseArgs(["--project", "web", "--commit", "abc"]),
    ).toThrowError(/Invalid --commit/);
  });

  it("throws when --commit contains non-hex characters", () => {
    expect(() =>
      parseArgs(["--project", "web", "--commit", "ZZZZZZZ"]),
    ).toThrowError(/Invalid --commit/);
  });

  it("throws when --commit is the 'dev' placeholder", () => {
    expect(() =>
      parseArgs(["--project", "web", "--commit", "dev"]),
    ).toThrowError(/Invalid --commit/);
  });

  it("throws when --commit is longer than 40 chars", () => {
    const tooLong = "a".repeat(41);
    expect(() =>
      parseArgs(["--project", "web", "--commit", tooLong]),
    ).toThrowError(/Invalid --commit/);
  });
});
