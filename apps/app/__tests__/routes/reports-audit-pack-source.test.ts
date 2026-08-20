import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readAuditPackSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/routes/_app.reports.audit-pack.tsx"),
    "utf8",
  );
}

/** Collapse runs of whitespace so assertions survive Prettier line-wrapping. */
function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("reports audit-pack route source", () => {
  it("keeps the download button mounted while preparing, instead of swapping in a skeleton", () => {
    const source = normalize(readAuditPackSource());

    // Replacing the button with a Skeleton drops it from the DOM mid-action,
    // losing keyboard focus. The button stays put and reflects its busy state.
    expect(source).toContain(
      "disabled={isDownloading || !communityId} aria-busy={isDownloading}",
    );
    expect(source).toContain(
      '{isDownloading ? "Preparing download…" : "Download Audit Pack"}',
    );
    expect(source).not.toContain("import { Skeleton }");
    expect(source).not.toContain("<Skeleton");
  });

  it("uses a defined Alert variant for the info callout", () => {
    const source = readAuditPackSource();

    // "info" is not a defined Alert variant, so it silently fell back to the
    // default. Drop the prop to use the real default variant.
    expect(source).not.toContain('<Alert variant="info">');
  });
});
