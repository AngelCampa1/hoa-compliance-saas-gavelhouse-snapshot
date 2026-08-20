import { test, expect } from "@playwright/test";

const BASE = process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3060";

// Browser E2E for the @ventora/ai-cs support widget on the authenticated app
// surface. Requires a live dev server (app :3060 + api :8060) with seeded data.
// Seeded user: treasurer@test.gavelhouse.app / Test1234!
//
// The AI-CS BFF (/api/ai-cs/v1/*) is stubbed via page.route so this browser
// test is deterministic and does not depend on the live AI-CS Worker, an LLM
// backend, or the worker's HMAC secrets — it verifies the widget ⇄ BFF wiring,
// the SSE rendering path, the escalation flow, and boardstack brand adaptation
// exactly as the user experiences them. Live worker verification is performed
// separately against production after deploy.

const AI_CS_BASE = "**/api/ai-cs/v1";

// Skipped since this repository was opened up — see the note in
// __tests__/integration/ai-cs-widget-flow.test.tsx. The widget rendered by
// packages/ai-cs-stub is inert, so there is no launcher to click.
test.describe.skip("AI-CS support widget — authenticated surface", () => {
  test.beforeEach(async ({ page }) => {
    // Deterministic BFF: 201 session, SSE chat reply, 202 escalation.
    await page.route(`${AI_CS_BASE}/sessions`, (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ sessionId: "cs_e2e_1" }),
      }),
    );
    await page.route(`${AI_CS_BASE}/chat`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          'event: message.delta\ndata: {"messageId":"m1","delta":"Hello "}\n\n' +
          'event: message.delta\ndata: {"messageId":"m1","delta":"there"}\n\n' +
          'event: message.done\ndata: {"messageId":"m1"}\n\n',
      }),
    );
    await page.route(`${AI_CS_BASE}/escalations`, (route) =>
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ escalationId: "esc_1", status: "queued" }),
      }),
    );

    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email").fill("treasurer@test.gavelhouse.app");
    await page.getByLabel("Password", { exact: true }).fill("Test1234!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/(dashboard|billing|setup)/);
  });

  test("opens, streams an assistant reply, and escalates to a human", async ({
    page,
  }) => {
    // Launcher mounts only for authenticated users.
    const launcher = page.locator("[data-aics-launcher]");
    await expect(launcher).toBeVisible();
    await launcher.click();

    await expect(page.locator("[data-aics-panel]")).toBeVisible();

    // boardstack brand adaptation: the root carries the boardstack accent.
    const accent = await page.evaluate(() =>
      document
        .querySelector<HTMLElement>("[data-aics-root]")
        ?.style.getPropertyValue("--aics-accent")
        .trim(),
    );
    expect(accent).toBe("#2563eb");

    // Compose a message that also trips the negative-sentiment gate so the
    // escalation affordance becomes available.
    const composer = page.locator("[data-aics-composer] textarea");
    await composer.fill("this is broken, I need a human");
    await page.locator("[data-aics-send]").click();

    // Streamed assistant reply renders from the SSE delta frames.
    await expect(
      page.locator('[data-aics-bubble][data-aics-role="assistant"]'),
    ).toContainText("Hello there");

    // Escalate → queued confirmation banner.
    const escalate = page.locator("[data-aics-escalate]");
    await expect(escalate).toBeVisible();
    await escalate.click();

    await expect(page.locator("[data-aics-banner]")).toContainText(/queued/i);
  });
});
