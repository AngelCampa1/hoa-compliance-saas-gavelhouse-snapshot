import { describe, expect, it } from "vitest";
import {
  buildTrialEndingReminderEmail,
  buildTrialStartedEmail,
} from "../../../src/domain/billing/trialEmails.js";

describe("trialEmails", () => {
  const input = {
    email: "owner@example.com",
    recipientName: "Jane Owner",
    communityName: "Sunset HOA",
    planName: "Starter",
    amountLabel: "$20.00/month",
    trialStartedAt: new Date("2026-04-01T00:00:00Z"),
    trialEndsAt: new Date("2026-05-01T00:00:00Z"),
    billingConfigured: true,
  };
  const env = {
    APP_URL: "https://my.gavelhouse.app",
    COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA 94000",
  };

  it("builds the trial started email with auto-charge copy and a billing CTA", async () => {
    const email = await buildTrialStartedEmail(input, env);

    expect(email.to).toBe("owner@example.com");
    expect(email.subject).toContain("trial is live");
    expect(email.text).toContain("free trial");
    expect(email.text).toContain("started on April 1, 2026");
    expect(email.text).toContain("automatically charge $20.00/month");
    expect(email.text).toContain("https://my.gavelhouse.app/settings/billing");
    expect(email.html).toContain("Your Gavelhouse trial is live");
    expect(email.html).toContain(
      'href="https://my.gavelhouse.app/settings/billing"',
    );
    expect(email.html).toContain("Manage billing");
    expect(email.html).toContain(
      "Gavelhouse, 123 Test St, Testville, CA 94000",
    );
  });

  it("builds the trial ending reminder email with the charge date", async () => {
    const email = await buildTrialEndingReminderEmail(input, env);

    expect(email.subject).toContain("May 1, 2026");
    expect(email.text).toContain("free trial");
    expect(email.text).toContain("ends on May 1, 2026");
    expect(email.text).toContain("automatically charge $20.00/month");
    expect(email.html).toContain("Your trial ends May 1, 2026");
    expect(email.html).toContain("Manage billing");
  });

  it("falls back to a generic greeting when no recipient name is provided", async () => {
    const email = await buildTrialStartedEmail(
      { ...input, recipientName: "" },
      env,
    );

    expect(email.text.startsWith("Hi,")).toBe(true);
    expect(email.html).toContain("Hi,");
  });

  it("builds no-card trial copy when billing is not configured", async () => {
    const email = await buildTrialEndingReminderEmail(
      { ...input, billingConfigured: false },
      env,
    );

    expect(email.text).toContain(
      "lock access until you start a paid subscription",
    );
    expect(email.text).not.toContain("automatically charge");
    expect(email.html).toContain("Add payment method");
  });

  it("refuses to build when COMPANY_POSTAL_ADDRESS is empty", async () => {
    await expect(
      buildTrialStartedEmail(input, {
        APP_URL: env.APP_URL,
        COMPANY_POSTAL_ADDRESS: "",
      }),
    ).rejects.toThrow(/COMPANY_POSTAL_ADDRESS not configured/);
  });

  it("refuses to build when COMPANY_POSTAL_ADDRESS is undefined", async () => {
    await expect(
      buildTrialStartedEmail(input, {
        APP_URL: env.APP_URL,
        COMPANY_POSTAL_ADDRESS: undefined,
      }),
    ).rejects.toThrow(/COMPANY_POSTAL_ADDRESS not configured/);
  });

  it("refuses to build when COMPANY_POSTAL_ADDRESS is the placeholder", async () => {
    await expect(
      buildTrialStartedEmail(input, {
        APP_URL: env.APP_URL,
        COMPANY_POSTAL_ADDRESS:
          "Gavelhouse, [set COMPANY_POSTAL_ADDRESS in production]",
      }),
    ).rejects.toThrow(/COMPANY_POSTAL_ADDRESS not configured/);
  });

  it("falls back to the production app URL when APP_URL is empty", async () => {
    const email = await buildTrialStartedEmail(input, {
      APP_URL: "",
      COMPANY_POSTAL_ADDRESS: env.COMPANY_POSTAL_ADDRESS,
    });
    expect(email.text).toContain("https://my.gavelhouse.app/settings/billing");
    expect(email.html).toContain(
      'href="https://my.gavelhouse.app/settings/billing"',
    );
  });

  it("falls back to the production app URL when APP_URL is undefined", async () => {
    const email = await buildTrialStartedEmail(input, {
      APP_URL: undefined as unknown as string,
      COMPANY_POSTAL_ADDRESS: env.COMPANY_POSTAL_ADDRESS,
    });
    expect(email.text).toContain("https://my.gavelhouse.app/settings/billing");
  });
});
