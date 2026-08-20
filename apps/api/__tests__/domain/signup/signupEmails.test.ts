import { describe, expect, it } from "vitest";
import { buildSignupConfirmationEmail } from "../../../src/domain/signup/signupEmails.js";

const env = {
  COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA 94000",
};

describe("signupEmails", () => {
  it("builds the transactional confirmation email with a verification CTA", async () => {
    const email = await buildSignupConfirmationEmail(
      {
        email: "jane@example.com",
        recipientName: "Jane Owner",
        verificationUrl: "https://api.gavelhouse.app/api/auth/verify?token=tok",
      },
      env,
    );

    expect(email.to).toBe("jane@example.com");
    expect(email.subject).toContain("Confirm your Gavelhouse email");
    expect(email.text).toContain("Hi Jane Owner,");
    expect(email.text).toContain(
      "https://api.gavelhouse.app/api/auth/verify?token=tok",
    );
    expect(email.html).toContain("Confirm your email");
    expect(email.html).toContain(
      'href="https://api.gavelhouse.app/api/auth/verify?token=tok"',
    );
    expect(email.html).toContain(
      "Gavelhouse, 123 Test St, Testville, CA 94000",
    );
    expect(email.html).not.toContain("Unsubscribe from these emails");
  });

  it("uses a generic greeting in confirmation email when name is blank", async () => {
    const email = await buildSignupConfirmationEmail(
      {
        email: "jane@example.com",
        recipientName: "",
        verificationUrl: "https://api.gavelhouse.app/api/auth/verify?token=tok",
      },
      env,
    );

    expect(email.text.startsWith("Hi,")).toBe(true);
    expect(email.html).toContain("Hi,");
  });

  it("refuses to build without a real company postal address", async () => {
    await expect(
      buildSignupConfirmationEmail(
        {
          email: "jane@example.com",
          recipientName: "Jane",
          verificationUrl: "https://example.com/verify",
        },
        { ...env, COMPANY_POSTAL_ADDRESS: "" },
      ),
    ).rejects.toThrow(/COMPANY_POSTAL_ADDRESS not configured/);
  });
});
