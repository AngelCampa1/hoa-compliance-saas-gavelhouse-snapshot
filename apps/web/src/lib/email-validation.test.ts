import { describe, it, expect } from "vitest";
import { EMAIL_REGEX } from "./email-validation";

describe("EMAIL_REGEX", () => {
  // ── valid emails ─────────────────────────────────────────────
  it('accepts "user@example.com" -- standard valid email', () => {
    expect(EMAIL_REGEX.test("user@example.com")).toBe(true);
  });

  it('accepts "a@b.com" -- minimal valid email', () => {
    expect(EMAIL_REGEX.test("a@b.com")).toBe(true);
  });

  it('accepts "user+tag@example.com" -- plus sign in local part', () => {
    expect(EMAIL_REGEX.test("user+tag@example.com")).toBe(true);
  });

  it('accepts "user_name@example.com" -- underscore in local part', () => {
    expect(EMAIL_REGEX.test("user_name@example.com")).toBe(true);
  });

  it('accepts "user@my-company.io" -- hyphenated domain', () => {
    expect(EMAIL_REGEX.test("user@my-company.io")).toBe(true);
  });

  it('accepts "user@sub.example.com" -- subdomain', () => {
    expect(EMAIL_REGEX.test("user@sub.example.com")).toBe(true);
  });

  it('accepts "user.name@example.com" -- dot in local part', () => {
    expect(EMAIL_REGEX.test("user.name@example.com")).toBe(true);
  });

  it('accepts "user@example.co.uk" -- multi-part TLD', () => {
    expect(EMAIL_REGEX.test("user@example.co.uk")).toBe(true);
  });

  it('accepts "user%work@example.com" -- percent in local part', () => {
    expect(EMAIL_REGEX.test("user%work@example.com")).toBe(true);
  });

  // ── invalid: missing @ or domain ─────────────────────────────
  it('rejects "plainaddress" -- no @ symbol', () => {
    expect(EMAIL_REGEX.test("plainaddress")).toBe(false);
  });

  it('rejects "@." -- nothing before @ and dot immediately after', () => {
    expect(EMAIL_REGEX.test("@.")).toBe(false);
  });

  it('rejects "@.com" -- nothing before @', () => {
    expect(EMAIL_REGEX.test("@.com")).toBe(false);
  });

  it('rejects "user@" -- no dot after @', () => {
    expect(EMAIL_REGEX.test("user@")).toBe(false);
  });

  it('rejects "user@.com" -- dot immediately after @', () => {
    expect(EMAIL_REGEX.test("user@.com")).toBe(false);
  });

  it('rejects "user@@example.com" -- double @', () => {
    expect(EMAIL_REGEX.test("user@@example.com")).toBe(false);
  });

  // ── invalid: local part structure ────────────────────────────
  it('rejects "user..name@example.com" -- double dots in local part', () => {
    expect(EMAIL_REGEX.test("user..name@example.com")).toBe(false);
  });

  it('rejects ".user@example.com" -- leading dot in local part', () => {
    expect(EMAIL_REGEX.test(".user@example.com")).toBe(false);
  });

  it('rejects "user.@example.com" -- trailing dot in local part', () => {
    expect(EMAIL_REGEX.test("user.@example.com")).toBe(false);
  });

  // ── invalid: domain structure ─────────────────────────────────
  it('rejects "user@-example.com" -- leading hyphen in domain label', () => {
    expect(EMAIL_REGEX.test("user@-example.com")).toBe(false);
  });

  it('rejects "user@example-.com" -- trailing hyphen in domain label', () => {
    expect(EMAIL_REGEX.test("user@example-.com")).toBe(false);
  });

  // ── invalid: TLD constraints ──────────────────────────────────
  it('rejects "a@b.c" -- single-character TLD (requires 2+ alpha chars)', () => {
    expect(EMAIL_REGEX.test("a@b.c")).toBe(false);
  });

  it('rejects "user@example.c" -- single-char TLD', () => {
    expect(EMAIL_REGEX.test("user@example.c")).toBe(false);
  });

  it('rejects "user@example.123" -- digits-only TLD', () => {
    expect(EMAIL_REGEX.test("user@example.123")).toBe(false);
  });
});
