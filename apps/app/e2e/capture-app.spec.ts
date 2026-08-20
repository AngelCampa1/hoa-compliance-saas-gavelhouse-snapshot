import { test } from "@playwright/test";
import {
  APP_VIEWPORTS,
  PORTFOLIO_EMAIL,
  TREASURER_EMAIL,
  loginAs,
  visitAndCapture,
} from "./support/capture.js";

/**
 * Screenshot archive: authenticated dashboard routes.
 *
 * Not a test — see support/capture.ts. Requires a locally seeded stack:
 *   pnpm run dev:bootstrap && pnpm dev && pnpm --filter @boardstack/api run seed:demo
 * Then: pnpm --filter @boardstack/app exec playwright test capture-app
 */

/** Routes the treasurer account can reach, with data from seed:demo. */
const TREASURER_ROUTES = [
  "/dashboard",
  "/finance/accounts",
  "/finance/journal",
  "/finance/reserves",
  "/finance/dues",
  "/bank/statements",
  "/bank/reconcile",
  "/governance/homeowners",
  "/governance/meetings",
  "/governance/violations",
  "/governance/arch-requests",
  "/governance/transitions",
  "/reports",
  "/reports/trial-balance",
  "/reports/balance-sheet",
  "/reports/income-statement",
  "/reports/general-ledger",
  "/reports/audit-pack",
  "/close",
  "/settings",
  "/billing",
  "/help",
];

/** Portfolio rollup requires the portfolio-tier account. */
const PORTFOLIO_ROUTES = ["/portfolio"];

test.describe("screenshot archive — dashboard", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of APP_VIEWPORTS) {
    test(`treasurer routes at ${viewport.name}`, async ({ page, request }) => {
      test.setTimeout(420_000);
      await loginAs(page, request, TREASURER_EMAIL);

      for (const route of TREASURER_ROUTES) {
        await visitAndCapture({
          page,
          surface: `app/${viewport.name}`,
          route,
          viewport,
        });
      }
    });

    test(`portfolio routes at ${viewport.name}`, async ({ page, request }) => {
      await loginAs(page, request, PORTFOLIO_EMAIL);

      for (const route of PORTFOLIO_ROUTES) {
        await visitAndCapture({
          page,
          surface: `app/${viewport.name}`,
          route,
          viewport,
        });
      }
    });
  }
});
