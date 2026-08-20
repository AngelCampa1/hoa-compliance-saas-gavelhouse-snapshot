import { hexToRgb, srgbToLinear } from "./generate-theme-css.js";

/**
 * Compute WCAG 2.1 relative luminance from a hex color string.
 * Uses the sRGB linearization formula and ITU-R BT.709 coefficients.
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const rLinear = srgbToLinear(r / 255);
  const gLinear = srgbToLinear(g / 255);
  const bLinear = srgbToLinear(b / 255);
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Compute the WCAG 2.1 contrast ratio between two hex colors.
 * Returns a value between 1 (no contrast) and 21 (max contrast).
 * @see https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check whether two colors meet WCAG 2.1 AA contrast requirements.
 * Normal text: 4.5:1 minimum. Large text (18pt+ or 14pt+ bold): 3:1 minimum.
 */
export function meetsAA(
  hex1: string,
  hex2: string,
  isLargeText = false,
): boolean {
  const threshold = isLargeText ? 3 : 4.5;
  return contrastRatio(hex1, hex2) >= threshold;
}

/**
 * Check whether two colors meet WCAG 2.1 AAA contrast requirements.
 * Normal text: 7:1 minimum. Large text (18pt+ or 14pt+ bold): 4.5:1 minimum.
 */
export function meetsAAA(
  hex1: string,
  hex2: string,
  isLargeText = false,
): boolean {
  const threshold = isLargeText ? 4.5 : 7;
  return contrastRatio(hex1, hex2) >= threshold;
}
