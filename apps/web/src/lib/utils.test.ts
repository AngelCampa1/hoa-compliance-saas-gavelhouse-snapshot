import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges multiple class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("filters falsy values", () => {
    expect(cn("foo", undefined, null, undefined, "baz")).toBe("foo baz");
  });

  it("resolves Tailwind conflicts via twMerge", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("returns empty string for no args", () => {
    expect(cn()).toBe("");
  });
});
