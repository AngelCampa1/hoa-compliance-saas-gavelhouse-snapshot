import { test, expect } from "@playwright/test";

const BASE = process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3060";

// Requires a live dev server with seeded data AND the CRM widget key set for
// the app build/dev run, e.g.:
//   VITE_CRM_WIDGET_KEY=wk_LOCALTESTPLACEHOLDER00000000000000 \
//   PLAYWRIGHT_BASE_URL=http://localhost:3060 pnpm e2e
//
// Seeded user: treasurer@test.gavelhouse.app / password: Test1234!
//
// NOTE: We assert only that the loader script MOUNTS. The CRM enforces an
// authenticated-origin allowlist server-side, so on a localhost origin the
// widget's data fetch / ingest POST correctly no-ops (the real product origin
// is https://my.gavelhouse.app). Asserting the embed mounts is the correct
// local verification bar — do NOT assert a successful ingest here.

test.describe("CRM feedback widget — authenticated surface", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email").fill("treasurer@test.gavelhouse.app");
    await page.getByLabel("Password", { exact: true }).fill("Test1234!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    // Land anywhere on the authenticated surface (the _app layout mounts the
    // CRM widget); the post-login route may be /dashboard or a billing gate.
    await page.waitForURL(/\/(dashboard|billing|setup)/);
  });

  test("injects the CRM feedback-button loader script", async ({ page }) => {
    const loader = page.locator('script[data-widget="feedback-button"]');
    await expect(loader).toHaveCount(1);
    await expect(loader).toHaveAttribute("data-product", /.+/);
  });
});
