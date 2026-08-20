import { test } from "@playwright/test";
import {
  WEB_ORIGIN,
  WEB_VIEWPORTS,
  visitAndCapture,
} from "./support/capture.js";

/**
 * Screenshot archive: marketing site templates.
 *
 * apps/web has 27 page files but 443 content entries across 9 collections, so
 * this captures one representative page per template rather than per entry.
 * Requires `pnpm --filter @boardstack/web dev` on :3061.
 */

/**
 * Static pages, one per top-level template.
 *
 * Trailing slashes are required: astro.config.mjs sets
 * `trailingSlash: "always"`, so `/pricing` is a 404 and `/pricing/` is the page.
 */
const STATIC_ROUTES = [
  "/",
  "/pricing/",
  "/features/",
  "/compare/",
  "/compare/alternatives/",
  "/compare/pricing/",
  "/compare/versus/",
  "/resources/",
  "/solutions/",
  "/free/",
  "/help/",
  "/hoa-compliance/",
  "/product/",
  "/about/",
  "/contact/",
];

/**
 * One entry per dynamic template. Slugs are resolved at runtime from the
 * collection index pages so this does not rot when content changes.
 */
/**
 * `(?!\d+\/)` skips paginated index pages such as `/solutions/2/`, which share
 * the shape of a content slug but render the listing template.
 */
const DYNAMIC_TEMPLATES: ReadonlyArray<{ index: string; pattern: RegExp }> = [
  {
    index: "/compare/alternatives/",
    pattern: /^\/compare\/alternatives\/(?!\d+\/)[^/]+\/$/,
  },
  {
    index: "/compare/pricing/",
    pattern: /^\/compare\/pricing\/(?!\d+\/)[^/]+\/$/,
  },
  {
    index: "/compare/versus/",
    pattern: /^\/compare\/versus\/(?!\d+\/)[^/]+\/$/,
  },
  { index: "/solutions/", pattern: /^\/solutions\/(?!\d+\/)[^/]+\/$/ },
  { index: "/product/", pattern: /^\/product\/(?!\d+\/)[^/]+\/$/ },
  {
    index: "/resources/",
    pattern: /^\/resources\/guides\/(?!\d+\/)[^/]+\/$/,
  },
  {
    index: "/resources/best/",
    pattern: /^\/resources\/best\/(?!\d+\/)[^/]+\/$/,
  },
  // Hubs have no index of their own; they are linked from /resources/.
  { index: "/resources/", pattern: /^\/resources\/hubs\/(?!\d+\/)[^/]+\/$/ },
  { index: "/free/", pattern: /^\/free\/(?!\d+\/)[^/]+\/$/ },
  { index: "/help/", pattern: /^\/help\/(?!\d+\/)[^/]+\/$/ },
];

/** A paginated listing page, captured deliberately as its own template. */
const PAGINATION_ROUTE = "/solutions/2/";

/** State pages with different regulatory classifications. */
const STATE_ROUTES = [
  "/hoa-compliance/california/",
  "/hoa-compliance/florida/",
  "/hoa-compliance/texas/",
];

test.describe("screenshot archive — marketing", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of WEB_VIEWPORTS) {
    test(`static templates at ${viewport.name}`, async ({ page }) => {
      test.setTimeout(180_000);
      for (const route of STATIC_ROUTES) {
        await visitAndCapture({
          page,
          surface: `web/${viewport.name}`,
          route,
          viewport,
          origin: WEB_ORIGIN,
        });
      }
    });

    test(`dynamic templates at ${viewport.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      const seen = new Set<string>();

      for (const { index, pattern } of DYNAMIC_TEMPLATES) {
        await page.goto(`${WEB_ORIGIN}${index}`);
        const hrefs = await page
          .locator("a[href]")
          .evaluateAll((nodes) =>
            nodes.map(
              (n) => (n as HTMLAnchorElement).getAttribute("href") ?? "",
            ),
          );

        const match = hrefs
          .map((h) => h.replace(WEB_ORIGIN, "").split("?")[0] ?? "")
          .find((h) => pattern.test(h) && !seen.has(h));

        // Failing here is deliberate. Silently skipping is how an earlier run
        // produced an archive with no dynamic-template pages at all.
        if (!match) {
          throw new Error(
            `No link matching ${pattern} found on ${index}. ` +
              `The content collection or its URL shape has changed.`,
          );
        }
        seen.add(match);

        await visitAndCapture({
          page,
          surface: `web/${viewport.name}`,
          route: match,
          viewport,
          origin: WEB_ORIGIN,
        });
      }

      await visitAndCapture({
        page,
        surface: `web/${viewport.name}`,
        route: PAGINATION_ROUTE,
        viewport,
        origin: WEB_ORIGIN,
        name: "solutions-paginated",
      });
    });

    test(`state pages at ${viewport.name}`, async ({ page }) => {
      test.setTimeout(120_000);
      for (const route of STATE_ROUTES) {
        await visitAndCapture({
          page,
          surface: `web/${viewport.name}`,
          route,
          viewport,
          origin: WEB_ORIGIN,
        });
      }

      await visitAndCapture({
        page,
        surface: `web/${viewport.name}`,
        route: "/this-page-does-not-exist/",
        viewport,
        origin: WEB_ORIGIN,
        name: "404",
        expectStatus: 404,
      });
    });
  }
});
