import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-assertion tests for the auth-entry polish pass (login, signup, setup,
 * forgot-password, reset-password). These route files are excluded from the
 * coverage gate, so behaviour is locked in by asserting on the source text.
 * `normalize()` collapses whitespace so Prettier re-wrapping never breaks a match.
 */
function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), "src/routes", relPath), "utf8");
}

function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("auth-entry loading labels use the unicode ellipsis", () => {
  it("login no longer uses an ASCII three-dot loading label", () => {
    const source = read("login.tsx");
    expect(source).toContain("Opening dashboard…");
    expect(source).not.toContain("Opening dashboard...");
  });

  it("setup loading labels all use the unicode ellipsis", () => {
    const source = read("setup.tsx");
    expect(source).toContain("Saving…");
    expect(source).toContain("Sending…");
    expect(source).toContain("Importing…");
    expect(source).not.toContain("Saving...");
    expect(source).not.toContain("Sending...");
    expect(source).not.toContain("Importing...");
  });
});

describe("setup invite email input has an autocomplete hint", () => {
  it("the member email input carries autoComplete=email", () => {
    const source = normalize(read("setup.tsx"));
    expect(source).toContain(
      'type="email" autoComplete="email" placeholder="member@example.com"',
    );
  });
});

describe("forgot-password polish", () => {
  it("renders the brand logo above the card", () => {
    const source = read("forgot-password.tsx");
    expect(source).toContain(
      'import { BrandLogo } from "@/components/brand-logo"',
    );
    expect(source).toContain("<BrandLogo");
  });

  it("uses a disabled pill button with a spinner instead of a rounded-md skeleton", () => {
    const source = normalize(read("forgot-password.tsx"));
    expect(source).toContain(
      '<Button type="submit" className="w-full" disabled={loading}>',
    );
    expect(source).toContain("Loader2");
    expect(read("forgot-password.tsx")).not.toContain("Skeleton");
  });
});

describe("reset-password polish", () => {
  it("renders the brand logo above the card", () => {
    const source = read("reset-password.tsx");
    expect(source).toContain(
      'import { BrandLogo } from "@/components/brand-logo"',
    );
    expect(source).toContain("<BrandLogo");
  });

  it("shows a success confirmation instead of silently navigating away", () => {
    const source = normalize(read("reset-password.tsx"));
    expect(source).toContain(
      "We saved your new password. Sign in to continue.",
    );
    expect(read("reset-password.tsx")).not.toContain("useNavigate");
  });

  it("password visibility toggle exposes aria-pressed", () => {
    const source = read("reset-password.tsx");
    expect(source).toContain("aria-pressed={showPassword}");
  });

  it("invalid-token message is wrapped in a destructive Alert", () => {
    const source = normalize(read("reset-password.tsx"));
    expect(source).toContain(
      '<Alert variant="destructive"> <AlertDescription> This reset link is invalid or has expired.',
    );
  });

  it("uses a disabled pill button with a spinner instead of a rounded-md skeleton", () => {
    const source = normalize(read("reset-password.tsx"));
    expect(source).toContain(
      '<Button type="submit" className="w-full" disabled={loading}>',
    );
    expect(read("reset-password.tsx")).not.toContain("Skeleton");
  });
});
