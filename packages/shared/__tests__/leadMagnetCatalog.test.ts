import { describe, it, expect } from "vitest";
import {
  pickMagnetSlugForPage,
  DEFAULT_MAGNET_SLUG,
} from "../src/leadMagnetCatalog";

describe("pickMagnetSlugForPage", () => {
  it("uses an explicit valid slug above all else", () => {
    expect(
      pickMagnetSlugForPage({
        explicitSlug: "hoa-budget-template",
        primaryKeyword: "reserve study",
      }),
    ).toBe("hoa-budget-template");
  });

  it("ignores an explicit slug that is not a known magnet", () => {
    expect(
      pickMagnetSlugForPage({
        explicitSlug: "not-a-real-slug",
        primaryKeyword: "annual budget planning",
      }),
    ).toBe("hoa-budget-template");
  });

  it("maps reserve-themed pages to the reserve fund calculator", () => {
    expect(
      pickMagnetSlugForPage({ primaryKeyword: "hoa reserve fund study" }),
    ).toBe("reserve-fund-calculator");
  });

  it("maps meeting/agenda pages to the agenda template", () => {
    expect(
      pickMagnetSlugForPage({ primaryKeyword: "hoa board meeting agenda" }),
    ).toBe("hoa-board-meeting-agenda-template");
  });

  it("maps collections/delinquency pages to the collections policy", () => {
    expect(
      pickMagnetSlugForPage({ tags: ["delinquent dues", "collections"] }),
    ).toBe("hoa-collections-policy-template");
  });

  it("falls back to the global default when nothing matches", () => {
    expect(
      pickMagnetSlugForPage({ primaryKeyword: "unrelated topic xyz" }),
    ).toBe(DEFAULT_MAGNET_SLUG);
    expect(DEFAULT_MAGNET_SLUG).toBe("50-state-reserve-fund-requirements");
  });

  it("lets a valid explicit slug override a contradictory keyword match", () => {
    expect(
      pickMagnetSlugForPage({
        explicitSlug: "hoa-newsletter-template",
        primaryKeyword: "hoa reserve fund study",
      }),
    ).toBe("hoa-newsletter-template");
  });

  it("does not match 'vs' inside a hyphenated path", () => {
    expect(
      pickMagnetSlugForPage({
        path: "/resources/guides/reserve-vs-operating-funds",
        primaryKeyword: "reserve fund",
      }),
    ).toBe("reserve-fund-calculator");
  });

  it("is case-insensitive and searches keyword, tags, category, and path", () => {
    expect(pickMagnetSlugForPage({ category: "FIDUCIARY DUTY" })).toBe(
      "hoa-fiduciary-duty-checklist",
    );
    expect(
      pickMagnetSlugForPage({
        path: "/resources/guides/hoa-cybersecurity-basics",
      }),
    ).toBe("hoa-cybersecurity-checklist");
  });
});
