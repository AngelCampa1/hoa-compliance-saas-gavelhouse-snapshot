import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readReservesSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/routes/_app.finance.reserves.tsx"),
    "utf8",
  );
}

/** Collapse runs of whitespace so assertions survive Prettier line-wrapping. */
function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("finance reserves route source", () => {
  it("hides the decorative sort icon from assistive tech", () => {
    const source = normalize(readReservesSource());

    // The ArrowUpDown glyph in the sortable column header is decorative; the
    // button text already names the control, so the icon must be aria-hidden.
    expect(source).toContain('<ArrowUpDown className="h-3 w-3" aria-hidden');
  });

  it("exposes the replacement-cost sort direction via aria-sort", () => {
    const source = readReservesSource();

    // Screen readers learn the active sort direction from aria-sort on the
    // column header, mapped from the amountSortDir state.
    expect(source).toContain("aria-sort=");
    expect(source).toContain('amountSortDir === "asc"');
    expect(source).toContain('amountSortDir === "desc"');
  });

  it("keeps the hidden file input out of the tab order and a11y tree", () => {
    const source = readReservesSource();

    // The visible button triggers the hidden input, so the input itself must
    // not be reachable or announced as an unlabeled control.
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("tabIndex={-1}");
  });

  it("keys import-error rows by their stable row and field, not array index", () => {
    const source = readReservesSource();

    expect(source).toContain("key={`${err.row}-${err.field}-${err.message}`}");
    expect(source).not.toContain("importErrors.map((err, i)");
  });
});
