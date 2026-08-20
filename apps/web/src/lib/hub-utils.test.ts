/**
 * Component behavioral guarantees for ContentHub and CategoryHub:
 *
 * .astro files cannot be directly unit-tested in Vitest. The FAQ render
 * decisions in content-hub.astro and category-hub.astro are fully delegated
 * to the utility functions below -- there is zero inline logic in the templates:
 *
 *   content-hub.astro:   {hasHubFaqs(faqs) && <FaqSection faqs={faqs} />}
 *   category-hub.astro:  {shouldShowFaqsOnPage(faqs, page.currentPage) && <FaqSection faqs={faqs} />}
 *
 * Therefore the tests below cover the components' complete branching logic:
 *   - ContentHub renders FaqSection when faqs are passed → hasHubFaqs returns true
 *   - ContentHub renders nothing FAQ-related when faqs are empty/omitted → hasHubFaqs returns false
 *   - CategoryHub renders FaqSection on page 1 with faqs → shouldShowFaqsOnPage returns true
 *   - CategoryHub does NOT render FaqSection on page 2+ → shouldShowFaqsOnPage returns false
 *   - CategoryHub renders nothing FAQ-related when faqs are empty → shouldShowFaqsOnPage returns false
 */

import { describe, it, expect } from "vitest";
import {
  hasHubFaqs,
  normalizeHubCanonicalUrl,
  shouldShowFaqsOnPage,
} from "./hub-utils";
import type { FaqItem } from "./types";

const sampleFaqs: FaqItem[] = [
  { q: "What is this?", a: "A FAQ item." },
  { q: "Why use it?", a: "Because it helps." },
];

describe("hasHubFaqs", () => {
  it("returns true when faqs array has items", () => {
    expect(hasHubFaqs(sampleFaqs)).toBe(true);
  });

  it("returns false when faqs array is empty", () => {
    expect(hasHubFaqs([])).toBe(false);
  });

  it("returns true for a single FAQ item", () => {
    expect(hasHubFaqs([{ q: "Q?", a: "A." }])).toBe(true);
  });
});

describe("shouldShowFaqsOnPage", () => {
  it("returns true on page 1 when faqs are present", () => {
    expect(shouldShowFaqsOnPage(sampleFaqs, 1)).toBe(true);
  });

  it("returns false on page 2 even when faqs are present", () => {
    expect(shouldShowFaqsOnPage(sampleFaqs, 2)).toBe(false);
  });

  it("returns false on page 3 even when faqs are present", () => {
    expect(shouldShowFaqsOnPage(sampleFaqs, 3)).toBe(false);
  });

  it("returns false on page 1 when faqs array is empty", () => {
    expect(shouldShowFaqsOnPage([], 1)).toBe(false);
  });

  it("returns false on page 2 when faqs array is empty", () => {
    expect(shouldShowFaqsOnPage([], 2)).toBe(false);
  });

  it("returns true for a single FAQ on page 1", () => {
    expect(shouldShowFaqsOnPage([{ q: "Q?", a: "A." }], 1)).toBe(true);
  });
});

describe("normalizeHubCanonicalUrl", () => {
  it("adds a trailing slash to slashless hub URLs", () => {
    expect(normalizeHubCanonicalUrl("https://orderdock.app/resources")).toBe(
      "https://orderdock.app/resources/",
    );
  });

  it("preserves already canonical hub URLs", () => {
    expect(normalizeHubCanonicalUrl("https://orderdock.app/resources/")).toBe(
      "https://orderdock.app/resources/",
    );
  });
});
