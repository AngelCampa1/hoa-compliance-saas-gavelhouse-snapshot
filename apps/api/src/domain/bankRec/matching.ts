export type MatchCandidate = {
  paymentId: string;
  receivedAt: string; // ISO date string
  amountCents: number;
};

export type MatchResult = {
  statementLineId: string;
  statementAmountCents: number;
  statementPostedDate: string;
  candidates: MatchCandidate[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Converts an ISO date or datetime string to a UTC day timestamp (midnight UTC).
 * This normalises "2024-01-15" and "2024-01-15T10:00:00Z" to the same day bucket.
 */
function toUtcDayMs(dateStr: string): number {
  // Take only the date portion (YYYY-MM-DD) and parse as midnight UTC
  const datePart = dateStr.slice(0, 10);
  return Date.UTC(
    parseInt(datePart.slice(0, 4), 10),
    parseInt(datePart.slice(5, 7), 10) - 1,
    parseInt(datePart.slice(8, 10), 10),
  );
}

/**
 * Returns payments within ±3 days of statementLine.postedDate AND exact
 * absolute amountCents match (bank uses negative for withdrawals, payments
 * are always positive).
 *
 * Date comparison is day-level (ignores time-of-day).
 */
export function findCandidates(
  statementLine: { id: string; postedDate: string; amountCents: number },
  payments: MatchCandidate[],
): MatchResult {
  const lineDayMs = toUtcDayMs(statementLine.postedDate);
  const lineAmount = Math.abs(statementLine.amountCents);

  const candidates = payments.filter((payment) => {
    const paymentDayMs = toUtcDayMs(payment.receivedAt);
    const diffDays = Math.abs(paymentDayMs - lineDayMs) / MS_PER_DAY;
    const amountMatches = Math.abs(payment.amountCents) === lineAmount;
    return diffDays <= 3 && amountMatches;
  });

  return {
    statementLineId: statementLine.id,
    statementAmountCents: statementLine.amountCents,
    statementPostedDate: statementLine.postedDate,
    candidates,
  };
}
