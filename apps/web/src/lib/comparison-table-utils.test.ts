import { describe, it, expect } from "vitest";
import { buildComparisonTableCaption } from "./comparison-table-utils";

describe("buildComparisonTableCaption", () => {
  it("builds caption from multiple competitor columns", () => {
    const result = buildComparisonTableCaption([
      "Feature",
      "ServiceTitan",
      "Housecall Pro",
      "CrewRoute",
    ]);
    expect(result).toBe(
      "ServiceTitan vs Housecall Pro vs CrewRoute Comparison",
    );
  });

  it("builds caption from two competitor columns", () => {
    const result = buildComparisonTableCaption(["Feature", "A", "B"]);
    expect(result).toBe("A vs B Comparison");
  });

  it("builds caption from a single competitor column", () => {
    const result = buildComparisonTableCaption(["Feature", "A"]);
    expect(result).toBe("A Comparison");
  });

  it("returns fallback for empty headers array", () => {
    const result = buildComparisonTableCaption([]);
    expect(result).toBe("Comparison");
  });

  it("returns fallback when only the feature column is present", () => {
    const result = buildComparisonTableCaption(["Feature"]);
    expect(result).toBe("Comparison");
  });
});
