import { describe, expect, it } from "vitest";
import {
  resolvePublicApiUrl,
  resolvePublicAppUrl,
} from "./public-runtime-urls";
import { knowledgeBase } from "@boardstack/shared";

const productionApiUrl = `https://api.${knowledgeBase.marketing.product.domain}`;
const productionAppUrl = new URL(knowledgeBase.marketing.funnel.publicSignupUrl)
  .origin;

describe("public runtime URL resolution", () => {
  it("uses configured public URLs when they are present", () => {
    expect(resolvePublicApiUrl("https://api.example.com")).toBe(
      "https://api.example.com",
    );
    expect(resolvePublicAppUrl("https://app.example.com")).toBe(
      "https://app.example.com",
    );
  });

  it("does not emit localhost fallbacks from production builds", () => {
    expect(resolvePublicApiUrl(undefined, { dev: false })).toBe(
      productionApiUrl,
    );
    expect(resolvePublicApiUrl("http://localhost:8060", { dev: false })).toBe(
      productionApiUrl,
    );
    expect(resolvePublicAppUrl("", { dev: false })).toBe(productionAppUrl);
    expect(resolvePublicAppUrl("http://localhost:3060", { dev: false })).toBe(
      productionAppUrl,
    );
    expect(resolvePublicAppUrl("not-a-url", { dev: false })).toBe(
      productionAppUrl,
    );
    expect(resolvePublicApiUrl("api.gavelhouse.app", { dev: false })).toBe(
      productionApiUrl,
    );
    expect(
      resolvePublicAppUrl("http://staging.gavelhouse.app", { dev: false }),
    ).toBe(productionAppUrl);
  });

  it("keeps local fallbacks available for dev builds", () => {
    expect(resolvePublicApiUrl(undefined, { dev: true })).toBe(
      "http://localhost:8060",
    );
    expect(resolvePublicAppUrl("", { dev: true })).toBe(
      "http://localhost:3060",
    );
  });

  it("rejects URLs with non-http(s) protocols", () => {
    expect(resolvePublicApiUrl("ftp://api.example.com", { dev: false })).toBe(
      productionApiUrl,
    );
    expect(resolvePublicAppUrl("javascript:alert(1)", { dev: false })).toBe(
      productionAppUrl,
    );
  });

  it("rejects legacy Boardstack public hosts from production builds", () => {
    expect(
      resolvePublicApiUrl("https://api.boardstack.app", { dev: false }),
    ).toBe(productionApiUrl);
    expect(resolvePublicApiUrl("https://boardstack.app", { dev: false })).toBe(
      productionApiUrl,
    );
    expect(
      resolvePublicApiUrl("https://api.boardstack.app.", { dev: false }),
    ).toBe(productionApiUrl);
    expect(
      resolvePublicApiUrl("https://x.y.boardstack.app", { dev: false }),
    ).toBe(productionApiUrl);
    expect(
      resolvePublicAppUrl("https://my.boardstack.app", { dev: false }),
    ).toBe(productionAppUrl);
    expect(resolvePublicAppUrl("https://boardstack.app.", { dev: false })).toBe(
      productionAppUrl,
    );
  });

  it("falls back to import.meta.env.DEV when dev option omitted", () => {
    const api = resolvePublicApiUrl(undefined);
    expect(api === "http://localhost:8060" || api === productionApiUrl).toBe(
      true,
    );
    const app = resolvePublicAppUrl(undefined);
    expect(app === "http://localhost:3060" || app === productionAppUrl).toBe(
      true,
    );
  });
});
