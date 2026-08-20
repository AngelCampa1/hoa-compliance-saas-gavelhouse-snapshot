import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CompetitorPricing } from "../lib/competitor-cost-calculator";
import { SoftwareCostCalculator } from "./software-cost-calculator";

vi.mock("../lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

import { trackEvent } from "../lib/analytics";

const TEST_COMPETITORS: CompetitorPricing[] = [
  {
    slug: "servicetitan",
    name: "ServiceTitan",
    baseMonthly: 298,
    perTechMonthly: 298,
    setupFee: 10000,
    maxTechs: null,
    isFlatRate: false,
    pricingNote: "~$298/tech/mo.",
  },
  {
    slug: "housecall-pro",
    name: "Housecall Pro",
    baseMonthly: 65,
    perTechMonthly: 65,
    setupFee: 0,
    maxTechs: null,
    isFlatRate: false,
    pricingNote: "$65/user/mo.",
  },
  {
    slug: "jobber",
    name: "Jobber",
    baseMonthly: 49,
    perTechMonthly: 0,
    setupFee: 0,
    maxTechs: null,
    isFlatRate: false,
    pricingNote: "Core $49/mo, Connect $149/mo, Grow $399/mo.",
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
    pricingNote: "$112/user/mo.",
  },
  {
    slug: "gavelhouse",
    name: "Gavelhouse",
    baseMonthly: 79,
    perTechMonthly: 0,
    setupFee: 0,
    maxTechs: 15,
    isFlatRate: true,
    pricingNote: "Solo $79/mo, Crew $149/mo, Growth $$49/mo.",
    calculateMonthly: (teamSize: number) => {
      if (teamSize === 1) return 79;
      if (teamSize <= 5) return 149;
      return 249;
    },
  },
];

const defaultProps = {
  trialUrl: "/#pricing",
  productSlug: "gavelhouse",
  productSubtitle: "Flat Rate - No per-tech fees",
  savingsTemplate:
    "At {teamSize} {techLabel}, {productName} saves you {savings}/mo vs. {competitor}",
  savingsSubTemplate: "That is {annualSavings} saved each year.",
  ctaText: "Start trial",
  competitors: TEST_COMPETITORS,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SoftwareCostCalculator", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(screen.getByRole("slider")).toBeDefined();
    });

    it("defaults to team size 3", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const slider = screen.getByRole("slider") as HTMLInputElement;
      expect(slider.value).toBe("3");
    });

    it("slider has min=1", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const slider = screen.getByRole("slider") as HTMLInputElement;
      expect(slider.min).toBe("1");
    });

    it("slider has max=15", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const slider = screen.getByRole("slider") as HTMLInputElement;
      expect(slider.max).toBe("15");
    });

    it("slider has step=1", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const slider = screen.getByRole("slider") as HTMLInputElement;
      expect(slider.step).toBe("1");
    });

    it("first row in results table is cheapest competitor at teamSize=3", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const rows = screen.getAllByRole("row");
      expect(rows[1].textContent).toContain("Jobber");
    });

    it("shows team size label with default value of 3", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(screen.getByText(/team size.*3 tech/i)).toBeDefined();
    });

    it("renders all 5 competitor names in the results table", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(screen.getByText("ServiceTitan")).toBeDefined();
      expect(screen.getByText("Housecall Pro")).toBeDefined();
      expect(screen.getByText("Jobber")).toBeDefined();
      expect(screen.getByText("FieldEdge")).toBeDefined();
      expect(screen.getByText("Gavelhouse")).toBeDefined();
    });

    it("renders the CTA button linking to trialUrl", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const link = screen.getByRole("link", {
        name: /start trial/i,
      }) as HTMLAnchorElement;
      expect(link.href).toContain("/#pricing");
    });

    it("renders 'Lowest Cost' badge for cheapest competitor", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const badges = screen.getAllByText("Lowest Cost");
      expect(badges.length).toBeGreaterThan(0);
    });

    it("product row has a distinctive highlight marker", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(screen.getByRole("row", { name: /gavelhouse/i })).toBeDefined();
    });

    it("shows product subtitle under highlighted row", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(screen.getByText(/flat rate.*no per-tech fees/i)).toBeDefined();
    });

    it("does not show subtitle when productSubtitle is omitted", () => {
      const { productSubtitle: _productSubtitle, ...propsWithoutSubtitle } =
        defaultProps;
      render(<SoftwareCostCalculator {...propsWithoutSubtitle} />);
      expect(screen.queryByText(/flat rate.*no per-tech fees/i)).toBeNull();
    });

    it("shows savings callout for team size > 1", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(screen.getByText(/gavelhouse saves you/i)).toBeDefined();
    });

    it("shows monthly cost columns in table", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(screen.getByText(/monthly/i)).toBeDefined();
    });

    it("renders custom CTA text", () => {
      render(
        <SoftwareCostCalculator
          {...defaultProps}
          ctaText="Get Started Now ->"
        />,
      );
      expect(screen.getByText("Get Started Now ->")).toBeDefined();
    });

    it("renders setup fee copy for competitors that charge one", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(screen.getByText(/incl\.\s*\$10,000 setup/i)).toBeDefined();
    });
  });

  describe("slider interaction", () => {
    it("updates team size label when slider changes", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "5" } });
      expect(screen.getByText(/team size.*5 tech/i)).toBeDefined();
    });

    it("updates the savings callout when slider changes", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const slider = screen.getByRole("slider");

      fireEvent.change(slider, { target: { value: "1" } });
      expect(
        screen.getByText(/at 1 tech.*gavelhouse saves you/i),
      ).toBeDefined();
      expect(screen.getByText(/\$219\/mo vs\. servicetitan/i)).toBeDefined();

      fireEvent.change(slider, { target: { value: "10" } });
      expect(
        screen.getByText(/at 10 techs.*gavelhouse saves you/i),
      ).toBeDefined();
      expect(screen.getByText(/\$2,731\/mo vs\. servicetitan/i)).toBeDefined();
    });

    it("calls trackEvent when slider changes", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "7" } });
      expect(trackEvent).toHaveBeenCalledWith(
        "cost_calculator_team_size_changed",
        { team_size: 7 },
      );
    });

    it("calls trackEvent with numeric team_size", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "10" } });
      expect(trackEvent).toHaveBeenCalledWith(
        "cost_calculator_team_size_changed",
        { team_size: 10 },
      );
    });
  });

  describe("savings callout", () => {
    it("shows team size number in savings callout", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(screen.getByText(/at 3 tech/i)).toBeDefined();
    });

    it("shows dollar amount in savings callout", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(
        screen.getByText(/gavelhouse saves you.*\$\d+.*mo/i),
      ).toBeDefined();
    });

    it("still shows savings at team size 1", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "1" } });
      expect(screen.getByRole("slider")).toBeDefined();
    });

    it("uses the singular tech label at team size 1", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "1" } });
      expect(screen.getByText(/at 1 tech,/i)).toBeDefined();
    });
  });

  describe("CTA", () => {
    it("CTA uses btn-primary class", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const link = screen.getByRole("link", {
        name: /start trial/i,
      });
      expect(link.className).toContain("btn-primary");
    });

    it("CTA text uses the short trial label", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      expect(screen.getByText(/start trial/i)).toBeDefined();
    });
  });

  describe("formatting", () => {
    it("monthly cost values show $ prefix", () => {
      render(<SoftwareCostCalculator {...defaultProps} />);
      const cells = screen
        .getAllByRole("cell")
        .filter((cell) => cell.textContent?.startsWith("$"));
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  describe("parameterization", () => {
    it("highlights a different product when productSlug changes", () => {
      render(
        <SoftwareCostCalculator
          {...defaultProps}
          productSlug="jobber"
          productSubtitle="Tiered pricing"
        />,
      );
      expect(screen.getByRole("row", { name: /jobber/i })).toBeDefined();
      expect(screen.getByText("Tiered pricing")).toBeDefined();
    });

    it("uses custom savings template", () => {
      render(
        <SoftwareCostCalculator
          {...defaultProps}
          savingsTemplate="Save {savings}/mo with {productName} over {competitor}"
        />,
      );
      expect(screen.getByText(/save.*with gavelhouse over/i)).toBeDefined();
    });

    it("renders without error when only the product slug is in competitors", () => {
      const soloCompetitor: CompetitorPricing[] = [
        {
          slug: "gavelhouse",
          name: "Gavelhouse",
          baseMonthly: 20,
          perTechMonthly: 0,
          setupFee: 0,
          maxTechs: 1,
          isFlatRate: true,
          pricingNote: "$29/mo billed annually flat.",
        },
      ];

      render(
        <SoftwareCostCalculator
          {...defaultProps}
          competitors={soloCompetitor}
        />,
      );

      expect(screen.getByText("Gavelhouse")).toBeDefined();
      expect(screen.queryByText(/saves you/i)).toBeNull();
    });

    it("uses default CTA and savings copy when optional copy props are omitted", () => {
      const {
        ctaText: _ctaText,
        savingsTemplate: _savingsTemplate,
        savingsSubTemplate: _savingsSubTemplate,
        ...propsWithoutOptionalCopy
      } = defaultProps;

      render(<SoftwareCostCalculator {...propsWithoutOptionalCopy} />);

      expect(screen.getByRole("link", { name: /start trial/i })).toBeDefined();
      expect(
        screen.getByText(/at 3 techs, gavelhouse saves you/i),
      ).toBeDefined();
      expect(
        screen.getByText(/that is \$\d{1,3}(,\d{3})* saved each year/i),
      ).toBeDefined();
    });

    it("falls back to the raw product slug when the product name is missing", () => {
      const namelessProduct = TEST_COMPETITORS.map((competitor) =>
        competitor.slug === "gavelhouse"
          ? ({ ...competitor, name: undefined } as never)
          : competitor,
      );

      render(
        <SoftwareCostCalculator
          {...defaultProps}
          competitors={namelessProduct}
          savingsTemplate="Save with {productName}"
        />,
      );

      expect(screen.getByText("Save with gavelhouse")).toBeDefined();
    });

    it("hides the savings callout when the highlighted product is the most expensive option", () => {
      const expensiveProduct: CompetitorPricing[] = [
        {
          slug: "gavelhouse",
          name: "Gavelhouse",
          baseMonthly: 999,
          perTechMonthly: 0,
          setupFee: 0,
          maxTechs: null,
          isFlatRate: true,
          pricingNote: "$999/mo flat.",
        },
        {
          slug: "budget-option",
          name: "Budget Option",
          baseMonthly: 99,
          perTechMonthly: 0,
          setupFee: 0,
          maxTechs: null,
          isFlatRate: true,
          pricingNote: "$149/mo billed annually.",
        },
      ];

      render(
        <SoftwareCostCalculator
          {...defaultProps}
          competitors={expensiveProduct}
        />,
      );

      expect(screen.queryByText(/saves you/i)).toBeNull();
    });
  });
});
