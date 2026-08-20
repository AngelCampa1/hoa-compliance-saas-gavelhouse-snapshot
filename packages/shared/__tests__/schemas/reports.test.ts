import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  TrialBalanceQuery,
  TrialBalanceRow,
  BalanceSheetQuery,
  LedgerQuery,
  AuditPackQuery,
  RoleHandoffQuery,
} from "../../src/schemas/reports.js";

describe("TrialBalanceQuery", () => {
  it("parses a valid query", () => {
    const result = TrialBalanceQuery.parse({
      communityId: "comm-1",
      asOf: "2024-12-31",
    });
    expect(result.communityId).toBe("comm-1");
    expect(result.asOf).toBe("2024-12-31");
  });

  it("rejects missing communityId", () => {
    expect(() => TrialBalanceQuery.parse({ asOf: "2024-12-31" })).toThrow(
      ZodError,
    );
  });

  it("rejects non-date asOf", () => {
    expect(() =>
      TrialBalanceQuery.parse({ communityId: "c1", asOf: "not-a-date" }),
    ).toThrow(ZodError);
  });

  it("rejects missing asOf", () => {
    expect(() => TrialBalanceQuery.parse({ communityId: "c1" })).toThrow(
      ZodError,
    );
  });
});

describe("TrialBalanceRow", () => {
  const validRow = {
    accountId: "acc-1",
    accountCode: "1000",
    accountName: "Cash",
    accountType: "asset" as const,
    fundType: "operating" as const,
    debitCents: 100000,
    creditCents: 0,
  };

  it("parses a valid row", () => {
    const result = TrialBalanceRow.parse(validRow);
    expect(result.accountType).toBe("asset");
    expect(result.fundType).toBe("operating");
  });

  it("accepts all valid accountType values", () => {
    const types = [
      "asset",
      "liability",
      "equity",
      "revenue",
      "expense",
    ] as const;
    for (const accountType of types) {
      expect(() =>
        TrialBalanceRow.parse({ ...validRow, accountType }),
      ).not.toThrow();
    }
  });

  it("accepts all valid fundType values", () => {
    const fundTypes = ["operating", "reserve"] as const;
    for (const fundType of fundTypes) {
      expect(() =>
        TrialBalanceRow.parse({ ...validRow, fundType }),
      ).not.toThrow();
    }
  });

  it("rejects invalid accountType", () => {
    expect(() =>
      TrialBalanceRow.parse({ ...validRow, accountType: "invalid" }),
    ).toThrow(ZodError);
  });

  it("rejects invalid fundType", () => {
    expect(() =>
      TrialBalanceRow.parse({ ...validRow, fundType: "invalid" }),
    ).toThrow(ZodError);
  });

  it("rejects non-integer debitCents", () => {
    expect(() =>
      TrialBalanceRow.parse({ ...validRow, debitCents: 1.5 }),
    ).toThrow(ZodError);
  });

  it("rejects missing accountId", () => {
    const { accountId: _, ...rest } = validRow;
    expect(() => TrialBalanceRow.parse(rest)).toThrow(ZodError);
  });
});

describe("BalanceSheetQuery", () => {
  it("parses a valid query", () => {
    const result = BalanceSheetQuery.parse({
      communityId: "comm-1",
      asOf: "2024-12-31",
    });
    expect(result.communityId).toBe("comm-1");
    expect(result.asOf).toBe("2024-12-31");
  });

  it("rejects missing communityId", () => {
    expect(() => BalanceSheetQuery.parse({ asOf: "2024-12-31" })).toThrow(
      ZodError,
    );
  });

  it("rejects non-date asOf", () => {
    expect(() =>
      BalanceSheetQuery.parse({ communityId: "c1", asOf: "not-a-date" }),
    ).toThrow(ZodError);
  });

  it("rejects missing asOf", () => {
    expect(() => BalanceSheetQuery.parse({ communityId: "c1" })).toThrow(
      ZodError,
    );
  });
});

describe("LedgerQuery", () => {
  const validQuery = {
    communityId: "comm-1",
    from: "2024-01-01",
    to: "2024-12-31",
  };

  it("parses a valid query without optional fields", () => {
    const result = LedgerQuery.parse(validQuery);
    expect(result.communityId).toBe("comm-1");
    expect(result.accountId).toBeUndefined();
    expect(result.fundType).toBeUndefined();
  });

  it("parses a valid query with optional accountId", () => {
    const result = LedgerQuery.parse({ ...validQuery, accountId: "acc-1" });
    expect(result.accountId).toBe("acc-1");
  });

  it("parses a valid query with optional fundType", () => {
    const result = LedgerQuery.parse({ ...validQuery, fundType: "reserve" });
    expect(result.fundType).toBe("reserve");
  });

  it("rejects invalid fundType", () => {
    expect(() =>
      LedgerQuery.parse({ ...validQuery, fundType: "invalid" }),
    ).toThrow(ZodError);
  });

  it("rejects missing communityId", () => {
    expect(() =>
      LedgerQuery.parse({ from: "2024-01-01", to: "2024-12-31" }),
    ).toThrow(ZodError);
  });

  it("rejects non-date from", () => {
    expect(() =>
      LedgerQuery.parse({ ...validQuery, from: "January 1" }),
    ).toThrow(ZodError);
  });
});

describe("AuditPackQuery", () => {
  it("parses a valid query", () => {
    const result = AuditPackQuery.parse({
      communityId: "comm-1",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    expect(result.periodStart).toBe("2024-01-01");
  });

  it("rejects missing periodStart", () => {
    expect(() =>
      AuditPackQuery.parse({ communityId: "c1", periodEnd: "2024-12-31" }),
    ).toThrow(ZodError);
  });

  it("rejects non-date periodEnd", () => {
    expect(() =>
      AuditPackQuery.parse({
        communityId: "c1",
        periodStart: "2024-01-01",
        periodEnd: "bad",
      }),
    ).toThrow(ZodError);
  });
});

describe("RoleHandoffQuery", () => {
  it("parses a valid query", () => {
    const result = RoleHandoffQuery.parse({
      communityId: "comm-1",
      transitionId: "trans-1",
    });
    expect(result.transitionId).toBe("trans-1");
  });

  it("rejects missing transitionId", () => {
    expect(() => RoleHandoffQuery.parse({ communityId: "comm-1" })).toThrow(
      ZodError,
    );
  });

  it("rejects missing communityId", () => {
    expect(() => RoleHandoffQuery.parse({ transitionId: "trans-1" })).toThrow(
      ZodError,
    );
  });
});
