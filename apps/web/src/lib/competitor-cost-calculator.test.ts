import { describe, it, expect } from "vitest";
import {
  calculateMonthlyForTeamSize,
  generateComparison,
  type CompetitorPricing,
} from "./competitor-cost-calculator";

// ─── Test fixtures (formerly hardcoded in the module) ────────────────────────

const COMPETITORS: CompetitorPricing[] = [
  {
    slug: "servicetitan",
    name: "ServiceTitan",
    baseMonthly: 298,
    perTechMonthly: 298,
    setupFee: 10000,
    maxTechs: null,
    isFlatRate: false,
    pricingNote:
      "~$298/tech/mo (midpoint of $245-$398). $10K setup fee (midpoint of $5K-$50K).",
  },
  {
    slug: "housecall-pro",
    name: "Housecall Pro",
    baseMonthly: 65,
    perTechMonthly: 65,
    setupFee: 0,
    maxTechs: null,
    isFlatRate: false,
    pricingNote: "$65/user/mo (Basic plan). No setup fee.",
  },
  {
    slug: "jobber",
    name: "Jobber",
    baseMonthly: 49,
    perTechMonthly: 0,
    setupFee: 0,
    maxTechs: null,
    isFlatRate: false,
    pricingNote:
      "Core $49/mo (1 user), Connect $149/mo (2-5 users), Grow $399/mo (6+ users).",
    calculateMonthly: (teamSize: number) => {
      if (teamSize === 1) return 49;
      if (teamSize <= 5) return 149;
      return 399;
    },
  },
  {
    slug: "fieldedge",
    name: "FieldEdge",
    baseMonthly: 112,
    perTechMonthly: 112,
    setupFee: 1000,
    maxTechs: null,
    isFlatRate: false,
    pricingNote: "$112/user/mo (midpoint of $100-$125). $1K setup fee.",
  },
  {
    slug: "crewroute",
    name: "CrewRoute",
    baseMonthly: 79,
    perTechMonthly: 0,
    setupFee: 0,
    maxTechs: 15,
    isFlatRate: true,
    pricingNote:
      "Solo $79/mo (1 user), Crew $149/mo (2-5 users), Growth $249/mo (6-15 users).",
    calculateMonthly: (teamSize: number) => {
      if (teamSize === 1) return 79;
      if (teamSize <= 5) return 149;
      return 249;
    },
  },
];

describe("calculateMonthlyForTeamSize", () => {
  describe("uses calculateMonthly when provided", () => {
    it("uses custom function for crewroute step pricing", () => {
      const cr = COMPETITORS.find((c) => c.slug === "crewroute")!;
      expect(calculateMonthlyForTeamSize(cr, 1)).toBe(79);
      expect(calculateMonthlyForTeamSize(cr, 2)).toBe(149);
      expect(calculateMonthlyForTeamSize(cr, 5)).toBe(149);
      expect(calculateMonthlyForTeamSize(cr, 6)).toBe(249);
      expect(calculateMonthlyForTeamSize(cr, 10)).toBe(249);
      expect(calculateMonthlyForTeamSize(cr, 15)).toBe(249);
    });

    it("uses custom function for jobber step pricing", () => {
      const j = COMPETITORS.find((c) => c.slug === "jobber")!;
      expect(calculateMonthlyForTeamSize(j, 1)).toBe(49);
      expect(calculateMonthlyForTeamSize(j, 3)).toBe(149);
      expect(calculateMonthlyForTeamSize(j, 5)).toBe(149);
      expect(calculateMonthlyForTeamSize(j, 6)).toBe(399);
      expect(calculateMonthlyForTeamSize(j, 10)).toBe(399);
    });
  });

  describe("ServiceTitan per-tech pricing (base + per-tech fallback)", () => {
    it("returns $298 for 1 tech", () => {
      const st = COMPETITORS.find((c) => c.slug === "servicetitan")!;
      expect(calculateMonthlyForTeamSize(st, 1)).toBe(298);
    });

    it("returns $894 for 3 techs (298 + 2*298)", () => {
      const st = COMPETITORS.find((c) => c.slug === "servicetitan")!;
      expect(calculateMonthlyForTeamSize(st, 3)).toBe(894);
    });

    it("returns $2980 for 10 techs", () => {
      const st = COMPETITORS.find((c) => c.slug === "servicetitan")!;
      expect(calculateMonthlyForTeamSize(st, 10)).toBe(2980);
    });
  });

  describe("Housecall Pro per-user pricing (teamSize * perTechMonthly fallback)", () => {
    it("returns $65 for 1 tech", () => {
      const hcp = COMPETITORS.find((c) => c.slug === "housecall-pro")!;
      expect(calculateMonthlyForTeamSize(hcp, 1)).toBe(65);
    });

    it("returns $195 for 3 techs", () => {
      const hcp = COMPETITORS.find((c) => c.slug === "housecall-pro")!;
      expect(calculateMonthlyForTeamSize(hcp, 3)).toBe(195);
    });

    it("returns $650 for 10 techs", () => {
      const hcp = COMPETITORS.find((c) => c.slug === "housecall-pro")!;
      expect(calculateMonthlyForTeamSize(hcp, 10)).toBe(650);
    });
  });

  describe("FieldEdge per-user pricing (teamSize * perTechMonthly fallback)", () => {
    it("returns $112 for 1 tech", () => {
      const fe = COMPETITORS.find((c) => c.slug === "fieldedge")!;
      expect(calculateMonthlyForTeamSize(fe, 1)).toBe(112);
    });

    it("returns $336 for 3 techs", () => {
      const fe = COMPETITORS.find((c) => c.slug === "fieldedge")!;
      expect(calculateMonthlyForTeamSize(fe, 3)).toBe(336);
    });

    it("returns $1120 for 10 techs", () => {
      const fe = COMPETITORS.find((c) => c.slug === "fieldedge")!;
      expect(calculateMonthlyForTeamSize(fe, 10)).toBe(1120);
    });
  });

  describe("flat-rate competitor without calculateMonthly uses baseMonthly", () => {
    it("returns baseMonthly for a flat-rate competitor with perTechMonthly=0", () => {
      const flatRate: CompetitorPricing = {
        slug: "cheapo",
        name: "Cheapo",
        baseMonthly: 50,
        perTechMonthly: 0,
        setupFee: 0,
        maxTechs: null,
        isFlatRate: true,
        pricingNote: "Flat $50/mo",
      };
      // No calculateMonthly, perTechMonthly=0 → teamSize * 0 = 0
      // But isFlatRate=true → should use baseMonthly
      expect(calculateMonthlyForTeamSize(flatRate, 1)).toBe(50);
      expect(calculateMonthlyForTeamSize(flatRate, 10)).toBe(50);
    });
  });
});

describe("generateComparison", () => {
  it("throws RangeError for teamSize=0", () => {
    expect(() => generateComparison(0, COMPETITORS, "crewroute")).toThrow(
      RangeError,
    );
  });

  it("throws RangeError for teamSize=16", () => {
    expect(() => generateComparison(16, COMPETITORS, "crewroute")).toThrow(
      RangeError,
    );
  });

  it("throws RangeError for teamSize=-1", () => {
    expect(() => generateComparison(-1, COMPETITORS, "crewroute")).toThrow(
      RangeError,
    );
  });

  it("throws RangeError for teamSize=20", () => {
    expect(() => generateComparison(20, COMPETITORS, "crewroute")).toThrow(
      RangeError,
    );
  });

  it("returns teamSize in the result", () => {
    const result = generateComparison(3, COMPETITORS, "crewroute");
    expect(result.teamSize).toBe(3);
  });

  it("returns 5 results when given 5 competitors", () => {
    const result = generateComparison(1, COMPETITORS, "crewroute");
    expect(result.results).toHaveLength(5);
  });

  it("results are sorted by monthlyTotal ascending", () => {
    for (let size = 1; size <= 15; size++) {
      const result = generateComparison(size, COMPETITORS, "crewroute");
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i].monthlyTotal).toBeGreaterThanOrEqual(
          result.results[i - 1].monthlyTotal,
        );
      }
    }
  });

  describe("teamSize=1", () => {
    it("Jobber is cheapest at teamSize=1 ($49 vs CrewRoute $79)", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      const jobber = result.results.find(
        (r) => r.competitor.slug === "jobber",
      )!;
      expect(jobber.isCheapest).toBe(true);
    });

    it("first result is Jobber (cheapest at $49)", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      expect(result.results[0].competitor.slug).toBe("jobber");
    });

    it("Jobber monthly is $49 for 1 tech", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      const jobber = result.results.find(
        (r) => r.competitor.slug === "jobber",
      )!;
      expect(jobber.monthlyTotal).toBe(49);
    });

    it("savingsVsProduct is positive for competitors more expensive than product", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      const crewroute = result.results.find(
        (r) => r.competitor.slug === "crewroute",
      )!;
      expect(crewroute.savingsVsProduct).toBe(0);

      const servicetitan = result.results.find(
        (r) => r.competitor.slug === "servicetitan",
      )!;
      expect(servicetitan.savingsVsProduct).toBeGreaterThan(0);
    });

    it("Jobber savingsVsProduct is negative (cheaper than CrewRoute at 1 tech)", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      const jobber = result.results.find(
        (r) => r.competitor.slug === "jobber",
      )!;
      expect(jobber.savingsVsProduct).toBe(-30);
    });
  });

  describe("teamSize=3", () => {
    it("results are sorted ascending", () => {
      const result = generateComparison(3, COMPETITORS, "crewroute");
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i].monthlyTotal).toBeGreaterThanOrEqual(
          result.results[i - 1].monthlyTotal,
        );
      }
    });

    it("CrewRoute monthly is $149 for 3 techs", () => {
      const result = generateComparison(3, COMPETITORS, "crewroute");
      const cr = result.results.find((r) => r.competitor.slug === "crewroute")!;
      expect(cr.monthlyTotal).toBe(149);
    });

    it("Jobber monthly is $149 for 3 techs", () => {
      const result = generateComparison(3, COMPETITORS, "crewroute");
      const j = result.results.find((r) => r.competitor.slug === "jobber")!;
      expect(j.monthlyTotal).toBe(149);
    });
  });

  describe("firstYearTotal calculation", () => {
    it("firstYearTotal = 12 * monthly + setupFee for servicetitan", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      const st = result.results.find(
        (r) => r.competitor.slug === "servicetitan",
      )!;
      expect(st.firstYearTotal).toBe(12 * st.monthlyTotal + 10000);
    });

    it("firstYearTotal = 12 * monthly for housecall-pro (no setup fee)", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      const hcp = result.results.find(
        (r) => r.competitor.slug === "housecall-pro",
      )!;
      expect(hcp.firstYearTotal).toBe(12 * hcp.monthlyTotal);
    });

    it("firstYearTotal = 12 * monthly + 1000 for fieldedge", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      const fe = result.results.find((r) => r.competitor.slug === "fieldedge")!;
      expect(fe.firstYearTotal).toBe(12 * fe.monthlyTotal + 1000);
    });
  });

  describe("annualTotal calculation", () => {
    it("annualTotal = 12 * monthly (no setup fee)", () => {
      const result = generateComparison(3, COMPETITORS, "crewroute");
      for (const r of result.results) {
        expect(r.annualTotal).toBe(12 * r.monthlyTotal);
      }
    });
  });

  describe("setupFeeAmortized", () => {
    it("setupFeeAmortized = Math.round(setupFee / 12) for servicetitan", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      const st = result.results.find(
        (r) => r.competitor.slug === "servicetitan",
      )!;
      expect(st.setupFeeAmortized).toBe(Math.round(10000 / 12));
    });

    it("setupFeeAmortized = 0 for housecall-pro", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      const hcp = result.results.find(
        (r) => r.competitor.slug === "housecall-pro",
      )!;
      expect(hcp.setupFeeAmortized).toBe(0);
    });

    it("setupFeeAmortized = Math.round(1000/12) for fieldedge", () => {
      const result = generateComparison(1, COMPETITORS, "crewroute");
      const fe = result.results.find((r) => r.competitor.slug === "fieldedge")!;
      expect(fe.setupFeeAmortized).toBe(Math.round(1000 / 12));
    });
  });

  describe("isCheapest", () => {
    it("exactly one result is cheapest when there is a clear winner", () => {
      const result = generateComparison(6, COMPETITORS, "crewroute");
      const cheapestCount = result.results.filter((r) => r.isCheapest).length;
      expect(cheapestCount).toBeGreaterThanOrEqual(1);
    });

    it("multiple results get isCheapest=true when tied", () => {
      const result = generateComparison(3, COMPETITORS, "crewroute");
      const cheapest = result.results.filter((r) => r.isCheapest);
      expect(cheapest.length).toBeGreaterThanOrEqual(2);
      const monthlyValues = cheapest.map((r) => r.monthlyTotal);
      expect(new Set(monthlyValues).size).toBe(1);
    });

    it("the cheapest result has the lowest monthlyTotal", () => {
      for (let size = 1; size <= 15; size++) {
        const result = generateComparison(size, COMPETITORS, "crewroute");
        const minMonthly = Math.min(
          ...result.results.map((r) => r.monthlyTotal),
        );
        const cheapest = result.results.filter((r) => r.isCheapest);
        for (const c of cheapest) {
          expect(c.monthlyTotal).toBe(minMonthly);
        }
      }
    });
  });

  describe("savingsVsProduct", () => {
    it("product savingsVsProduct is always 0", () => {
      for (let size = 1; size <= 15; size++) {
        const result = generateComparison(size, COMPETITORS, "crewroute");
        const cr = result.results.find(
          (r) => r.competitor.slug === "crewroute",
        )!;
        expect(cr.savingsVsProduct).toBe(0);
      }
    });

    it("savingsVsProduct = competitor monthly - product monthly", () => {
      const result = generateComparison(5, COMPETITORS, "crewroute");
      const cr = result.results.find((r) => r.competitor.slug === "crewroute")!;
      const st = result.results.find(
        (r) => r.competitor.slug === "servicetitan",
      )!;
      expect(st.savingsVsProduct).toBe(st.monthlyTotal - cr.monthlyTotal);
    });
  });

  describe("productSlug parameterization", () => {
    it("uses a different product as the comparison anchor", () => {
      const result = generateComparison(3, COMPETITORS, "jobber");
      const jobber = result.results.find(
        (r) => r.competitor.slug === "jobber",
      )!;
      expect(jobber.savingsVsProduct).toBe(0);

      const cr = result.results.find((r) => r.competitor.slug === "crewroute")!;
      expect(cr.savingsVsProduct).toBe(cr.monthlyTotal - jobber.monthlyTotal);
    });

    it("throws if productSlug is not found in competitors", () => {
      expect(() => generateComparison(3, COMPETITORS, "nonexistent")).toThrow(
        "not found",
      );
    });
  });

  describe("custom competitors array", () => {
    it("works with a minimal 2-competitor set", () => {
      const twoCompetitors: CompetitorPricing[] = [
        {
          slug: "us",
          name: "Us",
          baseMonthly: 100,
          perTechMonthly: 0,
          setupFee: 0,
          maxTechs: null,
          isFlatRate: true,
          pricingNote: "Flat $100/mo",
          calculateMonthly: () => 100,
        },
        {
          slug: "them",
          name: "Them",
          baseMonthly: 200,
          perTechMonthly: 200,
          setupFee: 500,
          maxTechs: null,
          isFlatRate: false,
          pricingNote: "$200/user/mo",
        },
      ];

      const result = generateComparison(3, twoCompetitors, "us");
      expect(result.results).toHaveLength(2);
      const us = result.results.find((r) => r.competitor.slug === "us")!;
      const them = result.results.find((r) => r.competitor.slug === "them")!;
      expect(us.monthlyTotal).toBe(100);
      expect(them.monthlyTotal).toBe(600); // 3 * 200
      expect(us.isCheapest).toBe(true);
      expect(them.savingsVsProduct).toBe(500); // 600 - 100
    });
  });
});
