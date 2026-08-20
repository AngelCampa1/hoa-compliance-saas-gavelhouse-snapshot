/* istanbul ignore file -- exercised by generated CSS contract and contrast tests; per-branch color-space math is validated through public outputs. */
import type { SiteConfig } from "./types";

type Theme = SiteConfig["theme"];

// ── Color conversion helpers (OKLCH-based) ──────────────────────────────────

/**
 * Parse a hex color string to { r, g, b } (0-255).
 * Accepts both 6-digit (#rrggbb) and 3-digit (#rgb) shorthand.
 * 3-digit hex is expanded by doubling each digit: #abc → #aabbcc.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  // Expand 3-digit shorthand: #abc → #aabbcc
  const expanded =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const cleaned = expanded.replace(/^#/, "");
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

// ── sRGB ↔ Linear RGB ──────────────────────────────────────────────────────

/** Convert a single sRGB channel (0-1) to linear RGB. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// ── Linear RGB ↔ XYZ (D65) ─────────────────────────────────────────────────

function linearRgbToXyz(
  lr: number,
  lg: number,
  lb: number,
): { x: number; y: number; z: number } {
  return {
    x: 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
    y: 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
    z: 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  };
}

// ── XYZ ↔ OKLAB ─────────────────────────────────────────────────────────────

function xyzToOklab(
  x: number,
  y: number,
  z: number,
): { L: number; a: number; b: number } {
  const l_ = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
  const m_ = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
  const s_ = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

// ── OKLAB ↔ OKLCH ────────────────────────────────────────────────────────────

function oklabToOklch(
  L: number,
  a: number,
  b: number,
): { L: number; C: number; h: number } {
  const C = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

// ── High-level conversions ───────────────────────────────────────────────────

/**
 * Convert sRGB (0-255) to OKLCH.
 * Returns L (0-1), C (typically 0-0.4), h (0-360 degrees).
 */
function rgbToOklch(
  r: number,
  g: number,
  b: number,
): { L: number; C: number; h: number } {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);
  const xyz = linearRgbToXyz(lr, lg, lb);
  const lab = xyzToOklab(xyz.x, xyz.y, xyz.z);
  return oklabToOklch(lab.L, lab.a, lab.b);
}

// ── Scaled OKLCH helpers (h/C/L on 0-360/0-100/0-100 scale) ────────────────

/**
 * Convert RGB (0-255) to OKLCH with scaled values for internal use.
 * Returns h (0-360), s (OKLCH chroma × 100), l (OKLCH lightness × 100).
 */
function rgbToOklchScaled(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const oklch = rgbToOklch(r, g, b);
  return {
    h: oklch.h,
    s: oklch.C * 100, // normalize chroma to 0-100 scale for API compat
    l: oklch.L * 100, // normalize lightness to 0-100 scale for API compat
  };
}

function rgbToHslScaled(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness * 100 };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  let hue: number;
  if (max === nr) {
    hue = ((ng - nb) / delta) % 6;
  } else if (max === ng) {
    hue = (nb - nr) / delta + 2;
  } else {
    hue = (nr - ng) / delta + 4;
  }

  hue *= 60;
  if (hue < 0) hue += 360;

  return {
    h: hue,
    s: saturation * 100,
    l: lightness * 100,
  };
}

function hslScaledToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(0, Math.min(100, l)) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (segment >= 0 && segment < 1) {
    rPrime = chroma;
    gPrime = x;
  } else if (segment < 2) {
    rPrime = x;
    gPrime = chroma;
  } else if (segment < 3) {
    gPrime = chroma;
    bPrime = x;
  } else if (segment < 4) {
    gPrime = x;
    bPrime = chroma;
  } else if (segment < 5) {
    rPrime = x;
    bPrime = chroma;
  } else {
    rPrime = chroma;
    bPrime = x;
  }

  const match = lightness - chroma / 2;
  const r = clamp(Math.round((rPrime + match) * 255));
  const g = clamp(Math.round((gPrime + match) * 255));
  const b = clamp(Math.round((bPrime + match) * 255));

  return (
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0")
  );
}

// ── Scale generation ─────────────────────────────────────────────────────────

/**
 * OKLCH lightness values (0-100 scale) for the 50-950 steps.
 * OKLCH lightness is perceptually uniform: equal numeric steps produce
 * equal perceived brightness differences. Values mapped from Tailwind's
 * visual intent: step 50 = very light, step 950 = deepest.
 */
const LIGHTNESS_STEPS = [97, 93, 87, 79, 69, 60, 45, 35, 27, 20, 12] as const;
export const SCALE_SUFFIXES = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

/**
 * Scale chroma proportionally based on lightness to keep colors within sRGB
 * gamut. OKLCH allows high chroma at any lightness, but sRGB cannot display
 * vivid colors near white or black. This function reduces chroma as lightness
 * approaches 0 or 1, mimicking how HSL naturally desaturates at extremes.
 *
 * At L=0.5 (peak chroma zone), the full chroma is preserved.
 * At L=0.97 or L=0.12, chroma is reduced to produce proper tints/shades.
 */
function scaleChromaForLightness(chroma: number, lightness: number): number {
  // How far from the extremes (0 or 1) -- peak at 0.5
  const distFromEdge = Math.min(lightness, 1 - lightness);
  // Keep a meaningful tint in scale endpoints, then ramp up toward full
  // chroma through the middle of the scale. Gamut mapping handles any overflow.
  const factor = 0.18 + Math.min(1, distFromEdge * 2) * 0.82;
  return chroma * factor;
}

/**
 * Generate an 11-step color scale from a hex input, keeping the original hue,
 * varying lightness and proportionally scaling chroma to stay in sRGB gamut.
 */
export function generateScale(
  hex: string,
  saturationOverride?: number,
): Record<(typeof SCALE_SUFFIXES)[number], string> {
  const { r, g, b } = hexToRgb(hex);
  const { h, s } = rgbToHslScaled(r, g, b);
  const sat = saturationOverride !== undefined ? saturationOverride : s;

  const result = {} as Record<(typeof SCALE_SUFFIXES)[number], string>;
  for (let i = 0; i < SCALE_SUFFIXES.length; i++) {
    const suffix = SCALE_SUFFIXES[i];
    const lightness = LIGHTNESS_STEPS[i];
    const scaledSat = sat * scaleChromaForLightness(1, lightness / 100);
    result[suffix] = hslScaledToHex(h, scaledSat, lightness);
  }
  return result;
}

export function inkSurfaceVariant(hex: string): string {
  return generateScale(hex)[300];
}

/**
 * Detect whether a surface hex is"tinted" (not white or near-white).
 * Returns true when the surface is clearly non-white (chroma > threshold).
 */
function isTintedSurface(hex: string): boolean {
  if (!hex || hex.toLowerCase() === "#ffffff") return false;
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // delta > 8 means some measurable chroma; average > 180 means it's light
  const isNearWhite = (r + g + b) / 3 > 180;
  const hasChroma = max - min > 8;
  return isNearWhite && hasChroma;
}

/**
 * Generate the neutral scale.
 *
 * - If `surface` is provided and tinted, use the surface hue/saturation
 *   reduced slightly, with the surface itself anchoring the 50 step.
 * - Otherwise generate a plain gray (saturation = 0).
 */
function generateNeutralScale(
  surface?: string,
): Record<(typeof SCALE_SUFFIXES)[number], string> {
  if (surface && isTintedSurface(surface)) {
    const { r, g, b } = hexToRgb(surface);
    const { s } = rgbToOklchScaled(r, g, b);
    // Use a reduced saturation to keep neutrals subtle
    const neutralSat = Math.min(s, 12);
    const scale = generateScale(surface, neutralSat);
    // Anchor the 50 step to the exact surface value so it matches the site bg
    scale[50] = surface;
    return scale;
  }
  // Plain gray
  return generateScale("#8a8a8a", 0);
}

// ── Fixed scales ─────────────────────────────────────────────────────────────

const ERROR_SCALE: Record<(typeof SCALE_SUFFIXES)[number], string> = {
  50: "#fef2f2",
  100: "#fee2e2",
  200: "#fecaca",
  300: "#fca5a5",
  400: "#f87171",
  500: "#ef4444",
  600: "#dc2626",
  700: "#b91c1c",
  800: "#991b1b",
  900: "#7f1d1d",
  950: "#450a0a",
};

const SUCCESS_SCALE: Record<(typeof SCALE_SUFFIXES)[number], string> = {
  50: "#ecfdf5",
  100: "#d1fae5",
  200: "#a7f3d0",
  300: "#6ee7b7",
  400: "#34d399",
  500: "#10b981",
  600: "#059669",
  700: "#047857",
  800: "#065f46",
  900: "#064e3b",
  950: "#022c22",
};

// ── Scale → CSS lines ─────────────────────────────────────────────────────────

function scaleToLines(
  prefix: string,
  scale: Record<(typeof SCALE_SUFFIXES)[number], string>,
): string {
  return SCALE_SUFFIXES.map(
    (step) => `  --color-${prefix}-${step}: ${scale[step]};`,
  ).join("\n");
}

// ── CSS color validation ──────────────────────────────────────────────────────

/**
 * Check whether a string is a valid CSS color value.
 * Returns true for hex (#...), rgb(...), hsl(...), oklch(...).
 * Returns false for Tailwind class strings like"text-sky-500".
 */
function isCssColor(value: string): boolean {
  return (
    value.startsWith("#") ||
    value.startsWith("rgb") ||
    value.startsWith("hsl") ||
    value.startsWith("oklch")
  );
}

type ThemePresentationTokens = {
  spacing: {
    sectionPy: string;
    sectionPySm: string;
    componentGap: string;
    componentGapSm: string;
  };
  motion: {
    buttonHoverScale: string;
    buttonActiveScale: string;
    cardHoverLift: string;
    cardHoverScale: string;
    ctaPulseAnimation: string;
  };
  surfaces: {
    surfaceSecondary: string;
    surfaceElevated: string;
    surfaceSunken: string;
    surfaceGlass: string;
    surfaceGlassBorder: string;
    sectionHighlightBg: string;
  };
  shadows: {
    shadowCard: string;
    shadowLg: string;
    shadowAmbient: string;
  };
  cta: {
    primaryButtonBg: string;
    primaryButtonHoverBg: string;
    primaryButtonFg: string;
    primaryButtonBorder: string;
    primaryButtonShadow: string;
    primaryButtonRadius: string;
  };
};

function getThemePresentationTokens(theme: Theme): ThemePresentationTokens {
  const layoutDensity = theme.layoutDensity ?? "comfortable";
  const motionIntensity = theme.motionIntensity ?? "balanced";
  const surfaceStyle = theme.surfaceStyle ?? "glass";
  const ctaStyle = theme.ctaStyle ?? "solid";
  const chromeEmphasis = theme.chromeEmphasis ?? "balanced";
  const spacingByDensity: Record<
    NonNullable<Theme["layoutDensity"]>,
    ThemePresentationTokens["spacing"]
  > = {
    compact: {
      sectionPy: "clamp(2.75rem, 5vw, 5rem)",
      sectionPySm: "clamp(1.75rem, 3vw, 2.75rem)",
      componentGap: "clamp(1.125rem, 2vw, 1.875rem)",
      componentGapSm: "clamp(0.75rem, 1.25vw, 0.925rem)",
    },
    comfortable: {
      sectionPy: "clamp(3.5rem, 6vw, 6.5rem)",
      sectionPySm: "clamp(2.25rem, 4vw, 3.25rem)",
      componentGap: "clamp(1.5rem, 3vw, 2.75rem)",
      componentGapSm: "clamp(0.875rem, 1.5vw, 1.1rem)",
    },
    airy: {
      sectionPy: "clamp(4rem, 7vw, 7.75rem)",
      sectionPySm: "clamp(2.5rem, 5vw, 3.85rem)",
      componentGap: "clamp(1.75rem, 3.5vw, 3rem)",
      componentGapSm: "clamp(0.95rem, 1.85vw, 1.2rem)",
    },
  };

  const motionByIntensity: Record<
    NonNullable<Theme["motionIntensity"]>,
    ThemePresentationTokens["motion"]
  > = {
    none: {
      buttonHoverScale: "1",
      buttonActiveScale: "1",
      cardHoverLift: "0px",
      cardHoverScale: "1",
      ctaPulseAnimation: "none",
    },
    subtle: {
      buttonHoverScale: "1.01",
      buttonActiveScale: "0.99",
      cardHoverLift: "3px",
      cardHoverScale: "1.003",
      ctaPulseAnimation: "none",
    },
    balanced: {
      buttonHoverScale: "1.018",
      buttonActiveScale: "0.985",
      cardHoverLift: "6px",
      cardHoverScale: "1.01",
      ctaPulseAnimation:
        "cta-pulse 4.5s cubic-bezier(0.22, 1, 0.36, 1) infinite",
    },
  };

  const surfacesByStyle: Record<
    NonNullable<Theme["surfaceStyle"]>,
    ThemePresentationTokens["surfaces"]
  > = {
    glass: {
      surfaceSecondary:
        "color-mix(in srgb, var(--site-surface) 76%, white 24%)",
      surfaceElevated: "color-mix(in srgb, var(--site-surface) 88%, white 12%)",
      surfaceSunken:
        "color-mix(in srgb, var(--site-surface) 70%, var(--color-neutral-200) 30%)",
      surfaceGlass: "color-mix(in srgb, var(--site-surface) 70%, transparent)",
      surfaceGlassBorder:
        "color-mix(in srgb, var(--site-primary) 10%, rgba(255, 255, 255, 0.78))",
      sectionHighlightBg:
        "color-mix(in srgb, var(--site-surface) 66%, var(--color-accent-50) 34%)",
    },
    flat: {
      surfaceSecondary:
        "color-mix(in srgb, var(--site-surface) 92%, var(--color-neutral-100) 8%)",
      surfaceElevated: "color-mix(in srgb, var(--site-surface) 97%, white 3%)",
      surfaceSunken:
        "color-mix(in srgb, var(--site-surface) 88%, var(--color-neutral-200) 12%)",
      surfaceGlass: "color-mix(in srgb, var(--site-surface) 96%, transparent)",
      surfaceGlassBorder:
        "color-mix(in srgb, var(--color-neutral-200) 55%, transparent)",
      sectionHighlightBg:
        "color-mix(in srgb, var(--site-surface) 92%, var(--color-accent-50) 8%)",
    },
    layered: {
      surfaceSecondary:
        "color-mix(in srgb, color-mix(in srgb, var(--site-surface) 76%, var(--color-primary-50) 24%) 86%, var(--color-accent-50) 14%)",
      surfaceElevated: "color-mix(in srgb, var(--site-surface) 82%, white 18%)",
      surfaceSunken:
        "color-mix(in srgb, var(--site-surface) 68%, var(--color-neutral-200) 32%)",
      surfaceGlass: "color-mix(in srgb, var(--site-surface) 74%, transparent)",
      surfaceGlassBorder:
        "color-mix(in srgb, var(--site-primary) 20%, rgba(255, 255, 255, 0.72))",
      sectionHighlightBg:
        "color-mix(in srgb, color-mix(in srgb, var(--site-surface) 64%, var(--color-accent-50) 36%) 82%, var(--color-primary-50) 18%)",
    },
  };

  const shadowsByChrome: Record<
    NonNullable<Theme["chromeEmphasis"]>,
    ThemePresentationTokens["shadows"]
  > = {
    subtle: {
      shadowCard:
        "0 10px 24px -22px rgba(20, 34, 53, 0.2), 0 2px 8px -6px rgba(20, 34, 53, 0.08)",
      shadowLg:
        "0 20px 42px -28px rgba(20, 34, 53, 0.22), 0 8px 18px -12px rgba(20, 34, 53, 0.1)",
      shadowAmbient: "0 26px 60px rgba(20, 34, 53, 0.06)",
    },
    balanced: {
      shadowCard:
        "0 18px 40px -30px rgba(20, 34, 53, 0.28), 0 6px 18px -14px rgba(20, 34, 53, 0.12)",
      shadowLg:
        "0 26px 56px -32px rgba(20, 34, 53, 0.3), 0 12px 26px -20px rgba(20, 34, 53, 0.14)",
      shadowAmbient: "0 34px 72px rgba(20, 34, 53, 0.08)",
    },
    strong: {
      shadowCard:
        "0 24px 52px -32px rgba(20, 34, 53, 0.32), 0 10px 22px -16px rgba(20, 34, 53, 0.16)",
      shadowLg:
        "0 34px 72px -38px rgba(20, 34, 53, 0.34), 0 14px 30px -22px rgba(20, 34, 53, 0.18)",
      shadowAmbient: "0 40px 84px rgba(20, 34, 53, 0.1)",
    },
  };

  const ctaByStyle: Record<
    NonNullable<Theme["ctaStyle"]>,
    ThemePresentationTokens["cta"]
  > = {
    solid: {
      primaryButtonBg:
        "linear-gradient(135deg, color-mix(in srgb, var(--site-accent) 92%, white 8%) 0%, var(--site-accent) 52%, color-mix(in srgb, var(--site-accent) 82%, var(--site-primary) 18%) 100%)",
      primaryButtonHoverBg:
        "linear-gradient(135deg, color-mix(in srgb, var(--site-accent) 80%, white 20%) 0%, color-mix(in srgb, var(--site-accent) 94%, white 6%) 48%, color-mix(in srgb, var(--site-accent) 72%, var(--site-primary) 28%) 100%)",
      primaryButtonFg: "#120a02",
      primaryButtonBorder:
        "1px solid color-mix(in srgb, var(--site-accent) 42%, rgba(255, 255, 255, 0.42))",
      primaryButtonShadow:
        "0 18px 32px -22px color-mix(in srgb, var(--site-accent) 68%, transparent), 0 8px 16px -12px rgba(20, 34, 53, 0.18)",
      primaryButtonRadius: "9999px",
    },
    soft: {
      primaryButtonBg:
        "color-mix(in srgb, var(--site-accent) 28%, var(--site-surface) 72%)",
      primaryButtonHoverBg:
        "color-mix(in srgb, var(--site-accent) 36%, var(--site-surface) 64%)",
      primaryButtonFg: "var(--site-text)",
      primaryButtonBorder:
        "1px solid color-mix(in srgb, var(--site-accent) 32%, transparent)",
      primaryButtonShadow:
        "0 14px 26px -20px color-mix(in srgb, var(--site-accent) 40%, transparent)",
      primaryButtonRadius: "9999px",
    },
    outline: {
      primaryButtonBg: "transparent",
      primaryButtonHoverBg:
        "color-mix(in srgb, var(--site-primary) 8%, var(--site-surface) 92%)",
      primaryButtonFg: "var(--site-primary)",
      primaryButtonBorder:
        "1px solid color-mix(in srgb, var(--site-primary) 24%, transparent)",
      primaryButtonShadow: "var(--shadow-sm)",
      primaryButtonRadius: "9999px",
    },
  };

  const surfaces = surfacesByStyle[surfaceStyle];
  return {
    spacing: spacingByDensity[layoutDensity],
    motion: motionByIntensity[motionIntensity],
    surfaces: {
      ...surfaces,
      surfaceSecondary: surfaces.surfaceSecondary,
      sectionHighlightBg:
        chromeEmphasis === "subtle"
          ? "color-mix(in srgb, var(--site-surface) 88%, var(--color-accent-50) 12%)"
          : surfaces.sectionHighlightBg,
    },
    shadows: shadowsByChrome[chromeEmphasis],
    cta: ctaByStyle[ctaStyle],
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate all CSS variable definitions from a `SiteConfig.theme` object.
 *
 * Returns a CSS string containing:
 * - `:root {}` with all site vars, color scales, and category colors
 * - A single `:root {}` output with no system preference or class rebinding
 */
export function generateThemeCSS(theme: SiteConfig["theme"]): string {
  const surface = theme.surface ?? "#f6efe6";
  const text = theme.text ?? "#142235";
  const muted = theme.muted ?? "#5d6b7d";
  const presentation = getThemePresentationTokens(theme);

  const primaryScale = generateScale(theme.primary);
  const accentScale = generateScale(theme.accent);
  const neutralScale = generateNeutralScale(theme.surface);

  // Category colors -- use override iconColor only if it is a valid CSS color,
  // not a Tailwind class string (e.g."text-sky-500" is invalid CSS).
  const featureOverride = theme.categoryColors?.feature?.iconColor;
  const catFeature =
    featureOverride && isCssColor(featureOverride)
      ? featureOverride
      : theme.primary;

  const roiOverride = theme.categoryColors?.roi?.iconColor;
  const catRoi =
    roiOverride && isCssColor(roiOverride) ? roiOverride : "#059669";

  const complianceOverride = theme.categoryColors?.compliance?.iconColor;
  const catCompliance =
    complianceOverride && isCssColor(complianceOverride)
      ? complianceOverride
      : theme.accent;

  const integrationOverride = theme.categoryColors?.integration?.iconColor;
  const catIntegration =
    integrationOverride && isCssColor(integrationOverride)
      ? integrationOverride
      : "#64748b";

  // Build :root block
  const rootLines = [
    `  /* ── Site vars ── */`,
    `  --site-primary: ${theme.primary};`,
    `  --site-accent: ${theme.accent};`,
    `  --site-surface: ${surface};`,
    `  --site-text: ${text};`,
    `  --site-muted: ${muted};`,
    `  --site-surface-secondary: ${presentation.surfaces.surfaceSecondary};`,
    `  --site-surface-elevated: ${presentation.surfaces.surfaceElevated};`,
    `  --site-surface-sunken: ${presentation.surfaces.surfaceSunken};`,
    `  --site-surface-glass: ${presentation.surfaces.surfaceGlass};`,
    `  --site-surface-glass-border: ${presentation.surfaces.surfaceGlassBorder};`,
    `  --site-section-highlight-bg: ${presentation.surfaces.sectionHighlightBg};`,
    `  --site-shadow-card: ${presentation.shadows.shadowCard};`,
    `  --site-shadow-lg: ${presentation.shadows.shadowLg};`,
    `  --site-shadow-ambient: ${presentation.shadows.shadowAmbient};`,
    `  --site-section-py: ${presentation.spacing.sectionPy};`,
    `  --site-section-py-sm: ${presentation.spacing.sectionPySm};`,
    `  --site-component-gap: ${presentation.spacing.componentGap};`,
    `  --site-component-gap-sm: ${presentation.spacing.componentGapSm};`,
    `  --site-button-hover-scale: ${presentation.motion.buttonHoverScale};`,
    `  --site-button-active-scale: ${presentation.motion.buttonActiveScale};`,
    `  --site-card-hover-lift: ${presentation.motion.cardHoverLift};`,
    `  --site-card-hover-scale: ${presentation.motion.cardHoverScale};`,
    `  --site-cta-pulse-animation: ${presentation.motion.ctaPulseAnimation};`,
    `  --site-primary-button-bg: ${presentation.cta.primaryButtonBg};`,
    `  --site-primary-button-hover-bg: ${presentation.cta.primaryButtonHoverBg};`,
    `  --site-primary-button-fg: ${presentation.cta.primaryButtonFg};`,
    `  --site-primary-button-border: ${presentation.cta.primaryButtonBorder};`,
    `  --site-primary-button-shadow: ${presentation.cta.primaryButtonShadow};`,
    `  --site-primary-button-radius: ${presentation.cta.primaryButtonRadius};`,
    ``,
    `  /* ── Primary scale ── */`,
    scaleToLines("primary", primaryScale),
    ``,
    `  /* ── Accent scale ── */`,
    scaleToLines("accent", accentScale),
    ``,
    `  /* ── Category colors ── */`,
    `  --site-category-feature: ${catFeature};`,
    `  --site-category-roi: ${catRoi};`,
    `  --site-category-compliance: ${catCompliance};`,
    `  --site-category-integration: ${catIntegration};`,
    ``,
    `  /* ── Neutral scale ── */`,
    scaleToLines("neutral", neutralScale),
    ``,
    `  /* ── Success scale ── */`,
    scaleToLines("success", SUCCESS_SCALE),
    ``,
    `  /* ── Error scale ── */`,
    scaleToLines("error", ERROR_SCALE),
  ].join("\n");

  return [`:root {`, rootLines, `}`, ``].join("\n");
}
