import { describe, it, expect } from "vitest";
import { filterTocHeadings, shouldShowToc } from "./headings";
import type { TocHeading } from "./headings";

const makeHeading = (
  depth: number,
  slug?: string,
  text?: string,
): TocHeading => ({
  depth,
  slug: slug ?? `heading-${depth}`,
  text: text ?? `Heading ${depth}`,
});

describe("filterTocHeadings", () => {
  it("keeps headings with depth 1, 2, and 3", () => {
    const headings = [makeHeading(1), makeHeading(2), makeHeading(3)];
    expect(filterTocHeadings(headings)).toEqual(headings);
  });

  it("removes headings with depth 4, 5, 6", () => {
    const headings = [
      makeHeading(1),
      makeHeading(4),
      makeHeading(5),
      makeHeading(6),
    ];
    expect(filterTocHeadings(headings)).toEqual([makeHeading(1)]);
  });

  it("returns empty array for empty input", () => {
    expect(filterTocHeadings([])).toEqual([]);
  });

  it("returns empty array when all headings are depth > 3", () => {
    expect(filterTocHeadings([makeHeading(4), makeHeading(5)])).toEqual([]);
  });

  it("preserves order of qualifying headings", () => {
    const headings = [
      makeHeading(3, "a"),
      makeHeading(1, "b"),
      makeHeading(2, "c"),
    ];
    const result = filterTocHeadings(headings);
    expect(result.map((h) => h.slug)).toEqual(["a", "b", "c"]);
  });
});

describe("shouldShowToc", () => {
  it("returns true when 3 or more qualifying headings exist", () => {
    const headings = [makeHeading(1), makeHeading(2), makeHeading(3)];
    expect(shouldShowToc(headings)).toBe(true);
  });

  it("returns false when fewer than 3 qualifying headings exist", () => {
    const headings = [makeHeading(1), makeHeading(2)];
    expect(shouldShowToc(headings)).toBe(false);
  });

  it("ignores depth-4+ headings for count", () => {
    const headings = [
      makeHeading(1),
      makeHeading(2),
      makeHeading(4),
      makeHeading(5),
      makeHeading(6),
    ];
    expect(shouldShowToc(headings)).toBe(false);
  });

  it("returns false for empty headings", () => {
    expect(shouldShowToc([])).toBe(false);
  });

  it("uses custom threshold when provided", () => {
    const headings = [makeHeading(1), makeHeading(2), makeHeading(3)];
    expect(shouldShowToc(headings, 5)).toBe(false);
  });

  it("returns true when count meets custom threshold", () => {
    const headings = [
      makeHeading(1),
      makeHeading(2),
      makeHeading(3),
      makeHeading(2, "d"),
      makeHeading(1, "e"),
    ];
    expect(shouldShowToc(headings, 5)).toBe(true);
  });
});
