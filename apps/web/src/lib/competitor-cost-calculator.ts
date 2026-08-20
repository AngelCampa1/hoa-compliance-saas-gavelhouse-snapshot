export interface CompetitorPricing {
  slug: string;
  name: string;
  /** Base monthly price for 1 tech/user */
  baseMonthly: number;
  /** Additional cost per tech beyond the first (0 if flat-rate) */
  perTechMonthly: number;
  /** One-time setup fee (0 if none) */
  setupFee: number;
  /** Max techs at this pricing (null = unlimited) */
  maxTechs: number | null;
  /** Whether this is a flat-rate product */
  isFlatRate: boolean;
  /** Human-readable note about pricing model */
  pricingNote: string;
  /** Custom pricing function for tiered/step pricing models */
  calculateMonthly?: (teamSize: number) => number;
}

export interface CostResult {
  competitor: CompetitorPricing;
  monthlyTotal: number;
  firstYearTotal: number;
  annualTotal: number;
  setupFeeAmortized: number;
  isCheapest: boolean;
  /** their monthlyTotal - product monthlyTotal (negative = cheaper than product) */
  savingsVsProduct: number;
}

export interface ComparisonResult {
  teamSize: number;
  results: CostResult[];
}

export function calculateMonthlyForTeamSize(
  competitor: CompetitorPricing,
  teamSize: number,
): number {
  if (competitor.calculateMonthly) {
    return competitor.calculateMonthly(teamSize);
  }

  // Flat-rate with no per-tech cost: use base price
  if (competitor.isFlatRate && competitor.perTechMonthly === 0) {
    return competitor.baseMonthly;
  }

  // Per-user pricing: teamSize * perTechMonthly
  return teamSize * competitor.perTechMonthly;
}

export function generateComparison(
  teamSize: number,
  competitors: CompetitorPricing[],
  productSlug: string,
): ComparisonResult {
  if (teamSize < 1 || teamSize > 15) {
    throw new RangeError(`teamSize must be between 1 and 15, got ${teamSize}`);
  }

  const product = competitors.find((c) => c.slug === productSlug);
  if (!product) {
    throw new Error(
      `Product slug "${productSlug}" not found in competitors array`,
    );
  }

  const productMonthly = calculateMonthlyForTeamSize(product, teamSize);

  const unsorted: Omit<CostResult, "isCheapest">[] = competitors.map(
    (competitor) => {
      const monthlyTotal = calculateMonthlyForTeamSize(competitor, teamSize);
      const setupFeeAmortized = Math.round(competitor.setupFee / 12);
      return {
        competitor,
        monthlyTotal,
        firstYearTotal: 12 * monthlyTotal + competitor.setupFee,
        annualTotal: 12 * monthlyTotal,
        setupFeeAmortized,
        savingsVsProduct: monthlyTotal - productMonthly,
      };
    },
  );

  const minMonthly = Math.min(...unsorted.map((r) => r.monthlyTotal));

  const results: CostResult[] = unsorted
    .map((r) => ({
      ...r,
      isCheapest: r.monthlyTotal === minMonthly,
    }))
    .sort((a, b) => a.monthlyTotal - b.monthlyTotal);

  return { teamSize, results };
}
