import { describe, it, expect } from "vitest";
import { buildOwnerPortalInviteEmail } from "../../../src/domain/governance/ownerPortalInvite.js";

const env = {
  COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA 94000",
};

const baseInput = {
  firstName: "Jane",
  email: "jane@example.com",
  communityName: "Oakwood HOA",
  portalUrl: "https://owners.oakwood.example/portal?token=abc",
  expiresAt: new Date("2026-06-18T12:00:00.000Z"),
};

describe("buildOwnerPortalInviteEmail", () => {
  it("includes homeowner first name in both text and html", async () => {
    const email = await buildOwnerPortalInviteEmail(baseInput, env);
    expect(email.text).toContain("Jane");
    expect(email.html).toContain("Hi Jane,");
  });

  it("includes community name in subject and body", async () => {
    const email = await buildOwnerPortalInviteEmail(baseInput, env);
    expect(email.subject).toContain("Oakwood HOA");
    expect(email.text).toContain("Oakwood HOA");
    expect(email.html).toContain("Oakwood HOA");
  });

  it("includes the portal URL and expiration date", async () => {
    const email = await buildOwnerPortalInviteEmail(baseInput, env);
    expect(email.text).toContain(baseInput.portalUrl);
    expect(email.html).toContain(
      'href="https://owners.oakwood.example/portal?token=abc"',
    );
    expect(email.text).toContain("2026-06-18");
    expect(email.html).toContain("2026-06-18");
  });

  it("composes a from address that names the community via Gavelhouse", async () => {
    const email = await buildOwnerPortalInviteEmail(baseInput, env);
    expect(email.from).toBe(
      "Oakwood HOA via Gavelhouse <angel.campa@gavelhouse.app>",
    );
  });

  it("strips angle brackets and quotes from the community name on the from line", async () => {
    const email = await buildOwnerPortalInviteEmail(
      { ...baseInput, communityName: 'Oak<script>"HOA' },
      env,
    );
    expect(email.from).toBe(
      "OakscriptHOA via Gavelhouse <angel.campa@gavelhouse.app>",
    );
  });

  it("includes the postal address in the rendered HTML footer", async () => {
    const email = await buildOwnerPortalInviteEmail(baseInput, env);
    expect(email.html).toContain(env.COMPANY_POSTAL_ADDRESS);
  });

  it("refuses to build when COMPANY_POSTAL_ADDRESS is empty", async () => {
    await expect(
      buildOwnerPortalInviteEmail(baseInput, { COMPANY_POSTAL_ADDRESS: "" }),
    ).rejects.toThrow(/COMPANY_POSTAL_ADDRESS not configured/);
  });

  it("refuses to build when COMPANY_POSTAL_ADDRESS is the production placeholder", async () => {
    await expect(
      buildOwnerPortalInviteEmail(baseInput, {
        COMPANY_POSTAL_ADDRESS:
          "Gavelhouse, [set COMPANY_POSTAL_ADDRESS in production]",
      }),
    ).rejects.toThrow(/COMPANY_POSTAL_ADDRESS not configured/);
  });
});
