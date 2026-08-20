import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  StatementImportInput,
  MatchInput,
  FinalizeReconciliationInput,
} from "../../src/schemas/bankRec.js";

describe("StatementImportInput", () => {
  const validInput = {
    communityId: "comm-1",
    accountId: "acc-1",
    beginningBalanceCents: 100000,
    endingBalanceCents: 120000,
    statementDate: "2024-12-31",
    csv: "date,amount,description\n2024-12-01,100,Payment",
  };

  it("parses a valid statement import input", () => {
    const result = StatementImportInput.parse(validInput);
    expect(result.communityId).toBe("comm-1");
    expect(result.statementDate).toBe("2024-12-31");
  });

  it("rejects missing communityId", () => {
    const { communityId: _, ...rest } = validInput;
    expect(() => StatementImportInput.parse(rest)).toThrow(ZodError);
  });

  it("rejects non-integer beginningBalanceCents", () => {
    expect(() =>
      StatementImportInput.parse({ ...validInput, beginningBalanceCents: 1.5 }),
    ).toThrow(ZodError);
  });

  it("rejects non-date statementDate", () => {
    expect(() =>
      StatementImportInput.parse({
        ...validInput,
        statementDate: "December 31",
      }),
    ).toThrow(ZodError);
  });

  it("rejects empty csv", () => {
    expect(() =>
      StatementImportInput.parse({ ...validInput, csv: "" }),
    ).toThrow(ZodError);
  });

  it("rejects missing accountId", () => {
    const { accountId: _, ...rest } = validInput;
    expect(() => StatementImportInput.parse(rest)).toThrow(ZodError);
  });

  it("rejects empty tenant and account IDs", () => {
    expect(() =>
      StatementImportInput.parse({ ...validInput, communityId: "" }),
    ).toThrow(ZodError);
    expect(() =>
      StatementImportInput.parse({ ...validInput, accountId: "" }),
    ).toThrow(ZodError);
  });
});

describe("MatchInput", () => {
  const validWithPayment = {
    communityId: "comm-1",
    reconciliationId: "rec-1",
    statementLineId: "line-1",
    paymentId: "pay-1",
    journalLineId: null,
  };

  const validWithJournal = {
    communityId: "comm-1",
    reconciliationId: "rec-1",
    statementLineId: "line-1",
    paymentId: null,
    journalLineId: "jl-1",
  };

  it("parses when paymentId is provided and journalLineId is null", () => {
    const result = MatchInput.parse(validWithPayment);
    expect(result.paymentId).toBe("pay-1");
    expect(result.journalLineId).toBeNull();
  });

  it("parses when journalLineId is provided and paymentId is null", () => {
    const result = MatchInput.parse(validWithJournal);
    expect(result.journalLineId).toBe("jl-1");
    expect(result.paymentId).toBeNull();
  });

  it("parses when both paymentId and journalLineId are provided", () => {
    expect(() =>
      MatchInput.parse({ ...validWithPayment, journalLineId: "jl-1" }),
    ).not.toThrow();
  });

  it("rejects when both paymentId and journalLineId are null", () => {
    expect(() =>
      MatchInput.parse({
        ...validWithPayment,
        paymentId: null,
        journalLineId: null,
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing communityId", () => {
    const { communityId: _, ...rest } = validWithPayment;
    expect(() => MatchInput.parse(rest)).toThrow(ZodError);
  });

  it("rejects missing reconciliationId", () => {
    const { reconciliationId: _, ...rest } = validWithPayment;
    expect(() => MatchInput.parse(rest)).toThrow(ZodError);
  });

  it("rejects empty IDs", () => {
    for (const key of [
      "communityId",
      "reconciliationId",
      "statementLineId",
      "paymentId",
      "journalLineId",
    ] as const) {
      expect(() =>
        MatchInput.parse({ ...validWithPayment, [key]: "" }),
      ).toThrow(ZodError);
    }
  });
});

describe("FinalizeReconciliationInput", () => {
  it("parses a valid finalize input", () => {
    const result = FinalizeReconciliationInput.parse({
      communityId: "comm-1",
      reconciliationId: "rec-1",
    });
    expect(result.reconciliationId).toBe("rec-1");
  });

  it("rejects missing communityId", () => {
    expect(() =>
      FinalizeReconciliationInput.parse({ reconciliationId: "rec-1" }),
    ).toThrow(ZodError);
  });

  it("rejects missing reconciliationId", () => {
    expect(() =>
      FinalizeReconciliationInput.parse({ communityId: "comm-1" }),
    ).toThrow(ZodError);
  });

  it("rejects empty IDs", () => {
    expect(() =>
      FinalizeReconciliationInput.parse({
        communityId: "",
        reconciliationId: "rec-1",
      }),
    ).toThrow(ZodError);
    expect(() =>
      FinalizeReconciliationInput.parse({
        communityId: "comm-1",
        reconciliationId: "",
      }),
    ).toThrow(ZodError);
  });
});

// INT32 overflow guard tests
describe("int32 overflow guard — bankRec schemas", () => {
  const INT32_MAX = 2147483647;
  const INT32_MIN = -2147483648;
  const validInput = {
    communityId: "comm-1",
    accountId: "acc-1",
    beginningBalanceCents: 100000,
    endingBalanceCents: 120000,
    statementDate: "2024-12-31",
    csv: "date,amount,description\n2024-12-01,100,Payment",
  };

  it("rejects StatementImportInput.endingBalanceCents above INT32_MAX", () => {
    const result = StatementImportInput.safeParse({
      ...validInput,
      endingBalanceCents: INT32_MAX + 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects StatementImportInput.beginningBalanceCents above INT32_MAX", () => {
    const result = StatementImportInput.safeParse({
      ...validInput,
      beginningBalanceCents: INT32_MAX + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts StatementImportInput.beginningBalanceCents at INT32_MIN (overdraft)", () => {
    const result = StatementImportInput.safeParse({
      ...validInput,
      beginningBalanceCents: INT32_MIN,
    });
    expect(result.success).toBe(true);
  });

  it("rejects StatementImportInput.beginningBalanceCents below INT32_MIN", () => {
    const result = StatementImportInput.safeParse({
      ...validInput,
      beginningBalanceCents: INT32_MIN - 1,
    });
    expect(result.success).toBe(false);
  });
});
