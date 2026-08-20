import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  accountTypeEnum,
  fundTypeEnum,
  createAccountInput,
  updateAccountInput,
} from "../../src/schemas/chartOfAccounts.js";

describe("accountTypeEnum", () => {
  it("accepts all valid account types", () => {
    const types = [
      "asset",
      "liability",
      "equity",
      "revenue",
      "expense",
    ] as const;
    for (const t of types) {
      expect(accountTypeEnum.parse(t)).toBe(t);
    }
  });

  it("rejects an invalid account type", () => {
    expect(() => accountTypeEnum.parse("debit")).toThrow(ZodError);
  });

  it("rejects empty string", () => {
    expect(() => accountTypeEnum.parse("")).toThrow(ZodError);
  });
});

describe("fundTypeEnum", () => {
  it("accepts operating", () => {
    expect(fundTypeEnum.parse("operating")).toBe("operating");
  });

  it("accepts reserve", () => {
    expect(fundTypeEnum.parse("reserve")).toBe("reserve");
  });

  it("rejects an invalid fund type", () => {
    expect(() => fundTypeEnum.parse("general")).toThrow(ZodError);
  });

  it("rejects empty string", () => {
    expect(() => fundTypeEnum.parse("")).toThrow(ZodError);
  });
});

describe("createAccountInput", () => {
  it("parses a valid operating asset account", () => {
    const result = createAccountInput.parse({
      code: "1000",
      name: "Operating Checking",
      accountType: "asset",
      fundType: "operating",
    });
    expect(result.code).toBe("1000");
    expect(result.name).toBe("Operating Checking");
    expect(result.accountType).toBe("asset");
    expect(result.fundType).toBe("operating");
    expect(result.parentAccountId).toBeUndefined();
  });

  it("parses a valid reserve account with parentAccountId", () => {
    const result = createAccountInput.parse({
      code: "1500",
      name: "Reserve Checking",
      accountType: "asset",
      fundType: "reserve",
      parentAccountId: "parent-id-123",
    });
    expect(result.fundType).toBe("reserve");
    expect(result.parentAccountId).toBe("parent-id-123");
  });

  it("parses with null parentAccountId", () => {
    const result = createAccountInput.parse({
      code: "2000",
      name: "Accounts Payable",
      accountType: "liability",
      fundType: "operating",
      parentAccountId: null,
    });
    expect(result.parentAccountId).toBeNull();
  });

  it("rejects empty code", () => {
    expect(() =>
      createAccountInput.parse({
        code: "",
        name: "Operating Checking",
        accountType: "asset",
        fundType: "operating",
      }),
    ).toThrow(ZodError);
  });

  it("rejects code longer than 20 chars", () => {
    expect(() =>
      createAccountInput.parse({
        code: "1".repeat(21),
        name: "Operating Checking",
        accountType: "asset",
        fundType: "operating",
      }),
    ).toThrow(ZodError);
  });

  it("accepts code of exactly 20 chars", () => {
    const result = createAccountInput.parse({
      code: "1".repeat(20),
      name: "Operating Checking",
      accountType: "asset",
      fundType: "operating",
    });
    expect(result.code.length).toBe(20);
  });

  it("rejects empty name", () => {
    expect(() =>
      createAccountInput.parse({
        code: "1000",
        name: "",
        accountType: "asset",
        fundType: "operating",
      }),
    ).toThrow(ZodError);
  });

  it("rejects name longer than 256 chars", () => {
    expect(() =>
      createAccountInput.parse({
        code: "1000",
        name: "a".repeat(257),
        accountType: "asset",
        fundType: "operating",
      }),
    ).toThrow(ZodError);
  });

  it("rejects invalid accountType", () => {
    expect(() =>
      createAccountInput.parse({
        code: "1000",
        name: "Operating Checking",
        accountType: "debit",
        fundType: "operating",
      }),
    ).toThrow(ZodError);
  });

  it("rejects invalid fundType", () => {
    expect(() =>
      createAccountInput.parse({
        code: "1000",
        name: "Operating Checking",
        accountType: "asset",
        fundType: "general",
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing fundType", () => {
    expect(() =>
      createAccountInput.parse({
        code: "1000",
        name: "Operating Checking",
        accountType: "asset",
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing accountType", () => {
    expect(() =>
      createAccountInput.parse({
        code: "1000",
        name: "Operating Checking",
        fundType: "operating",
      }),
    ).toThrow(ZodError);
  });
});

describe("updateAccountInput", () => {
  it("parses partial update with just name", () => {
    const result = updateAccountInput.parse({ name: "New Account Name" });
    expect(result.name).toBe("New Account Name");
    expect(result.code).toBeUndefined();
    expect(result.accountType).toBeUndefined();
    expect(result.fundType).toBeUndefined();
  });

  it("parses update with active flag", () => {
    const result = updateAccountInput.parse({ active: false });
    expect(result.active).toBe(false);
  });

  it("parses partial update with parentAccountId", () => {
    const result = updateAccountInput.parse({ parentAccountId: "parent-123" });
    expect(result.parentAccountId).toBe("parent-123");
  });

  it("parses empty object (all optional)", () => {
    const result = updateAccountInput.parse({});
    expect(result.name).toBeUndefined();
    expect(result.active).toBeUndefined();
  });

  it("rejects invalid fundType if provided", () => {
    expect(() => updateAccountInput.parse({ fundType: "invalid" })).toThrow(
      ZodError,
    );
  });

  it("rejects empty name if provided", () => {
    expect(() => updateAccountInput.parse({ name: "" })).toThrow(ZodError);
  });

  it("parses full valid update", () => {
    const result = updateAccountInput.parse({
      code: "1001",
      name: "Updated Name",
      accountType: "asset",
      fundType: "reserve",
      active: true,
      parentAccountId: null,
    });
    expect(result.fundType).toBe("reserve");
    expect(result.active).toBe(true);
    expect(result.parentAccountId).toBeNull();
  });
});
