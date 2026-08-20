import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTRIBUTION_STORAGE_KEY,
  extractSignupAttribution,
  persistSignupAttribution,
  readStoredSignupAttribution,
  resolveSignupAttribution,
} from "./signup-attribution";

describe("signup-attribution", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("extracts supported attribution fields from a search string", () => {
    expect(
      extractSignupAttribution(
        "?utm_source=google&utm_medium=cpc&utm_campaign=spring&ref=partner",
      ),
    ).toEqual({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "spring",
      referredBy: "partner",
    });
  });

  it("persists new attribution params into session storage", () => {
    const result = persistSignupAttribution(
      "?utm_source=linkedin&utm_campaign=demo&ref=ally",
    );

    expect(result).toEqual({
      utmSource: "linkedin",
      utmCampaign: "demo",
      referredBy: "ally",
    });
    expect(readStoredSignupAttribution()).toEqual(result);
    expect(sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toBeNull();
  });

  it("keeps stored attribution when the current page has no query params", () => {
    sessionStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "spring",
        referredBy: "partner",
      }),
    );

    expect(resolveSignupAttribution("")).toEqual({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "spring",
      referredBy: "partner",
    });
  });

  it("merges current params over stored attribution and re-persists the result", () => {
    sessionStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "spring",
        referredBy: "partner",
      }),
    );

    const result = resolveSignupAttribution("?utm_medium=paid-social");

    expect(result).toEqual({
      utmSource: "google",
      utmMedium: "paid-social",
      utmCampaign: "spring",
      referredBy: "partner",
    });
    expect(readStoredSignupAttribution()).toEqual(result);
  });

  it("returns an empty object when stored attribution is invalid JSON", () => {
    sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, "{bad json");

    expect(readStoredSignupAttribution()).toEqual({});
  });

  it("fails safely when sessionStorage access throws", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });

    expect(readStoredSignupAttribution()).toEqual({});
    expect(resolveSignupAttribution("?utm_source=google")).toEqual({
      utmSource: "google",
    });
    expect(persistSignupAttribution("?utm_source=google")).toEqual({
      utmSource: "google",
    });

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});
