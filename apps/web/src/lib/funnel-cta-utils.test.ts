import { describe, it, expect } from "vitest";
import { resolveFunnelConfig } from "./funnel-cta-utils";
import type { BuyerStage, FunnelStage } from "./types";

const funnel: Record<BuyerStage, FunnelStage> = {
  tofu: { ctaMode: "educate", ctaText: "Learn More", ctaTarget: "/guides" },
  mofu: {
    ctaMode: "evaluate",
    ctaText: "Compare Plans",
    ctaTarget: "/pricing",
  },
  bofu: {
    ctaMode: "convert",
    ctaText: "Start trial",
    ctaTarget: "/signup",
  },
};

describe("resolveFunnelConfig", () => {
  it("returns the correct config for tofu stage", () => {
    expect(resolveFunnelConfig(funnel, "tofu")).toEqual(funnel.tofu);
  });

  it("returns the correct config for mofu stage", () => {
    expect(resolveFunnelConfig(funnel, "mofu")).toEqual(funnel.mofu);
  });

  it("returns the correct config for bofu stage", () => {
    expect(resolveFunnelConfig(funnel, "bofu")).toEqual({
      ...funnel.bofu,
      ctaText: "Start trial",
    });
  });

  it("returns null when stage is not a valid key", () => {
    expect(resolveFunnelConfig(funnel, "invalid" as BuyerStage)).toBeNull();
  });

  it("returns null when funnel is undefined", () => {
    expect(resolveFunnelConfig(undefined, "tofu")).toBeNull();
  });

  it("returns null when funnel is null", () => {
    expect(resolveFunnelConfig(null, "tofu")).toBeNull();
  });

  it("normalizes waitlist CTA copy before rendering", () => {
    expect(
      resolveFunnelConfig(
        {
          ...funnel,
          bofu: {
            ctaMode: "convert",
            ctaText: "Join the waitlist",
            ctaTarget: "/#pricing",
          },
        },
        "bofu",
      ),
    ).toEqual({
      ctaMode: "convert",
      ctaText: "Start trial",
      ctaTarget: "/#pricing",
    });
  });
});
