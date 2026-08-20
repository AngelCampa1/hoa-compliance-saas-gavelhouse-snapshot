import { describe, it, expect } from "vitest";
import {
  formatCents,
  formatStatementAmount,
  centsToDecimal,
} from "@/lib/money";

describe("formatCents", () => {
  it("formats small positive amount", () => {
    expect(formatCents(1234)).toBe("$12.34");
  });

  it("formats small negative amount", () => {
    expect(formatCents(-1234)).toBe("-$12.34");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("$0.00");
  });

  it("formats large positive amount with grouping", () => {
    expect(formatCents(100000)).toBe("$1,000.00");
  });

  it("formats large negative amount with grouping", () => {
    expect(formatCents(-100000)).toBe("-$1,000.00");
  });

  it("formats 125000 cents with grouping", () => {
    expect(formatCents(125000)).toBe("$1,250.00");
  });

  it("formats 150000 cents with grouping", () => {
    expect(formatCents(150000)).toBe("$1,500.00");
  });
});

describe("formatStatementAmount", () => {
  it("formats positive amount with + prefix", () => {
    expect(formatStatementAmount(1234)).toBe("+$12.34");
  });

  it("formats negative amount with - prefix", () => {
    expect(formatStatementAmount(-1234)).toBe("-$12.34");
  });

  it("formats zero as positive", () => {
    expect(formatStatementAmount(0)).toBe("+$0.00");
  });

  it("formats large positive amount with grouping", () => {
    expect(formatStatementAmount(100000)).toBe("+$1,000.00");
  });

  it("formats large negative amount with grouping", () => {
    expect(formatStatementAmount(-100000)).toBe("-$1,000.00");
  });
});

describe("centsToDecimal", () => {
  it("formats 1000 cents as grouped decimal", () => {
    expect(centsToDecimal(100000)).toBe("1,000.00");
  });

  it("formats negative cents with leading minus and grouping", () => {
    expect(centsToDecimal(-1234)).toBe("-12.34");
  });

  it("formats zero as 0.00", () => {
    expect(centsToDecimal(0)).toBe("0.00");
  });

  it("formats small cents without grouping", () => {
    expect(centsToDecimal(1234)).toBe("12.34");
  });
});
