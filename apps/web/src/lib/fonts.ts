interface FontConfig {
  heading: string;
  body: string;
  mono?: string;
}

/**
 * Default fonts used when no `fonts` prop is provided to base-layout.
 * Matches the previously hardcoded fallback URL -- kept here so the layout
 * always calls `buildGoogleFontsUrl` rather than maintaining a separate string.
 */
export const DEFAULT_FONTS: FontConfig = {
  heading: "Source Serif 4",
  body: "Inter",
  mono: "JetBrains Mono",
};

/**
 * Builds a CSS string that overrides the --font-heading, --font-body, and
 * --font-mono custom properties on :root to match the site's font config.
 *
 * Without this, globals.css hardcodes default font names in the CSS variables
 * while Google Fonts loads the site-specific fonts -- causing a mismatch.
 */
export function buildFontCssOverrides(fonts: FontConfig): string {
  const mono = fonts.mono ?? DEFAULT_FONTS.mono;
  const headingFallback =
    fonts.heading === "Libre Baskerville" || fonts.heading === "Source Serif 4"
      ? "Georgia, serif"
      : "system-ui, sans-serif";
  const bodyFallback =
    fonts.body === "Libre Baskerville"
      ? "Georgia, serif"
      : "system-ui, sans-serif";
  return `:root {
  --font-heading: "${fonts.heading}", ${headingFallback};
  --font-body: "${fonts.body}", ${bodyFallback};
  --font-mono: "${mono}", ui-monospace, monospace;
}`;
}

/**
 * Builds a Google Fonts CSS URL from a font configuration.
 *
 * Accepts font family names as-is (e.g. "Space Grotesk", "IBM Plex Sans").
 * Spaces are replaced with `+` for the URL. Always appends `display=swap`.
 */
export function buildGoogleFontsUrl(fonts: FontConfig): string {
  const families: string[] = [];

  const encode = (name: string) => name.replace(/ /g, "+");
  const fontVariants: Record<string, string> = {
    "Libre Baskerville": "ital,wght@0,400;0,700;1,400",
    "Source Serif 4": "ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600",
    "Public Sans": "ital,wght@0,400;0,500;0,600;0,700;1,400",
    Inter: "wght@400;500;600;700;800",
    "JetBrains Mono": "wght@400;500;700",
  };

  const headingVariant = fontVariants[fonts.heading] ?? "wght@400;500;600;700";
  const bodyVariant =
    fontVariants[fonts.body] ?? "ital,wght@0,400;0,500;0,600;1,400";
  const monoVariant = fontVariants[fonts.mono ?? ""] ?? "wght@400;500;700";

  families.push(`family=${encode(fonts.heading)}:${headingVariant}`);
  families.push(`family=${encode(fonts.body)}:${bodyVariant}`);

  if (fonts.mono) {
    families.push(`family=${encode(fonts.mono)}:${monoVariant}`);
  }

  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}
