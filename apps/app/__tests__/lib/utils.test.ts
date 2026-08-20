import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges classes correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes with falsy values (clsx)", () => {
    const show = false;
    expect(cn("foo", show && "bar", "baz")).toBe("foo baz");
    expect(cn({ foo: true, bar: false })).toBe("foo");
  });

  it("handles conditional classes with truthy values (clsx)", () => {
    const show = true;
    expect(cn("foo", show && "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting Tailwind utilities via tailwind-merge", () => {
    expect(cn("px-4 py-2", "px-6")).toBe("py-2 px-6");
  });

  it("handles empty inputs", () => {
    expect(cn()).toBe("");
  });

  it("handles undefined and null values", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });

  it("handles arrays of classes", () => {
    expect(cn(["foo", "bar"], "baz")).toBe("foo bar baz");
  });
});
