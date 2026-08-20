import { test } from "@playwright/test";
import {
  DESKTOP,
  EMPTY_EMAIL,
  MOBILE,
  WEB_ORIGIN,
  loginAs,
  visitAndCapture,
} from "./support/capture.js";

/**
 * Screenshot archive: unauthenticated flows and empty states.
 *
 * Numbered so the sequence reads in order when browsing the directory.
 */

const AUTH_SCREENS = [
  { route: "/login", name: "01-login" },
  { route: "/signup", name: "02-signup" },
  { route: "/forgot-password", name: "03-forgot-password" },
  { route: "/reset-password", name: "04-reset-password" },
];

/**
 * The empty-state account is seeded with a community and a default chart of
 * accounts and nothing else, so these render the zero-data design that is
 * otherwise unreachable once demo data exists.
 */
const EMPTY_STATE_ROUTES = [
  "/dashboard",
  "/finance/journal",
  "/finance/dues",
  "/finance/reserves",
  "/bank/statements",
  "/governance/homeowners",
  "/governance/violations",
  "/governance/meetings",
  "/reports/trial-balance",
  "/close",
];

test.describe("screenshot archive — flows and empty states", () => {
  test.describe.configure({ mode: "serial" });

  test("auth screens", async ({ page }) => {
    test.setTimeout(120_000);
    for (const { route, name } of AUTH_SCREENS) {
      await visitAndCapture({
        page,
        surface: "flows",
        route,
        viewport: DESKTOP,
        name,
      });
    }
  });

  test("auth screens on mobile", async ({ page }) => {
    test.setTimeout(120_000);
    for (const { route, name } of AUTH_SCREENS) {
      await visitAndCapture({
        page,
        surface: "flows",
        route,
        viewport: MOBILE,
        name: `${name}-mobile`,
      });
    }
  });

  test("owner portal", async ({ page }) => {
    for (const route of ["/owner", "/portal"]) {
      await visitAndCapture({
        page,
        surface: "flows",
        route,
        viewport: DESKTOP,
        name: `05-owner${route.replace("/", "-")}`,
      });
    }
  });

  test("marketing signup entry point", async ({ page }) => {
    await visitAndCapture({
      page,
      surface: "flows",
      // Trailing slash required — apps/web sets trailingSlash: "always".
      route: "/pricing/",
      viewport: DESKTOP,
      name: "00-marketing-pricing",
      origin: WEB_ORIGIN,
    });
  });

  test("empty states", async ({ page, request }) => {
    test.setTimeout(180_000);
    await loginAs(page, request, EMPTY_EMAIL);

    for (const route of EMPTY_STATE_ROUTES) {
      await visitAndCapture({
        page,
        surface: "app-states",
        route,
        viewport: DESKTOP,
        name: `empty-${route.replace(/^\//, "").replace(/\//g, "-")}`,
      });
    }
  });
});
