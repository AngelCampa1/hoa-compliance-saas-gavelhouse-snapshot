import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { knowledgeBase } from "@boardstack/shared";
import { sendLeadMagnetEmail } from "../../src/lib/leadMagnetMailer.js";
import type { Env } from "../../src/types/env.js";

describe("sendLeadMagnetEmail", () => {
  const element = React.createElement("div", null, "hello body");

  it("refuses to send and throws when COMPANY_POSTAL_ADDRESS is unset", async () => {
    const envWithoutAddress = {
      RESEND_API_KEY: "test-resend-key",
    } as unknown as Env;
    await expect(
      sendLeadMagnetEmail({
        to: "a@b.com",
        subject: "s",
        react: element,
        magnetSlug: "hoa-budget-template",
        step: 0,
        enrollmentId: "enr-3",
        env: envWithoutAddress,
      }),
    ).rejects.toThrow(/COMPANY_POSTAL_ADDRESS/);
    // Must short-circuit before making the fetch call.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("refuses to send when COMPANY_POSTAL_ADDRESS is still the placeholder", async () => {
    const envWithPlaceholder = {
      RESEND_API_KEY: "test-resend-key",
      COMPANY_POSTAL_ADDRESS:
        "Gavelhouse, [set COMPANY_POSTAL_ADDRESS in production]",
    } as unknown as Env;

    await expect(
      sendLeadMagnetEmail({
        to: "a@b.com",
        subject: "s",
        react: element,
        magnetSlug: "hoa-budget-template",
        step: 0,
        enrollmentId: "enr-3",
        env: envWithPlaceholder,
      }),
    ).rejects.toThrow(/real address/);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("omits List-Unsubscribe headers for resource delivery emails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendLeadMagnetEmail({
      to: "a@b.com",
      subject: "s",
      react: element,
      magnetSlug: "hoa-budget-template",
      step: 0,
      enrollmentId: "enr-3",
      env: {
        RESEND_API_KEY: "test-resend-key",
        COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA",
      } as unknown as Env,
    });

    const body = JSON.parse(
      fetchMock.mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;
    expect(body.from).toBe(
      `Angel Campa <${knowledgeBase.marketing.founderContact.email}>`,
    );
    expect(body).not.toHaveProperty("headers");
  });

  it("omits List-Unsubscribe headers for resource delivery even if a URL is passed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendLeadMagnetEmail({
      to: "a@b.com",
      subject: "s",
      react: element,
      magnetSlug: "hoa-budget-template",
      step: 0,
      enrollmentId: "enr-3",
      unsubscribeUrl: "https://api.gavelhouse.app/unsubscribe?token=tok-3",
      env: {
        RESEND_API_KEY: "test-resend-key",
        COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA",
      } as unknown as Env,
    });

    const body = JSON.parse(
      fetchMock.mock.calls[0][1]?.body as string,
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("headers");
  });

  it("adds List-Unsubscribe headers for follow-up emails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const unsubscribeUrl = "https://api.gavelhouse.app/unsubscribe?token=tok-3";

    await sendLeadMagnetEmail({
      to: "a@b.com",
      subject: "s",
      react: element,
      magnetSlug: "hoa-budget-template",
      step: 1,
      enrollmentId: "enr-3",
      unsubscribeUrl,
      env: {
        RESEND_API_KEY: "test-resend-key",
        COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA",
      } as unknown as Env,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      headers?: Record<string, string>;
    };
    expect(body.headers).toEqual({
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("refuses to send follow-up emails without an unsubscribe URL", async () => {
    const env = {
      RESEND_API_KEY: "test-resend-key",
      COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA",
    } as unknown as Env;

    await expect(
      sendLeadMagnetEmail({
        to: "a@b.com",
        subject: "s",
        react: element,
        magnetSlug: "hoa-budget-template",
        step: 1,
        enrollmentId: "enr-3",
        env,
      }),
    ).rejects.toThrow(/unsubscribeUrl is required/);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
