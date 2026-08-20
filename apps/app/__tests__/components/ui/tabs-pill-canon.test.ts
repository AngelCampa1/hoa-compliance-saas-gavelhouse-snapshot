import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const tabsPath = path.resolve(__dirname, "../../../src/components/ui/tabs.tsx");

describe("tabs pill canon (G1)", () => {
  it("TabsList className uses rounded-full", () => {
    const src = fs.readFileSync(tabsPath, "utf8");
    // TabsList forwardRef block — assert pill present
    expect(src).toContain("rounded-full");
  });

  it("TabsList className does NOT use rounded-lg", () => {
    const src = fs.readFileSync(tabsPath, "utf8");
    expect(src).not.toContain("rounded-lg");
  });

  it("TabsTrigger className does NOT use rounded-md", () => {
    const src = fs.readFileSync(tabsPath, "utf8");
    expect(src).not.toContain("rounded-md");
  });
});
