import { test, expect } from "@playwright/test";

const BASE = process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3060";

// These tests require a live dev server with seeded data.
// Run with: PLAYWRIGHT_BASE_URL=http://localhost:3060 pnpm e2e
// Seeded user: treasurer@test.gavelhouse.app / password: Test1234!

test.describe("Phase 4 smoke — Scale tier reporting", () => {
  test.beforeEach(async ({ page }) => {
    // Sign in as seeded treasurer
    await page.goto(`${BASE}/login`);
    await page.fill('[data-testid="email"]', "treasurer@test.gavelhouse.app");
    await page.fill('[data-testid="password"]', "Test1234!");
    await page.click('[data-testid="sign-in-btn"]');
    await page.waitForURL(`${BASE}/app/dashboard`);
  });

  test("trial balance page renders rows", async ({ page }) => {
    await page.goto(`${BASE}/app/reports/trial-balance`);
    await page.waitForSelector("table");
    const rows = page.locator("table tbody tr");
    await expect(rows).not.toHaveCount(0);
  });

  test("audit pack download returns ZIP", async ({ page }) => {
    await page.goto(`${BASE}/app/reports/audit-pack`);
    const today = new Date().toISOString().slice(0, 10);
    const lastMonth = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    await page.getByLabel("Period Start").fill(lastMonth);
    await page.getByLabel("Period End").fill(today);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download Audit Pack" }).click(),
    ]);
    expect(download.suggestedFilename()).toContain(".zip");
  });

  test("month-end close workflow completes", async ({ page }) => {
    await page.goto(`${BASE}/app/close`);
    await page.getByRole("button", { name: "Start New Close" }).click();

    const checkboxes = page.getByRole("checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }

    await page.getByRole("button", { name: /^Complete Close$/ }).click();
    await page.getByRole("button", { name: /^Complete close$/ }).click();
    await page.getByRole("link", { name: "Download audit pack" }).waitFor();
  });

  test("portfolio rollup shows linked communities", async ({ page }) => {
    await page.goto(`${BASE}/app/portfolio`);
    // Create a portfolio
    await page.fill('input[placeholder="Portfolio name"]', "Test Portfolio");
    await page.click('button:has-text("Create Portfolio")');
    // Assert rollup table appears (even if empty initially)
    await page.waitForSelector(
      '[data-testid="rollup-table"], text=No communities',
    );
  });

  test("cancel subscription flow completes", async ({ page }) => {
    await page.goto(`${BASE}/app/billing`);
    await page.getByRole("button", { name: "Cancel subscription" }).click();
    await expect(
      page.getByRole("dialog", { name: "Cancel Subscription" }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Reason" }).click();
    await page.getByRole("option", { name: "Missing features I need" }).click();
    await page.getByRole("button", { name: /^Cancel Subscription$/ }).click();
    await expect(
      page.getByText(
        "Your subscription has been cancelled and will not renew.",
      ),
    ).toBeVisible();
  });
});
