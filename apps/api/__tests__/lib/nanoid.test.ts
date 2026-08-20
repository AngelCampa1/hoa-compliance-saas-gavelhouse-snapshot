import { describe, it, expect } from "vitest";
import { nanoid } from "../../src/lib/nanoid.js";

describe("nanoid", () => {
  it("returns a string", () => {
    expect(typeof nanoid()).toBe("string");
  });

  it("returns default length of 21", () => {
    expect(nanoid()).toHaveLength(21);
  });

  it("returns specified length", () => {
    expect(nanoid(32)).toHaveLength(32);
    expect(nanoid(8)).toHaveLength(8);
  });

  it("returns unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => nanoid()));
    expect(ids.size).toBe(100);
  });

  it("uses only alphanumeric characters", () => {
    const id = nanoid(100);
    expect(id).toMatch(/^[0-9A-Za-z]+$/);
  });
});
