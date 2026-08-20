type SitemapChangefreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

/**
 * Minimal shape matching @astrojs/sitemap's SitemapItem.
 * Typed inline to avoid adding @astrojs/sitemap as a direct dependency.
 */
type SitemapItem = {
  url: string;
  lastmod?: Date | undefined;
  changefreq?: SitemapChangefreq | undefined;
  priority?: number | undefined;
  [key: string]: unknown;
};

/**
 * A rule that maps a URL pathname pattern to a priority and optional changefreq.
 * The first matching rule wins.
 */
export type PriorityRule = {
  pattern: RegExp;
  priority: number;
  changefreq?: SitemapChangefreq;
};

type PriorityChangefreq = { priority: number; changefreq: SitemapChangefreq };

/** Built-in default rules applied when no custom rule (or no custom rule with that field) matches. */
const DEFAULT_RULES: Array<PriorityRule & { changefreq: SitemapChangefreq }> = [
  { pattern: /^\/$/, priority: 1.0, changefreq: "weekly" },
  { pattern: /alternatives|pricing/, priority: 0.9, changefreq: "monthly" },
  { pattern: /versus|best/, priority: 0.7, changefreq: "monthly" },
  { pattern: /guides/, priority: 0.5, changefreq: "monthly" },
  { pattern: /privacy|terms/, priority: 0.1, changefreq: "yearly" },
  // Hub pages: critical navigation hubs that need higher priority than generic depth-2 fallback
  { pattern: /^\/compare\/?$/, priority: 0.85, changefreq: "weekly" },
  { pattern: /^\/resources\/?$/, priority: 0.85, changefreq: "weekly" },
  { pattern: /^\/hoa-compliance\/?$/, priority: 0.85, changefreq: "weekly" },
  // Depth <= 2: pathname has at most two non-empty segments (e.g. /compare or /resources/overview)
  // Checked after keyword rules so e.g. /privacy (depth 1) is caught above first.
  {
    pattern: /^\/[^/]*\/?$|^\/[^/]+\/[^/]+\/?$/,
    priority: 0.4,
    changefreq: "weekly",
  },
];

const FALLBACK: PriorityChangefreq = { priority: 0.6, changefreq: "monthly" };
const DEFAULT_LASTMOD = "2026-01-01";

/**
 * Resolves priority and changefreq for a pathname using the given custom rules
 * followed by the built-in defaults. Returns only the fields that need to be
 * injected (i.e., not already set on the item).
 */
function resolvePriorityChangefreq(
  pathname: string,
  customRules: PriorityRule[],
): PriorityChangefreq {
  // Try custom rules first (first match wins for the whole object)
  for (const rule of customRules) {
    if (rule.pattern.test(pathname)) {
      return {
        priority: rule.priority,
        changefreq: rule.changefreq ?? resolveChangefreqFromDefaults(pathname),
      };
    }
  }

  // Fall through to built-in defaults
  for (const rule of DEFAULT_RULES) {
    if (rule.pattern.test(pathname)) {
      return { priority: rule.priority, changefreq: rule.changefreq };
    }
  }

  return FALLBACK;
}

/**
 * Resolves only the changefreq using built-in defaults (used when a custom rule
 * sets priority but has no changefreq).
 */
function resolveChangefreqFromDefaults(pathname: string): SitemapChangefreq {
  for (const rule of DEFAULT_RULES) {
    if (rule.pattern.test(pathname)) {
      return rule.changefreq;
    }
  }
  return FALLBACK.changefreq;
}

/**
 * Creates a serialize callback for @astrojs/sitemap's `serialize` option.
 *
 * Injects `lastmod` into every sitemap item. If a path→date map is provided,
 * matching paths get the mapped date; all others fall back to the build date.
 *
 * Also injects `priority` and `changefreq` based on pathname patterns unless
 * those fields are already present on the item. Custom `priorityRules` are
 * checked first (first-match-wins); if none match, the built-in defaults apply.
 *
 * @param dates - Optional map of URL pathnames to ISO date strings,
 *   e.g. `{"/compare/alternatives/servicetitan": "2026-03-15" }`
 * @param options.priorityRules - Optional custom rules checked before built-in defaults
 * @returns A serialize function compatible with `@astrojs/sitemap`'s `serialize` option
 */
export function createSitemapSerializer(
  dates?: Record<string, string>,
  options?: { priorityRules?: PriorityRule[] },
): (item: SitemapItem) => SitemapItem {
  const customRules = options?.priorityRules ?? [];

  return (item: SitemapItem): SitemapItem => {
    const pathname = new URL(item.url).pathname;
    const dateStr = dates?.[pathname];
    const lastmod = new Date(dateStr ?? DEFAULT_LASTMOD);

    const resolved = resolvePriorityChangefreq(pathname, customRules);

    return {
      ...item,
      lastmod,
      priority: item.priority !== undefined ? item.priority : resolved.priority,
      changefreq:
        item.changefreq !== undefined ? item.changefreq : resolved.changefreq,
    };
  };
}
