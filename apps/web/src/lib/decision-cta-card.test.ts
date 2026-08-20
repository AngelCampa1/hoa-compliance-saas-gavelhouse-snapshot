import { describe, expect, it } from "vitest";

import { buildDecisionCtaCardModel } from "./decision-cta-card";

describe("buildDecisionCtaCardModel", () => {
  it("builds tracked link attributes for both CTA targets", () => {
    const model = buildDecisionCtaCardModel({
      heading: "Choose the next step",
      subtext: "Route readers to the right comparison or conversion page.",
      bullets: ["Compare options", "Talk to sales"],
      primaryCta: {
        text: "Compare vendors",
        target:"/compare/vendors",
      },
      secondaryCta: {
        text: "Book a walkthrough",
        target:"/book-demo",
      },
      analytics: {
        pageFamily: "comparison",
        buyerStage: "mofu",
        placement: "mid-article-routing",
        intent: "evaluate",
      },
    });

    expect(model.primaryCta.analyticsAttributes).toEqual({
      "data-cta-button": "",
      "data-cta-page-family": "comparison",
      "data-cta-buyer-stage": "mofu",
      "data-cta-placement": "mid-article-routing",
      "data-cta-intent": "evaluate",
      "data-cta-target":"/compare/vendors",
    });
    expect(model.secondaryCta?.analyticsAttributes).toEqual({
      "data-cta-button": "",
      "data-cta-page-family": "comparison",
      "data-cta-buyer-stage": "mofu",
      "data-cta-placement": "mid-article-routing",
      "data-cta-intent": "evaluate",
      "data-cta-target":"/book-demo",
    });
  });

  it("normalizes missing optional props for a single-link card", () => {
    const model = buildDecisionCtaCardModel({
      heading: "Keep moving",
      subtext: "Send readers to one next step without rendering extras.",
      primaryCta: {
        text: "See pricing",
        target:"/pricing",
      },
    });

    expect(model.bullets).toEqual([]);
    expect(model.secondaryCta).toBeUndefined();
    expect(model.primaryCta.analyticsAttributes).toEqual({
      "data-cta-button": "",
      "data-cta-target":"/pricing",
    });
  });
});
