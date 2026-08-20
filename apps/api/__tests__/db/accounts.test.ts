import { describe, it, expect } from "vitest";
import {
  accounts,
  accountTypeEnum,
  fundTypeEnum,
} from "../../src/db/schema/accounts.js";

describe("accounts schema", () => {
  it("accounts table is defined", () => {
    expect(accounts).toBeDefined();
  });

  it("accounts table has id column", () => {
    expect(accounts.id).toBeDefined();
  });

  it("accounts table has communityId column", () => {
    expect(accounts.communityId).toBeDefined();
  });

  it("accounts table has code column", () => {
    expect(accounts.code).toBeDefined();
  });

  it("accounts table has name column", () => {
    expect(accounts.name).toBeDefined();
  });

  it("accounts table has accountType column", () => {
    expect(accounts.accountType).toBeDefined();
  });

  it("accounts table has fundType column — the moat", () => {
    expect(accounts.fundType).toBeDefined();
  });

  it("accounts table has parentAccountId column (self-referential)", () => {
    expect(accounts.parentAccountId).toBeDefined();
  });

  it("accounts table has active column", () => {
    expect(accounts.active).toBeDefined();
  });

  it("accounts table has createdAt column", () => {
    expect(accounts.createdAt).toBeDefined();
  });

  it("accounts table has updatedAt column", () => {
    expect(accounts.updatedAt).toBeDefined();
  });

  it("accountTypeEnum is defined", () => {
    expect(accountTypeEnum).toBeDefined();
  });

  it("fundTypeEnum is defined", () => {
    expect(fundTypeEnum).toBeDefined();
  });

  it("accountTypeEnum includes all expected values", () => {
    const enumDef = accountTypeEnum.enumValues;
    expect(enumDef).toContain("asset");
    expect(enumDef).toContain("liability");
    expect(enumDef).toContain("equity");
    expect(enumDef).toContain("revenue");
    expect(enumDef).toContain("expense");
  });

  it("fundTypeEnum includes operating and reserve", () => {
    const enumDef = fundTypeEnum.enumValues;
    expect(enumDef).toContain("operating");
    expect(enumDef).toContain("reserve");
  });

  it("fundTypeEnum has exactly 2 values", () => {
    expect(fundTypeEnum.enumValues.length).toBe(2);
  });
});
