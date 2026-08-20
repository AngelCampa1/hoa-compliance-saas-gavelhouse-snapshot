import { test } from "@playwright/test";
import {
  DESKTOP,
  MOBILE,
  TREASURER_EMAIL,
  capture,
  loginAs,
  settle,
} from "./support/capture.js";

/**
 * Screenshot archive: interaction states.
 *
 * Dialogs and drawers are opened by clicking a control matched on its
 * accessible name rather than a CSS selector, so this survives markup changes.
 * A step whose control is absent is skipped with a console note instead of
 * failing the run — this is archive tooling, not a regression test, and a
 * missing dialog should not cost us the other forty screenshots.
 */

interface StateCapture {
  readonly route: string;
  /** Accessible name of the control that opens the state. */
  readonly trigger: RegExp;
  readonly name: string;
}

const STATES: readonly StateCapture[] = [
  {
    route: "/governance/homeowners",
    trigger: /add homeowner/i,
    name: "dialog-add-homeowner",
  },
  {
    route: "/governance/homeowners",
    trigger: /import/i,
    name: "dialog-import-homeowners",
  },
  {
    route: "/governance/violations",
    trigger: /^log violation$/i,
    name: "dialog-log-violation",
  },
  {
    route: "/governance/arch-requests",
    trigger: /(new|add) request/i,
    name: "dialog-new-arch-request",
  },
  {
    route: "/governance/meetings",
    trigger: /(new|schedule|add) meeting/i,
    name: "dialog-new-meeting",
  },
  {
    route: "/finance/accounts",
    trigger: /^edit operating checking$/i,
    name: "dialog-edit-account",
  },
  {
    route: "/bank/statements",
    trigger: /(import|upload|new) statement/i,
    name: "dialog-import-statement",
  },
];

test.describe("screenshot archive — interaction states", () => {
  test.describe.configure({ mode: "serial" });

  test("dialogs and forms", async ({ page, request }) => {
    test.setTimeout(300_000);
    await loginAs(page, request, TREASURER_EMAIL);

    for (const state of STATES) {
      await page.goto(state.route);
      await settle(page);

      const trigger = page.getByRole("button", { name: state.trigger }).first();
      if ((await trigger.count()) === 0) {
        console.log(`skip ${state.name}: no control on ${state.route}`);
        continue;
      }

      await trigger.click();
      // Wait for the dialog rather than a fixed delay, but do not fail the run
      // if this control opened something that is not a dialog.
      await page
        .getByRole("dialog")
        .first()
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => undefined);
      await page.waitForTimeout(300);

      await capture({
        page,
        surface: "app-states",
        route: state.route,
        viewport: DESKTOP,
        name: state.name,
      });
    }
  });

  test("journal entry form guard", async ({ page, request }) => {
    test.setTimeout(120_000);
    await loginAs(page, request, TREASURER_EMAIL);
    await page.goto("/finance/journal");
    await settle(page);

    // There is no validation-error state to capture here: the journal entry
    // form is inline rather than in a dialog, and Post Entry stays disabled
    // with an explanatory hint until the entry balances. Capturing the guarded
    // state is the more accurate record of how the ledger protects itself.
    const submit = page.getByRole("button", { name: /^post entry$/i }).first();
    if ((await submit.count()) === 0) {
      console.log("skip form guard capture: no Post Entry control");
      return;
    }
    await submit.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await capture({
      page,
      surface: "app-states",
      route: "/finance/journal",
      viewport: DESKTOP,
      name: "journal-entry-form-guard",
    });
  });

  test("active bank reconciliation", async ({ page, request }) => {
    test.setTimeout(120_000);
    await loginAs(page, request, TREASURER_EMAIL);

    // /bank/reconcile renders an empty prompt until a statement is chosen via
    // the `statement` search param. Reaching it through the statements list
    // avoids hardcoding a seeded reconciliation id.
    await page.goto("/bank/statements");
    await settle(page);

    // Match on the href, not the accessible name: the sidebar also has a
    // "Reconcile" link, and it is the one that comes first in the DOM.
    const reconcile = page
      .locator('a[href*="/bank/reconcile?statement="]')
      .first();
    if ((await reconcile.count()) === 0) {
      console.log("skip active reconciliation: no statement to reconcile");
      return;
    }
    await reconcile.click();
    await settle(page);

    await capture({
      page,
      surface: "app-states",
      route: "/bank/reconcile?statement=…",
      viewport: DESKTOP,
      name: "bank-reconcile-active",
    });
  });

  test("mobile navigation drawer", async ({ page, request }) => {
    await loginAs(page, request, TREASURER_EMAIL);
    await page.setViewportSize({ width: MOBILE.width, height: MOBILE.height });
    await page.goto("/dashboard");
    await settle(page);

    const menu = page
      .getByRole("button", { name: /(menu|navigation|open menu)/i })
      .first();
    if ((await menu.count()) === 0) {
      console.log("skip mobile nav: no menu control");
      return;
    }
    await menu.click();
    await page.waitForTimeout(400);

    await capture({
      page,
      surface: "app-states",
      route: "/dashboard",
      viewport: MOBILE,
      name: "mobile-nav-drawer",
    });
  });
});
