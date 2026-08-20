import { describe, expect, it } from "vitest";
import { knowledgeBase } from "../src/knowledge/index.js";
import {
  PRODUCT_CONTEXTUAL_HELP,
  PRODUCT_FIELD_HELP,
  PRODUCT_GLOSSARY,
  PRODUCT_HELP_TOPICS,
  PRODUCT_HELP_VERSION,
  PRODUCT_ONBOARDING_STEPS,
  PRODUCT_PAGE_HELP,
  PRODUCT_ROLE_PATHS,
  getFieldHelp,
  getPageHelpForRoute,
  getProductHelpRolePath,
  getProductHelpTopic,
  getProductHelpTopicsForRoute,
  searchProductHelpTopics,
} from "../src/product-help.js";

describe("product help content", () => {
  it("keeps legacy help exports derived from the app help KB", () => {
    expect(PRODUCT_HELP_TOPICS).toEqual(
      knowledgeBase.app.help.topics.map((topic) => ({
        slug: topic.id,
        title: topic.title,
        summary: topic.summary,
        category: topic.category,
        audience: topic.audience,
        timeEstimate: topic.timeEstimate,
        relatedRoutes: [...topic.relatedRoutes],
        sections: topic.sections.map((section) => ({
          heading: section.heading,
          body: section.body,
          steps: section.steps ? [...section.steps] : undefined,
        })),
        glossaryTerms: [...topic.glossaryTerms],
      })),
    );
    expect(PRODUCT_PAGE_HELP).toEqual(
      knowledgeBase.app.help.pageHelp.map((help) => ({
        routes: [...help.routes],
        title: help.title,
        purpose: help.purpose,
        nextStep: help.nextStep,
        commonMistake: help.commonMistake,
        href: help.href,
      })),
    );
    expect(PRODUCT_FIELD_HELP).toEqual(
      knowledgeBase.app.help.fieldHelp.map((help) => ({
        key: help.id,
        label: help.label,
        body: help.body,
        example: help.example,
      })),
    );
    expect(PRODUCT_GLOSSARY).toEqual(
      knowledgeBase.app.help.glossary.map((entry) => ({
        term: entry.term,
        meaning: entry.meaning,
      })),
    );
  });

  it("has a versioned help content set", () => {
    expect(PRODUCT_HELP_VERSION).toMatch(/help-v\d+$/);
  });

  it("has unique topic slugs", () => {
    const slugs = PRODUCT_HELP_TOPICS.map((topic) => topic.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("includes critical getting-started topics", () => {
    expect(getProductHelpTopic("first-day-setup")).toBeDefined();
    expect(getProductHelpTopic("opening-downloaded-files")).toBeDefined();
    expect(getProductHelpTopic("owner-portal")).toBeDefined();
  });

  it("keeps every topic complete and actionable", () => {
    for (const topic of PRODUCT_HELP_TOPICS) {
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.summary.length).toBeGreaterThan(20);
      expect(topic.timeEstimate.length).toBeGreaterThan(0);
      expect(topic.relatedRoutes.length).toBeGreaterThan(0);
      expect(topic.sections.length).toBeGreaterThan(0);
      for (const section of topic.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.body.length).toBeGreaterThan(20);
      }
    }
  });

  it("finds topics by route", () => {
    const dashboardTopics = getProductHelpTopicsForRoute("/dashboard");
    const auditPackTopics = getProductHelpTopicsForRoute("/reports/audit-pack");

    expect(dashboardTopics.map((topic) => topic.slug)).toContain(
      "first-day-setup",
    );
    expect(auditPackTopics.map((topic) => topic.slug)).toContain(
      "audit-pack-download",
    );
  });

  it("searches titles, summaries, sections, and glossary terms", () => {
    expect(searchProductHelpTopics("download").length).toBeGreaterThan(0);
    expect(searchProductHelpTopics("reserve")[0]?.slug).toBeDefined();
    expect(searchProductHelpTopics("not-a-real-topic")).toHaveLength(0);
    expect(searchProductHelpTopics("")).toHaveLength(
      PRODUCT_HELP_TOPICS.length,
    );
  });

  it("has contextual help for the requested surfaces", () => {
    expect(PRODUCT_CONTEXTUAL_HELP).toHaveProperty("dashboard");
    expect(PRODUCT_CONTEXTUAL_HELP).toHaveProperty("settings");
    expect(PRODUCT_CONTEXTUAL_HELP).toHaveProperty("homeowners");
    expect(PRODUCT_CONTEXTUAL_HELP).toHaveProperty("reserves");
    expect(PRODUCT_CONTEXTUAL_HELP).toHaveProperty("dues");
    expect(PRODUCT_CONTEXTUAL_HELP).toHaveProperty("bankStatements");
    expect(PRODUCT_CONTEXTUAL_HELP).toHaveProperty("auditPack");
    expect(PRODUCT_CONTEXTUAL_HELP).toHaveProperty("ownerPortal");
  });

  it("has friendly page help for every core dashboard route", () => {
    const requiredRoutes = [
      "/dashboard",
      "/setup",
      "/settings",
      "/governance/homeowners",
      "/finance/dues",
      "/finance/reserves",
      "/bank/statements",
      "/bank/reconcile",
      "/close",
      "/reports",
      "/reports/audit-pack",
    ];

    for (const route of requiredRoutes) {
      const help = getPageHelpForRoute(route);

      expect(help, route).toBeDefined();
      expect(help?.title.length).toBeGreaterThan(0);
      expect(help?.purpose.length).toBeGreaterThan(20);
      expect(help?.nextStep.length).toBeGreaterThan(20);
      expect(help?.commonMistake.length).toBeGreaterThan(20);
      expect(help?.href).toMatch(/^\//);
    }

    expect(PRODUCT_PAGE_HELP.length).toBeGreaterThanOrEqual(
      requiredRoutes.length,
    );
    expect(getPageHelpForRoute("/reports/")?.title).toBe("Reports");
    expect(getPageHelpForRoute("/reports?tab=all")?.title).toBe("Reports");
    expect(getPageHelpForRoute("   /reports#audit")?.title).toBe("Reports");
    expect(getPageHelpForRoute("/not-a-route")).toBeUndefined();
  });

  it("has plain-language field help for risky form fields", () => {
    const fieldKeys = [
      "community.name",
      "community.state",
      "invite.role",
      "homeowners.csv",
      "homeowners.portalLink",
      "dues.period",
      "dues.amount",
      "dues.fundType",
      "bank.beginningBalance",
      "bank.endingBalance",
      "bank.statementCsv",
      "reconcile.finalize",
      "close.complete",
    ];

    for (const key of fieldKeys) {
      const help = getFieldHelp(key);

      expect(help, key).toBeDefined();
      expect(help?.label.length).toBeGreaterThan(0);
      expect(help?.body.length).toBeGreaterThan(20);
    }
    expect(getFieldHelp("  DUES.AMOUNT")?.label).toBe("Assessment amount");
    expect(getFieldHelp("not-a-field")).toBeUndefined();
  });

  it("describes homeowner portal links as emailable and copyable", () => {
    expect(getFieldHelp("homeowners.portalLink")?.body).toContain(
      "Portal links can be emailed from Gavelhouse or copied and shared by the board.",
    );
  });

  it("keeps owner portal onboarding focused on roster readiness", () => {
    const onboardingText = PRODUCT_ONBOARDING_STEPS.map((step) =>
      step.body.toLowerCase(),
    ).join(" ");

    expect(onboardingText).toContain("generating portal links");
    expect(onboardingText).toContain("homeowner roster");
  });

  it("has role paths for board members, homeowners, and non-technical users", () => {
    const roles = PRODUCT_ROLE_PATHS.map((path) => path.role);

    expect(roles).toContain("President");
    expect(roles).toContain("Treasurer");
    expect(roles).toContain("Secretary");
    expect(roles).toContain("Homeowner");
    expect(roles).toContain("Not comfortable with computers");
    expect(getProductHelpRolePath("plain-language")?.role).toBe(
      "Not comfortable with computers",
    );
    expect(getProductHelpRolePath("Not comfortable with computers")?.slug).toBe(
      "plain-language",
    );
    expect(getProductHelpRolePath("TREASURER")?.slug).toBe("treasurer");
    expect(getProductHelpRolePath("not-a-role")).toBeUndefined();
  });

  it("defines glossary terms used in help content", () => {
    const terms = PRODUCT_GLOSSARY.map((entry) => entry.term);

    expect(terms).toContain("PDF");
    expect(terms).toContain("ZIP");
    expect(terms).toContain("CSV");
    for (const entry of PRODUCT_GLOSSARY) {
      expect(entry.meaning.length).toBeGreaterThan(20);
    }
  });

  it("has a guided setup flow with working links", () => {
    expect(PRODUCT_ONBOARDING_STEPS.length).toBeGreaterThanOrEqual(4);
    for (const step of PRODUCT_ONBOARDING_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(20);
      expect(step.href).toMatch(/^\//);
    }
  });
});
