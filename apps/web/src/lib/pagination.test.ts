import { describe, it, expect } from "vitest";
import { pageUrl, getPageNumbers } from "./pagination";

describe("pageUrl", () => {
  it("returns a trailing-slashed path for page 1 when input has no trailing slash", () => {
    expect(pageUrl(1,"/blog")).toBe("/blog/");
  });

  it("returns basePath as-is for page 1 (trailing slash input preserved)", () => {
    expect(pageUrl(1,"/blog/")).toBe("/blog/");
  });

  it("returns page subpath for page > 1 (no trailing slash)", () => {
    expect(pageUrl(2,"/blog")).toBe("/blog/2");
  });

  it("returns page subpath for page > 1 (with trailing slash)", () => {
    expect(pageUrl(2,"/blog/")).toBe("/blog/2");
  });
});

describe("getPageNumbers", () => {
  it("returns all pages when total <= 7", () => {
    expect(getPageNumbers(1, 3)).toEqual([1, 2, 3]);
  });

  it("returns all 7 pages when total is exactly 7", () => {
    expect(getPageNumbers(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns correct pages for middle position in large set", () => {
    expect(getPageNumbers(4, 10)).toEqual([
      1,
      "ellipsis",
      3,
      4,
      5,
      "ellipsis",
      10,
    ]);
  });

  it("omits leading ellipsis when near start", () => {
    expect(getPageNumbers(1, 10)).toEqual([1, 2, "ellipsis", 10]);
  });

  it("omits trailing ellipsis when near end", () => {
    expect(getPageNumbers(10, 10)).toEqual([1, "ellipsis", 9, 10]);
  });

  it("returns single page for total of 1", () => {
    expect(getPageNumbers(1, 1)).toEqual([1]);
  });
});
