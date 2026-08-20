import { describe, expect, it } from "vitest";

import {
  buildCtaAnalyticsAttributes,
  buildCtaClickEventProperties,
  sanitizeCtaTarget,
} from "./cta-analytics";

describe("buildCtaAnalyticsAttributes", () => {
  it("maps shared CTA analytics context into data attributes", () => {
    expect(
      buildCtaAnalyticsAttributes({
        pageFamily: "comparison",
        buyerStage: "mofu",
        placement: "mid-article-routing",
        intent: "evaluate",
        target: "/compare/vendors",
      }),
    ).toEqual({
      "data-cta-button": "",
      "data-cta-page-family": "comparison",
      "data-cta-buyer-stage": "mofu",
      "data-cta-placement": "mid-article-routing",
      "data-cta-intent": "evaluate",
      "data-cta-target": "/compare/vendors",
    });
  });

  it("sanitizes CTA target before writing it into DOM attributes", () => {
    expect(
      buildCtaAnalyticsAttributes({
        target: "/book-demo?email=owner@example.com#calendar",
      }),
    ).toEqual({
      "data-cta-button": "",
      "data-cta-target": "/book-demo",
    });
  });

  it("omits undefined analytics fields while keeping CTA tracking enabled", () => {
    expect(buildCtaAnalyticsAttributes()).toEqual({
      "data-cta-button": "",
    });
  });
});

describe("buildCtaClickEventProperties", () => {
  it("merges CTA analytics context from the clicked element", () => {
    document.body.innerHTML = `
      <a
        href="/book-demo"
        data-cta-button
        data-cta-page-family="pricing"
        data-cta-buyer-stage="bofu"
        data-cta-placement="inline-routing"
        data-cta-intent="convert"
        data-cta-target="/book-demo"
      >
        Book a demo
      </a>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Book a demo",
        href: "/book-demo",
        section: "decision-cta-card",
        pagePath: "/pricing",
      }),
    ).toEqual({
      button_text: "Book a demo",
      href: "/book-demo",
      section: "decision-cta-card",
      page_path: "/pricing",
      page_family: "pricing",
      buyer_stage: "bofu",
      placement: "inline-routing",
      intent: "convert",
      target: "/book-demo",
    });
  });

  it("falls back to the closest ancestor for shared analytics attributes", () => {
    document.body.innerHTML = `
      <section
        data-cta-page-family="guide"
        data-cta-buyer-stage="tofu"
        data-cta-placement="sidebar"
      >
        <a href="/guides" data-cta-button>Explore guides</a>
      </section>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Explore guides",
        href: "/guides",
        section: "sidebar-cta",
        pagePath: "/resources",
      }),
    ).toEqual({
      button_text: "Explore guides",
      href: "/guides",
      section: "sidebar-cta",
      page_path: "/resources",
      page_family: "guide",
      buyer_stage: "tofu",
      placement: "sidebar",
    });
  });

  it("strips sensitive details from href and target properties", () => {
    document.body.innerHTML = `
      <a
        href="/book-demo?email=owner@example.com#calendar"
        data-cta-button
        data-cta-target="/book-demo?token=secret#calendar"
      >
        Book a demo
      </a>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Book a demo",
        href: "/book-demo?email=owner@example.com#calendar",
        section: "decision-cta-card",
        pagePath: "/pricing",
      }),
    ).toMatchObject({
      href: "/book-demo",
      target: "/book-demo",
    });
  });

  it("drops mailto targets instead of capturing email addresses", () => {
    document.body.innerHTML = `
      <a href="mailto:owner@example.com" data-cta-button data-cta-target="mailto:owner@example.com">
        Email us
      </a>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Email us",
        href: "mailto:owner@example.com",
        section: "footer",
        pagePath: "/contact",
      }),
    ).toMatchObject({
      href: "",
      target: "",
    });
  });

  it("keeps absolute http targets without query strings or hashes", () => {
    expect(
      sanitizeCtaTarget(
        "https://partner.example.com/demo?email=owner@example.com#calendar",
      ),
    ).toBe("https://partner.example.com/demo");
  });

  it("keeps cross-origin relative targets without query strings or hashes", () => {
    expect(
      sanitizeCtaTarget("//partners.gavelhouse.app/demo?token=secret#top"),
    ).toBe("http://partners.gavelhouse.app/demo");
  });

  it("falls back to splitting invalid URL targets", () => {
    expect(sanitizeCtaTarget("http://[::1?token=secret#top")).toBe(
      "http://[::1",
    );
  });

  it("drops non-http targets when rendering without window", () => {
    const originalWindow = globalThis.window;

    try {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: undefined,
      });

      expect(sanitizeCtaTarget("mailto:owner@example.com")).toBe("");
      expect(
        buildCtaAnalyticsAttributes({
          target: "javascript:alert(1)",
        }),
      ).toEqual({
        "data-cta-button": "",
        "data-cta-target": "",
      });
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it("keeps simple hash anchors and drops sensitive hash fragments", () => {
    document.body.innerHTML = `
      <a href="#pricing" data-cta-button data-cta-target="#email=owner@example.com">
        Pricing
      </a>
    `;

    const ctaElement = document.querySelector("a");
    if (!(ctaElement instanceof HTMLElement)) {
      throw new Error("Expected CTA element to be present");
    }

    expect(
      buildCtaClickEventProperties(ctaElement, {
        buttonText: "Pricing",
        href: "#pricing",
        section: "hero",
        pagePath: "/",
      }),
    ).toMatchObject({
      href: "#pricing",
      target: "",
    });
  });
});
