import { describe, it, expect } from "vitest";
import { findCandidates } from "../../../src/domain/bankRec/matching.js";
import type { MatchCandidate } from "../../../src/domain/bankRec/matching.js";

describe("findCandidates", () => {
  const makePayment = (
    id: string,
    receivedAt: string,
    amountCents: number,
  ): MatchCandidate => ({ paymentId: id, receivedAt, amountCents });

  it("returns exact amount match on same date", () => {
    const line = { id: "line-1", postedDate: "2024-01-15", amountCents: 10000 };
    const payments = [makePayment("pay-1", "2024-01-15T10:00:00Z", 10000)];

    const result = findCandidates(line, payments);

    expect(result.statementLineId).toBe("line-1");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.paymentId).toBe("pay-1");
  });

  it("returns match within +3 days window", () => {
    const line = { id: "line-2", postedDate: "2024-01-15", amountCents: 5000 };
    const payments = [makePayment("pay-2", "2024-01-18T10:00:00Z", 5000)];

    const result = findCandidates(line, payments);

    expect(result.candidates).toHaveLength(1);
  });

  it("returns match within -3 days window", () => {
    const line = { id: "line-3", postedDate: "2024-01-15", amountCents: 5000 };
    const payments = [makePayment("pay-3", "2024-01-12T10:00:00Z", 5000)];

    const result = findCandidates(line, payments);

    expect(result.candidates).toHaveLength(1);
  });

  it("excludes payments outside ±3 days window", () => {
    const line = { id: "line-4", postedDate: "2024-01-15", amountCents: 5000 };
    const payments = [
      makePayment("pay-early", "2024-01-11T10:00:00Z", 5000), // 4 days before
      makePayment("pay-late", "2024-01-19T10:00:00Z", 5000), // 4 days after
    ];

    const result = findCandidates(line, payments);

    expect(result.candidates).toHaveLength(0);
  });

  it("excludes payments with different amount", () => {
    const line = { id: "line-5", postedDate: "2024-01-15", amountCents: 5000 };
    const payments = [makePayment("pay-5", "2024-01-15T10:00:00Z", 4999)];

    const result = findCandidates(line, payments);

    expect(result.candidates).toHaveLength(0);
  });

  it("handles sign: bank statement negative amount matches positive payment", () => {
    // Withdrawals: bank shows -10000, payments are positive
    const line = {
      id: "line-6",
      postedDate: "2024-01-15",
      amountCents: -10000,
    };
    const payments = [makePayment("pay-6", "2024-01-15T10:00:00Z", 10000)];

    const result = findCandidates(line, payments);

    expect(result.candidates).toHaveLength(1);
  });

  it("returns multiple candidates when multiple payments match", () => {
    const line = { id: "line-7", postedDate: "2024-01-15", amountCents: 5000 };
    const payments = [
      makePayment("pay-7a", "2024-01-15T10:00:00Z", 5000),
      makePayment("pay-7b", "2024-01-16T10:00:00Z", 5000),
    ];

    const result = findCandidates(line, payments);

    expect(result.candidates).toHaveLength(2);
  });

  it("returns no candidates when payments list is empty", () => {
    const line = { id: "line-8", postedDate: "2024-01-15", amountCents: 5000 };

    const result = findCandidates(line, []);

    expect(result.candidates).toHaveLength(0);
    expect(result.statementLineId).toBe("line-8");
    expect(result.statementAmountCents).toBe(5000);
    expect(result.statementPostedDate).toBe("2024-01-15");
  });

  it("includes boundary dates (exactly ±3 days)", () => {
    const line = { id: "line-9", postedDate: "2024-01-15", amountCents: 3000 };
    const payments = [
      makePayment("pay-minus3", "2024-01-12T00:00:00Z", 3000), // exactly -3 days
      makePayment("pay-plus3", "2024-01-18T00:00:00Z", 3000), // exactly +3 days
    ];

    const result = findCandidates(line, payments);

    expect(result.candidates).toHaveLength(2);
  });
});
