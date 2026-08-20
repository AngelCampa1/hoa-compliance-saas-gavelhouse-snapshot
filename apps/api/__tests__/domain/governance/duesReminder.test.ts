import { describe, it, expect } from "vitest";
import { buildReminderEmail } from "../../../src/domain/governance/duesReminder.js";

const env = {
  COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA 94000",
};

const baseInput = {
  firstName: "Jane",
  email: "jane@example.com",
  amountCents: 25000,
  dueDate: "2026-05-01",
  communityName: "Oakwood HOA",
  portalUrl: "https://owners.oakwood.example/portal",
};

describe("buildReminderEmail", () => {
  it("includes homeowner first name in both text and html", async () => {
    const email = await buildReminderEmail(baseInput, env);
    expect(email.text).toContain("Jane");
    expect(email.html).toContain("Hi Jane,");
  });

  it("formats cents as dollars", async () => {
    const email = await buildReminderEmail(
      { ...baseInput, amountCents: 9900 },
      env,
    );
    expect(email.text).toContain("$99.00");
    expect(email.html).toContain("$99.00");
  });

  it("includes community name in subject", async () => {
    const email = await buildReminderEmail(
      { ...baseInput, communityName: "Sunridge HOA" },
      env,
    );
    expect(email.subject).toContain("Sunridge HOA");
  });

  it("includes due date in body", async () => {
    const email = await buildReminderEmail(baseInput, env);
    expect(email.text).toContain("2026-05-01");
    expect(email.html).toContain("2026-05-01");
  });

  it("sets to field from email param", async () => {
    const email = await buildReminderEmail(
      { ...baseInput, email: "test@test.com" },
      env,
    );
    expect(email.to).toBe("test@test.com");
  });

  it("composes a from address that names the community via Gavelhouse", async () => {
    const email = await buildReminderEmail(baseInput, env);
    expect(email.from).toBe(
      "Oakwood HOA via Gavelhouse <angel.campa@gavelhouse.app>",
    );
  });

  it("strips angle brackets and quotes from the community name on the from line", async () => {
    const email = await buildReminderEmail(
      { ...baseInput, communityName: 'Oak<script>"HOA' },
      env,
    );
    expect(email.from).toBe(
      "OakscriptHOA via Gavelhouse <angel.campa@gavelhouse.app>",
    );
  });

  it("includes the postal address in the rendered HTML footer", async () => {
    const email = await buildReminderEmail(baseInput, env);
    expect(email.html).toContain(env.COMPANY_POSTAL_ADDRESS);
  });

  it("renders the owner portal CTA link in the HTML", async () => {
    const email = await buildReminderEmail(baseInput, env);
    expect(email.html).toContain(
      'href="https://owners.oakwood.example/portal"',
    );
    expect(email.html).toContain("Pay your assessment");
    expect(email.text).toContain("https://owners.oakwood.example/portal");
  });

  it("uses a community-branded footer (no Gavelhouse marketing copy)", async () => {
    const email = await buildReminderEmail(baseInput, env);
    expect(email.html).toContain(
      "Sent on behalf of Oakwood HOA via Gavelhouse",
    );
    expect(email.html).not.toContain(
      "Compliance-first HOA and condo management for self-managed boards",
    );
  });

  it("refuses to build when COMPANY_POSTAL_ADDRESS is empty", async () => {
    await expect(
      buildReminderEmail(baseInput, { COMPANY_POSTAL_ADDRESS: "" }),
    ).rejects.toThrow(/COMPANY_POSTAL_ADDRESS not configured/);
  });

  it("refuses to build when COMPANY_POSTAL_ADDRESS is undefined", async () => {
    await expect(
      buildReminderEmail(baseInput, { COMPANY_POSTAL_ADDRESS: undefined }),
    ).rejects.toThrow(/COMPANY_POSTAL_ADDRESS not configured/);
  });

  it("refuses to build when COMPANY_POSTAL_ADDRESS is the production placeholder", async () => {
    await expect(
      buildReminderEmail(baseInput, {
        COMPANY_POSTAL_ADDRESS:
          "Gavelhouse, [set COMPANY_POSTAL_ADDRESS in production]",
      }),
    ).rejects.toThrow(/COMPANY_POSTAL_ADDRESS not configured/);
  });
});
