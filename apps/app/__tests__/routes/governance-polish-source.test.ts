import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

/** Collapse runs of whitespace so Prettier line-wrapping can't break assertions. */
function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("governance violations route source", () => {
  const source = read("src/routes/_app.governance.violations.tsx");

  it("uses the canonical homeowners query key, not a bare prefix", () => {
    expect(source).toContain("qk.governance.homeowners(communityId)");
    expect(source).not.toContain('["governance-homeowners", communityId]');
  });

  it("does not display a raw actor user id in the history", () => {
    expect(source).not.toContain("Recorded by {event.actorUserId}");
    expect(normalize(source)).toContain("Recorded by a board member");
  });
});

describe("governance arch-requests route source", () => {
  const source = read("src/routes/_app.governance.arch-requests.tsx");

  it("does not display a raw reviewer user id", () => {
    expect(source).not.toContain("by ${r.reviewedByUserId}");
    expect(normalize(source)).toContain("by a board member");
  });
});

describe("governance arch-requests polish (ellipsis + error state)", () => {
  const source = read("src/routes/_app.governance.arch-requests.tsx");

  it("uses the unicode ellipsis in pending labels", () => {
    expect(source).toContain('"Uploading…"');
    expect(source).toContain('"Submitting…"');
    expect(source).not.toContain('"Uploading..."');
    expect(source).not.toContain('"Submitting..."');
  });

  it("handles the query error state instead of a misleading empty list", () => {
    expect(source).toContain("isError");
    expect(normalize(source)).toContain(
      "We could not load your architectural requests",
    );
  });
});

describe("governance transitions polish", () => {
  const source = read("src/routes/_app.governance.transitions.tsx");

  it("uses the centralized transitions query key", () => {
    expect(source).toContain("qk.governance.transitions(communityId)");
    expect(source).not.toContain('["governance-transitions", communityId]');
  });

  it("formats the completed date with explicit options", () => {
    expect(normalize(source)).toContain(
      'toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", })',
    );
  });

  it("handles the query error state instead of a misleading empty list", () => {
    expect(source).toContain("isError");
    expect(normalize(source)).toContain(
      "We could not load your board transitions",
    );
  });
});

describe("governance homeowners route source", () => {
  const source = read("src/routes/_app.governance.homeowners.tsx");

  it("keys skipped import rows by a stable value, not the array index", () => {
    expect(source).not.toContain("skipped.map((s, i) =>");
    expect(normalize(source)).toContain("key={`${s.row}-${s.reason}`}");
  });

  it("tracks which portal action is in flight so only one button shows a spinner", () => {
    const flat = normalize(source);
    expect(flat).toContain('mode: "generate" | "send"');
    expect(flat).toContain("setGeneratingFor({ id: homeownerId,");
    expect(flat).toContain('mode: sendEmail ? "send" : "generate"');
    expect(flat).toContain('generatingFor.mode === "generate"');
    expect(flat).toContain('generatingFor.mode === "send"');
  });
});
