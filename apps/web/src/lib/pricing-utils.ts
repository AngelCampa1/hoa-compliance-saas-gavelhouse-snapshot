/**
 * Given a monthly price in cents, compute the annual price (10 months * monthly = 20% off annual).
 * Returns a formatted string like "$490/yr" or "$490/user/yr" if unitLabel is provided.
 * Cents are converted to dollars. The result rounds to the nearest cent.
 */
export function formatAnnualPrice(
  monthlyPriceCents: number,
  unitLabel?: string,
): string {
  const annualCents = monthlyPriceCents * 10;
  const dollars = annualCents / 100;
  const formatted = formatDollars(dollars);
  const unit = unitLabel ?? "";
  return `$${formatted}${unit}/yr`;
}

/**
 * Given a monthly price in cents, compute the per-month equivalent when billed annually.
 * (annual total / 12 months) formatted as "~$XX/mo" or "~$XX/unit/mo".
 * Rounds to nearest cent.
 */
export function formatAnnualMonthlyEquivalent(
  monthlyPriceCents: number,
  unitLabel?: string,
): string {
  const annualCents = monthlyPriceCents * 10;
  const monthlyEquivalentCents = annualCents / 12;
  const dollars = Math.round(monthlyEquivalentCents) / 100;
  const formatted = formatDollars(dollars);
  const unit = unitLabel ?? "";
  return `~$${formatted}${unit}/mo`;
}

/**
 * Format the actual per-month price when billed annually, e.g. 2900 -> "$29/mo".
 * No tilde -- this is the real charge, not a rounded estimate.
 */
export function formatAnnualPerMonthPrice(
  annualPriceCents: number,
  unitLabel?: string,
): string {
  const dollars = annualPriceCents / 100;
  const formatted = formatDollars(dollars);
  const unit = unitLabel ?? "";
  return `$${formatted}${unit}/mo`;
}

/**
 * Format a dollar amount, dropping trailing ".00" for whole dollars
 * but keeping cents when non-zero (e.g. "$24.90" not "$24.900").
 */
function formatDollars(dollars: number): string {
  const rounded = Math.round(dollars * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toFixed(2);
}
