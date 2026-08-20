const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Mirrors the old TrialBalanceTable/portal formatCents: negatives as "-$1,234.56", positives as "$1,234.56", zero "$0.00".
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}${usd.format(Math.abs(cents) / 100)}`;
}

// Mirrors the old ReconcileGrid formatStatementAmount: explicit +/- prefix, "+$1,234.56" / "-$1,234.56" / "+$0.00".
export function formatStatementAmount(amountCents: number): string {
  const sign = amountCents < 0 ? "-" : "+";
  return `${sign}${usd.format(Math.abs(amountCents) / 100)}`;
}

// Mirrors the old journal centsToDisplay: grouped decimal WITHOUT a "$" prefix (call-sites add "$" themselves),
// negatives keep a leading "-". e.g. "1,000.00", "-12.34", "0.00".
const plain = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export function centsToDecimal(cents: number): string {
  return plain.format(cents / 100);
}
