import { describe, expect, it } from "vitest";
import config from "./vitest.config";

type CoverageConfig = {
  include?: string[];
};

describe("scripts Vitest coverage config", () => {
  it("covers every TypeScript script library module, not only deploy helpers", () => {
    const coverage = config.test?.coverage as CoverageConfig | undefined;

    expect(coverage?.include).toContain("scripts/lib/**/*.ts");
    expect(coverage?.include).not.toContain("scripts/**/*.test.ts");
  });
});
