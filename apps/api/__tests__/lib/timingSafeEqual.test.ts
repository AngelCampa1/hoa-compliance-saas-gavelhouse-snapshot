import { describe, it, expect } from "vitest";
import { timingSafeEqual } from "../../src/lib/timingSafeEqual.js";

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("returns false for strings that differ in content", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });

  it("returns false when left is longer than right", () => {
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
  });

  it("returns false when right is longer than left", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("returns false for completely different strings of same length", () => {
    expect(timingSafeEqual("aaa", "bbb")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(timingSafeEqual("", "x")).toBe(false);
    expect(timingSafeEqual("x", "")).toBe(false);
  });

  it("works correctly for hex-length token strings", () => {
    const hex64 = "a".repeat(64);
    expect(timingSafeEqual(hex64, hex64)).toBe(true);
    expect(timingSafeEqual(hex64, "b".repeat(64))).toBe(false);
  });

  it("rejects a value that is a strict prefix of the other (length diff, not content)", () => {
    // The two strings share every overlapping character, so equality must be
    // decided by the length guard alone — not by charCodeAt coercion on the
    // out-of-range indices of the shorter string.
    expect(timingSafeEqual("abcdef", "abc")).toBe(false);
    expect(timingSafeEqual("abc", "abcdef")).toBe(false);
    expect(timingSafeEqual("a".repeat(64), "a".repeat(63))).toBe(false);
  });
});
