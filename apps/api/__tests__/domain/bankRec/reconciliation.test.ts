import { describe, it, expect } from "vitest";
import { verifyBalance } from "../../../src/domain/bankRec/reconciliation.js";

describe("verifyBalance", () => {
  it("returns balanced=true when matched amount equals endingBalance - beginningBalance exactly", () => {
    const result = verifyBalance(50000, 100000, 150000);

    expect(result.balanced).toBe(true);
    expect(result.deltaCents).toBe(0);
  });

  it("returns balanced=true when delta is within 1 cent (positive)", () => {
    // matched=50001, expected difference=50000 → delta=1
    const result = verifyBalance(50001, 100000, 150000);

    expect(result.balanced).toBe(true);
    expect(result.deltaCents).toBe(1);
  });

  it("returns balanced=true when delta is within 1 cent (negative)", () => {
    // matched=49999, expected difference=50000 → delta=-1
    const result = verifyBalance(49999, 100000, 150000);

    expect(result.balanced).toBe(true);
    expect(result.deltaCents).toBe(-1);
  });

  it("returns balanced=false when delta is 2 cents", () => {
    // matched=50002, expected difference=50000 → delta=2
    const result = verifyBalance(50002, 100000, 150000);

    expect(result.balanced).toBe(false);
    expect(result.deltaCents).toBe(2);
  });

  it("returns balanced=false when matched is much larger than expected", () => {
    const result = verifyBalance(999999, 100000, 150000);

    expect(result.balanced).toBe(false);
    expect(result.deltaCents).toBe(949999);
  });

  it("handles negative net change (e.g., more withdrawals than deposits)", () => {
    // beginning=150000, ending=100000 → expected=-50000
    const result = verifyBalance(-50000, 150000, 100000);

    expect(result.balanced).toBe(true);
    expect(result.deltaCents).toBe(0);
  });

  it("handles zero change (beginning equals ending)", () => {
    const result = verifyBalance(0, 100000, 100000);

    expect(result.balanced).toBe(true);
    expect(result.deltaCents).toBe(0);
  });
});
