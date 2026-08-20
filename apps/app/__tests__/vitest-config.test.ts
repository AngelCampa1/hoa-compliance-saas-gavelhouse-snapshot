import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const configText = readFileSync(join(__dirname, "../vitest.config.ts"), "utf8");

describe("vitest config", () => {
  it("runs test files in parallel with multiple workers", () => {
    expect(configText).toContain("fileParallelism: true");
    expect(configText).toContain("maxWorkers: 4");
  });
});
