import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3060",
    trace: "on-first-retry",
    // Pinned so a run does not depend on the language and timezone of whoever's
    // machine it is on. `locale` alone is not enough: Chromium renders the
    // placeholder inside native <input type="date"> and type="month" controls in
    // the *browser process* language, so on a Spanish-locale machine the dues
    // form reads "---------- de ----" no matter what the context locale says.
    // --lang is what actually moves it. The app ships English-only.
    locale: "en-US",
    timezoneId: "America/Chicago",
    colorScheme: "light",
    launchOptions: { args: ["--lang=en-US"] },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
