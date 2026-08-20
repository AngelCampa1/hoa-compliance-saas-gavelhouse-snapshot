import { describe, it, expect } from "vitest";
import {
  CATEGORY_STYLES,
  CATEGORY_ICONS,
  mergeCategoryStyles,
  resolveIconColorPresentation,
} from "./trust-signal-styles";
import type { CategoryStyle } from "./trust-signal-styles";

const CATEGORIES = ["feature", "roi", "compliance", "integration"] as const;

describe("CATEGORY_STYLES", () => {
  it.each(CATEGORIES)("has an entry for %s", (category) => {
    expect(CATEGORY_STYLES[category]).toBeDefined();
  });

  it.each(CATEGORIES)("%s has all 4 style keys", (category) => {
    const style: CategoryStyle = CATEGORY_STYLES[category];
    expect(style).toHaveProperty("textColor");
    expect(style).toHaveProperty("bgColor");
    expect(style).toHaveProperty("borderColor");
    expect(style).toHaveProperty("iconColor");
  });

  it.each(CATEGORIES)("%s style values are non-empty strings", (category) => {
    const style = CATEGORY_STYLES[category];
    expect(style.textColor).toEqual(expect.any(String));
    expect(style.textColor.length).toBeGreaterThan(0);
    expect(style.bgColor).toEqual(expect.any(String));
    expect(style.bgColor.length).toBeGreaterThan(0);
    expect(style.borderColor).toEqual(expect.any(String));
    expect(style.borderColor.length).toBeGreaterThan(0);
    expect(style.iconColor).toEqual(expect.any(String));
    expect(style.iconColor.length).toBeGreaterThan(0);
  });
});

describe("mergeCategoryStyles", () => {
  it("returns base styles when overrides is empty", () => {
    const result = mergeCategoryStyles(CATEGORY_STYLES, {});
    expect(result).toEqual(CATEGORY_STYLES);
  });

  it("merges partial overrides for a single category", () => {
    const result = mergeCategoryStyles(CATEGORY_STYLES, {
      roi: { textColor: "text-custom-green" },
    });
    expect(result.roi.textColor).toBe("text-custom-green");
    // Other roi properties should remain from base
    expect(result.roi.bgColor).toBe(CATEGORY_STYLES.roi.bgColor);
    expect(result.roi.borderColor).toBe(CATEGORY_STYLES.roi.borderColor);
    expect(result.roi.iconColor).toBe(CATEGORY_STYLES.roi.iconColor);
  });

  it("does not mutate the base styles object", () => {
    const baseCopy = JSON.parse(
      JSON.stringify(CATEGORY_STYLES),
    ) as typeof CATEGORY_STYLES;
    mergeCategoryStyles(CATEGORY_STYLES, {
      feature: { bgColor: "bg-override" },
    });
    expect(CATEGORY_STYLES).toEqual(baseCopy);
  });

  it("merges overrides for multiple categories", () => {
    const result = mergeCategoryStyles(CATEGORY_STYLES, {
      feature: { iconColor: "text-red" },
      compliance: { borderColor: "border-blue" },
    });
    expect(result.feature.iconColor).toBe("text-red");
    expect(result.compliance.borderColor).toBe("border-blue");
    // Untouched categories remain unchanged
    expect(result.roi).toEqual(CATEGORY_STYLES.roi);
    expect(result.integration).toEqual(CATEGORY_STYLES.integration);
  });

  it("skips keys with undefined override values (defensive branch)", () => {
    // Simulate an override object where a key is present but set to undefined.
    // This exercises the `if (override)` false branch in mergeCategoryStyles.
    const overrides = { roi: undefined } as unknown as Parameters<
      typeof mergeCategoryStyles
    >[1];
    const result = mergeCategoryStyles(CATEGORY_STYLES, overrides);
    // roi should remain unchanged
    expect(result.roi).toEqual(CATEGORY_STYLES.roi);
  });

  it("fully overrides all properties of a category when all are provided", () => {
    const fullOverride: CategoryStyle = {
      textColor: "text-a",
      bgColor: "bg-a",
      borderColor: "border-a",
      iconColor: "icon-a",
    };
    const result = mergeCategoryStyles(CATEGORY_STYLES, {
      integration: fullOverride,
    });
    expect(result.integration).toEqual(fullOverride);
  });
});

describe("CATEGORY_ICONS", () => {
  it.each(CATEGORIES)("has an entry for %s", (category) => {
    expect(CATEGORY_ICONS[category]).toBeDefined();
  });

  it.each(CATEGORIES)("%s icon is a non-empty string", (category) => {
    expect(CATEGORY_ICONS[category]).toEqual(expect.any(String));
    expect(CATEGORY_ICONS[category].length).toBeGreaterThan(0);
  });
});

describe("resolveIconColorPresentation", () => {
  it("treats utility classes as class names", () => {
    expect(
      resolveIconColorPresentation("text-[var(--color-accent-500)]"),
    ).toEqual({
      className: "text-[var(--color-accent-500)]",
    });
  });

  it("treats raw hex colors as inline colors", () => {
    expect(resolveIconColorPresentation("#6B2D8B")).toEqual({
      color: "#6B2D8B",
    });
  });

  it("treats CSS function colors as inline colors", () => {
    expect(resolveIconColorPresentation("var(--color-accent-500)")).toEqual({
      color: "var(--color-accent-500)",
    });
  });

  it("returns an empty presentation for blank values", () => {
    expect(resolveIconColorPresentation("")).toEqual({});
  });
});
