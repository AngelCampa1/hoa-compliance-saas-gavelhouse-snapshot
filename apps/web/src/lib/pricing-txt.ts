import type { PriceTierInput } from "./schema-types";

export function buildPricingTxt(opts: {
  productName: string;
  tiers: PriceTierInput[];
  updatedAt: string;
  trialText?: string;
  promoText?: string;
  guaranteeText?: string;
}): string {
  const lines: string[] = [];

  lines.push(`# ${opts.productName} Pricing`);
  lines.push(`Updated: ${opts.updatedAt}`);
  lines.push("Currency: USD");

  if (opts.trialText) {
    lines.push(`Trial: ${opts.trialText}`);
  }

  if (opts.promoText) {
    lines.push(`Promo: ${opts.promoText}`);
  }

  if (opts.guaranteeText) {
    lines.push(`Guarantee: ${opts.guaranteeText}`);
  }

  for (const tier of opts.tiers) {
    lines.push("");
    lines.push(`## ${tier.name}`);

    if (tier.monthlyPriceCents !== undefined) {
      lines.push(
        `Monthly billing list price: ${formatMonthlyCents(
          tier.monthlyPriceCents,
        )}/mo`,
      );
    }

    if (tier.annualPriceCents !== undefined) {
      lines.push(
        `Annual billing list monthly equivalent: ${formatMonthlyCents(
          tier.annualPriceCents,
        )}/mo`,
      );
    }

    if (tier.annualTotalPriceCents !== undefined) {
      lines.push(
        `Annual billing list total: ${formatAnnualCents(
          tier.annualTotalPriceCents,
        )}`,
      );
    }

    lines.push(`Displayed offer price: ${tier.price}`);

    if (tier.annualPriceOverride) {
      lines.push(`Annual: ${tier.annualPriceOverride}`);
    }

    if (tier.lifetimePriceOverride) {
      lines.push(`Lifetime: ${tier.lifetimePriceOverride}`);
    }

    if (tier.description) {
      lines.push(`Description: ${tier.description}`);
    }

    lines.push("Features:");
    for (const feature of tier.features) {
      lines.push(`- ${feature}`);
    }
  }

  return lines.join("\n");
}

function formatMonthlyCents(cents: number): string {
  return formatUsd(cents);
}

function formatAnnualCents(cents: number): string {
  return `${formatUsd(cents)}/yr`;
}

function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}
