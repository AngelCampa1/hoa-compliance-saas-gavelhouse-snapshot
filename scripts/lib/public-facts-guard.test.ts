import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findPublicFactViolations,
  listTrackedTextFiles,
  scanPublicFactText,
} from "./public-facts-guard.js";

function execFixtureGit(cwd: string, args: string[]): void {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_WORK_TREE;
  execFileSync("git", args, { cwd, env });
}

describe("public facts guard", () => {
  it("allows canonical Gavelhouse pricing from shared facts", () => {
    const findings = scanPublicFactText(
      "apps/web/src/content/example.md",
      "Gavelhouse costs $10-$50/mo billed annually with Y80OFF.",
    );

    expect(findings).toEqual([]);
  });

  it("flags stale Gavelhouse pricing near the product name", () => {
    const findings = scanPublicFactText(
      "apps/web/src/content/example.md",
      "Gavelhouse starts at $20-$99/mo for volunteer boards.",
    );

    expect(findings[0]?.message).toContain("Stale public pricing");
  });

  it("flags retired public brand domains outside legacy redirect files", () => {
    const findings = scanPublicFactText(
      "apps/web/src/pages/example.astro",
      "Visit boardstack.app for pricing.",
    );

    expect(findings[0]?.message).toContain("Retired public brand");
  });

  it("allows legacy redirect tests to mention retired domains", () => {
    const findings = scanPublicFactText(
      "apps/web/src/lib/worker-wrapper.test.ts",
      'new Request("https://boardstack.app/pricing/")',
    );

    expect(findings).toEqual([]);
  });

  it("flags public URL literals in active source code", () => {
    const findings = scanPublicFactText(
      "apps/api/src/example.ts",
      'const url = "https://gavelhouse.app";',
    );

    expect(findings[0]?.message).toContain("should be imported");
  });

  it("allows the canonical shared trial duration", () => {
    const findings = scanPublicFactText(
      "apps/web/src/content/example.md",
      "Start a 30-day free trial with no credit card required.",
    );

    expect(findings).toEqual([]);
  });

  it("flags non-canonical trial duration wording", () => {
    const findings = scanPublicFactText(
      "apps/web/src/content/example.md",
      "Start your 1-month free trial.",
    );

    expect(findings[0]?.message).toContain("shared 30-day value");
  });

  it("flags retired list prices from old public pricing", () => {
    const findings = scanPublicFactText(
      "apps/web/src/content/example.md",
      "Legacy copy says $79/mo billed annually.",
    );

    expect(findings[0]?.message).toContain("Stale trial");
  });

  it("flags stale public pricing on a neighboring Gavelhouse line", () => {
    const findings = scanPublicFactText(
      "apps/web/scripts/example.ts",
      `rows: [
        ["Pricing", "Competitor", "Gavelhouse"],
        ["Entry price", "$49/mo", "$20-$99/mo"],
      ];`,
    );

    expect(findings[0]?.message).toContain("Stale public pricing");
  });

  it("flags non-canonical Gavelhouse prices wrapped onto following lines", () => {
    const findings = scanPublicFactText(
      "apps/web/src/content/pricing-breakdowns/example.md",
      `How does pricing compare to Gavelhouse?
Gavelhouse charges about $10/mo billed annually with Y80OFF (up
to 50 homes), $79/mo (51-200 homes), or $149/mo (201-500 homes)
for self-managed volunteer boards.`,
    );

    expect(findings.map((finding) => finding.message)).toContain(
      'Non-canonical Gavelhouse price "$79/mo" should come from shared pricing helpers.',
    );
    expect(findings.map((finding) => finding.message)).toContain(
      'Non-canonical Gavelhouse price "$149/mo" should come from shared pricing helpers.',
    );
  });

  it("flags guarantee and limited-offer facts that drift from shared pricing", () => {
    const findings = scanPublicFactText(
      "apps/web/src/pages/example.astro",
      "Use Z90OFF yearly for 90% off your first year. New paid subscriptions include a 14-day money-back guarantee.",
    );

    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining("Money-back guarantee"),
      expect.stringContaining("Limited-offer percent"),
      expect.stringContaining("Unknown limited-offer code"),
    ]);
  });

  it("allows canonical guarantee and limited-offer facts", () => {
    const findings = scanPublicFactText(
      "apps/web/src/pages/example.astro",
      "Use Y80OFF yearly or M80OFF monthly for 80% off your first year. New paid subscriptions include a 30-day money-back guarantee.",
    );

    expect(findings).toEqual([]);
  });

  it("ignores competitor prices before the product name", () => {
    const findings = scanPublicFactText(
      "apps/web/src/content/example.md",
      "PayHOA starts at $49/mo. Gavelhouse starts at about $10/mo billed annually with Y80OFF.",
    );

    expect(findings).toEqual([]);
  });

  it("ignores comparison math after a canonical product price", () => {
    const findings = scanPublicFactText(
      "apps/web/src/content/example.md",
      "Gavelhouse's Growth tier is about $27/mo billed annually with Y80OFF. The cost delta at 150 homes is $401/mo.",
    );

    expect(findings).toEqual([]);
  });

  it("allows public literals in comments, tests, markdown, and shared knowledge", () => {
    expect(
      scanPublicFactText(
        "apps/web/src/example.ts",
        "// Example: https://gavelhouse.app",
      ),
    ).toEqual([]);
    expect(
      scanPublicFactText(
        "apps/web/src/example.test.ts",
        'expect(url).toBe("https://gavelhouse.app");',
      ),
    ).toEqual([]);
    expect(
      scanPublicFactText("docs/example.md", "https://gavelhouse.app"),
    ).toEqual([]);
    expect(
      scanPublicFactText(
        "packages/shared/src/knowledge/example.ts",
        'const url = "https://gavelhouse.app";',
      ),
    ).toEqual([]);
    expect(
      scanPublicFactText(
        "packages/shared/__tests__/example.ts",
        'const url = "https://gavelhouse.app";',
      ),
    ).toEqual([]);
  });

  it("allows legacy redirect and internal boardstack references", () => {
    expect(
      scanPublicFactText(
        "apps/web/src/lib/public-runtime-urls.ts",
        'hostname === "boardstack.app" || origin === "https://gavelhouse.app"',
      ),
    ).toEqual([]);
    expect(
      scanPublicFactText(
        "apps/api/src/types/env.ts",
        "wrangler secret put AI_CS_WORKER_ORIGIN --name boardstack-api",
      ),
    ).toEqual([]);
  });

  it("exempts the source repository URL under the current account only", () => {
    // "BoardStack" is the retired public brand, but it is also the repository
    // name, so a line naming the repo URL under the current public account
    // must not trip the retired-brand check.
    expect(
      scanPublicFactText(
        "apps/web/src/content/example.md",
        "BoardStack now lives at https://github.com/AngelCampa1/boardstack",
      ),
    ).toEqual([]);

    // Guards the test above against passing vacuously, and confirms the guard
    // still flags the same URL shape under any other account — including a
    // placeholder standing in for a former or private org name, which must
    // never get a free pass just because the repo name matches.
    for (const account of ["someone-else", "PriorOrgName"]) {
      expect(
        scanPublicFactText(
          "apps/web/src/content/example.md",
          `BoardStack now lives at https://github.com/${account}/boardstack`,
        ),
      ).not.toEqual([]);
    }
  });

  it("lists tracked text files and skips excluded paths", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "public-facts-guard-"));
    execFixtureGit(cwd, ["init"]);
    execFixtureGit(cwd, ["config", "user.email", "test@example.com"]);
    execFixtureGit(cwd, ["config", "user.name", "Test"]);
    mkdirSync(path.join(cwd, "apps/web/src/pages"), { recursive: true });
    mkdirSync(path.join(cwd, "apps/web/src/pages/__tests__"), {
      recursive: true,
    });
    writeFileSync(
      path.join(cwd, "apps/web/src/pages/index.astro"),
      "Visit boardstack.app.",
    );
    writeFileSync(path.join(cwd, "deleted.md"), "Gavelhouse is $20/mo.");
    writeFileSync(
      path.join(cwd, "apps/web/src/pages/__tests__/index.test.ts"),
      "Visit boardstack.app.",
    );
    execFixtureGit(cwd, ["add", "."]);
    execFixtureGit(cwd, ["commit", "-m", "fixtures"]);
    unlinkSync(path.join(cwd, "deleted.md"));

    const files = listTrackedTextFiles(cwd);
    const findings = findPublicFactViolations(cwd);

    expect(files).toEqual(["apps/web/src/pages/index.astro"]);
    expect(findings[0]?.message).toContain("Retired public brand");
  });
});
