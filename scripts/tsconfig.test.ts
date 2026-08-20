import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("scripts tsconfig", () => {
  it("typechecks every root TypeScript script entrypoint and test", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "scripts/tsconfig.json"), "utf8"),
    ) as { include?: string[] };

    expect(config.include).toContain("*.ts");
    expect(config.include).toContain("lib/**/*.ts");
  });
});
