import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const MARKETING_URL = "https://gavelhouse.app/";
const FIRST_PARTY_HOSTS = new Set([
  "gavelhouse.app",
  "my.gavelhouse.app",
  "api.gavelhouse.app",
]);

function requireLiveEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for live production E2E runs.`);
  }
  return value;
}

const baseEmail = requireLiveEnv("LIVE_E2E_EMAIL");
const password = requireLiveEnv("LIVE_E2E_QA_PASSWORD");
const name = requireLiveEnv("LIVE_E2E_NAME");
const communityName = requireLiveEnv("LIVE_E2E_COMMUNITY");
const expectedCommunityNames = [communityName, `${name}'s Community`].filter(
  (value, index, values) => values.indexOf(value) === index,
);
const artifactDir =
  process.env["LIVE_E2E_ARTIFACT_DIR"] ??
  path.resolve(process.cwd(), "test-results", "live-e2e");

type CapturedConsoleError = {
  type: string;
  text: string;
  url?: string;
};

type CapturedNetworkIssue = {
  url: string;
  status?: number;
  failureText?: string;
};

function isFirstPartyUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false;
  }

  try {
    return FIRST_PARTY_HOSTS.has(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

function isIgnoredAnalyticsRequest(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return (
      url.pathname.startsWith("/cdn-cgi/rum") ||
      url.pathname === "/waitlist/pricing-click"
    );
  } catch {
    return false;
  }
}

function isIgnoredFailedRequest(
  rawUrl: string | undefined,
  failureText: string | undefined,
): boolean {
  if (failureText !== "net::ERR_ABORTED") {
    return false;
  }

  try {
    return new URL(rawUrl ?? "").pathname === "/api/auth/get-session";
  } catch {
    return false;
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^\w.-]+/g, "-");
}

function buildRunEmail(base: string): string {
  const at = base.lastIndexOf("@");
  if (at <= 0) {
    throw new Error("LIVE_E2E_EMAIL must be a valid email address.");
  }
  const local = base.slice(0, at).replace(/\+.*/, "");
  const domain = base.slice(at + 1);
  return `${local}+live-${Date.now()}@${domain}`;
}

test.describe("Live marketing to aha", () => {
  test("goes from pricing to a trialing dashboard", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);

    fs.mkdirSync(artifactDir, { recursive: true });

    const consoleErrors: CapturedConsoleError[] = [];
    const failedRequests: CapturedNetworkIssue[] = [];
    const failedResponses: CapturedNetworkIssue[] = [];
    const redirects: string[] = [];
    const email = buildRunEmail(baseEmail);

    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }

      const location = message.location();
      if (location.url && !isFirstPartyUrl(location.url)) {
        return;
      }

      consoleErrors.push({
        type: message.type(),
        text: message.text(),
        url: location.url || undefined,
      });
    });

    page.on("pageerror", (error) => {
      consoleErrors.push({
        type: "pageerror",
        text: error.message,
        url: page.url() || undefined,
      });
    });

    page.on("response", (response) => {
      if (
        isFirstPartyUrl(response.url()) &&
        response.status() >= 400 &&
        response.status() < 600
      ) {
        failedResponses.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });

    page.on("requestfailed", (request) => {
      const failureText = request.failure()?.errorText;
      if (
        !isFirstPartyUrl(request.url()) ||
        isIgnoredAnalyticsRequest(request.url()) ||
        isIgnoredFailedRequest(request.url(), failureText)
      ) {
        return;
      }

      failedRequests.push({
        url: request.url(),
        failureText,
      });
    });

    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) {
        return;
      }

      redirects.push(frame.url());
    });

    await page.goto(MARKETING_URL, { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText("Gavelhouse");
    const trialLink = page
      .getByRole("link", { name: /Start free trial/i })
      .first();
    await expect(trialLink).toBeVisible();
    await page.screenshot({
      path: path.join(artifactDir, "01-homepage.png"),
      fullPage: true,
    });

    await trialLink.click();
    await page.waitForURL(
      /(?:gavelhouse|my\.gavelhouse)\.app\/(?:pricing|signup)\/?/,
      {
        timeout: 15000,
      },
    );

    if (/gavelhouse\.app\/pricing\/?$/.test(page.url())) {
      await expect(page.locator("body")).toContainText("Starter");
      await expect(page.locator("body")).toContainText("Growth");
      await expect(page.locator("body")).toContainText("Scale");
      await expect(page.locator("body")).toContainText("Portfolio");
      await page.screenshot({
        path: path.join(artifactDir, "02-pricing.png"),
        fullPage: true,
      });

      // All tier CTAs link directly to /signup (plan deferred to billing)
      const signupLink = page
        .locator('a[href="https://my.gavelhouse.app/signup"]')
        .first();
      await signupLink.scrollIntoViewIfNeeded();
      await signupLink.click();

      await page.waitForURL(/my\.gavelhouse\.app\/signup/, {
        timeout: 15000,
      });
    } else {
      await page.screenshot({
        path: path.join(artifactDir, "02-signup-entry.png"),
        fullPage: true,
      });
    }

    expect(page.url()).toMatch(/my\.gavelhouse\.app\/signup/);

    // New single-step signup: name + email + password only
    const createButton = page.getByRole("button", {
      name: "Create account",
      exact: true,
    });

    await createButton.click();
    await expect(page.getByText("Your name is required.")).toBeVisible();
    await expect(page.getByText("Enter a valid email.")).toBeVisible();
    await expect(
      page.getByText("Password must be at least 8 characters."),
    ).toBeVisible();

    await page.getByLabel("Your name").fill(name);
    await page.getByLabel("Work email").fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.screenshot({
      path: path.join(artifactDir, "03-signup-form.png"),
      fullPage: true,
    });

    await createButton.click();
    await page.waitForURL(/\/(?:setup|dashboard)(?:\?|$)/, {
      timeout: 60000,
    });
    if (/\/setup(?:\?|$)/.test(page.url())) {
      await page.goto("https://my.gavelhouse.app/dashboard", {
        waitUntil: "networkidle",
      });
    }

    await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 60000 });
    await page.screenshot({
      path: path.join(artifactDir, "04-dashboard-entry.png"),
      fullPage: true,
    });

    await expect(
      page.getByRole("heading", { name: /Use Gavelhouse one step at a time/i }),
    ).toBeVisible();
    await expect(
      page.getByText("Activation checklist", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("0 of 4 completed");
    await expect(page.locator("body")).toContainText("Import homeowner roster");
    await expect(page.locator("body")).toContainText("Set up reserve fund");
    await expect(page.locator("body")).toContainText(
      "Review compliance status",
    );
    await expect(page.locator("body")).toContainText(
      "Configure dues collection",
    );
    await expect(page.locator("body")).toContainText("left in your trial");

    await expect.poll(() => page.title()).toContain("Dashboard");
    await expect
      .poll(async () => {
        const title = await page.title();
        return expectedCommunityNames.some((expectedName) =>
          title.includes(expectedName),
        );
      })
      .toBe(true);

    await page.screenshot({
      path: path.join(artifactDir, "05-dashboard-aha.png"),
      fullPage: true,
    });

    const report = {
      status: "passed",
      generatedAt: new Date().toISOString(),
      email,
      name,
      communityName,
      finalUrl: page.url(),
      finalTitle: await page.title(),
      redirects,
      consoleErrors,
      failedRequests,
      failedResponses,
      outputDir: testInfo.outputDir,
    };

    fs.writeFileSync(
      path.join(artifactDir, `${sanitizeFileName(testInfo.title)}.json`),
      JSON.stringify(report, null, 2),
      "utf8",
    );

    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(failedResponses).toEqual([]);
  });
});
