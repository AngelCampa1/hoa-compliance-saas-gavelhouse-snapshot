/**
 * Verifies that the sum of matched line amounts equals the expected net change
 * (endingBalance - beginningBalance) within ±1 cent.
 *
 * Returns { balanced: true, deltaCents } when within tolerance,
 * { balanced: false, deltaCents } otherwise.
 * deltaCents = matchedAmountCents - (endingBalanceCents - beginningBalanceCents)
 */
export function verifyBalance(
  matchedAmountCents: number,
  beginningBalanceCents: number,
  endingBalanceCents: number,
): { balanced: boolean; deltaCents: number } {
  for (const [name, value] of [
    ["matchedAmountCents", matchedAmountCents],
    ["beginningBalanceCents", beginningBalanceCents],
    ["endingBalanceCents", endingBalanceCents],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`verifyBalance: ${name} must be a finite number`);
    }
  }
  const expectedNet = endingBalanceCents - beginningBalanceCents;
  const deltaCents = matchedAmountCents - expectedNet;
  const balanced = Math.abs(deltaCents) <= 1;
  return { balanced, deltaCents };
}
