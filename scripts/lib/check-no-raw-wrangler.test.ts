import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  loadPackages,
  scanPackageJsonsForRawWrangler,
  type LoadedPackage,
} from "./check-no-raw-wrangler";

function pkg(path: string, scripts: Record<string, string>): LoadedPackage {
  return { path, json: { scripts } };
}

describe("scanPackageJsonsForRawWrangler", () => {
  it("passes a clean repo", () => {
    const result = scanPackageJsonsForRawWrangler([
      pkg("package.json", {
        "deploy:web": "pnpm --filter @boardstack/web run deploy",
      }),
      pkg("apps/web/package.json", {
        deploy: "node ../../scripts/run-deploy-sequence.mjs web",
        "deploy:upload": "wrangler deploy",
      }),
      pkg("apps/app/package.json", {
        deploy: "node ../../scripts/run-deploy-sequence.mjs app",
        "deploy:upload": "wrangler deploy",
      }),
      pkg("apps/api/package.json", {
        deploy: "node ../../scripts/run-deploy-sequence.mjs api",
        "deploy:upload": "wrangler deploy",
      }),
    ]);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("flags a raw wrangler call in a non-allowlisted script", () => {
    const result = scanPackageJsonsForRawWrangler([
      pkg("apps/web/package.json", {
        deploy:
          "wrangler pages deploy dist --project-name boardstack-web --branch main",
        "deploy:upload": "wrangler pages deploy dist --branch master",
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0]).toContain("apps/web/package.json");
    expect(result.violations[0]).toContain("deploy");
    expect(result.violations[1]).toContain("unsafe wrangler target");
  });

  it("flags a raw wrangler call in a non-allowlisted package", () => {
    const result = scanPackageJsonsForRawWrangler([
      pkg("packages/shared/package.json", {
        publish: "wrangler deploy && echo shipped",
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toContain("packages/shared/package.json");
  });

  it("normalises Windows-style paths", () => {
    const result = scanPackageJsonsForRawWrangler([
      pkg("apps\\web\\package.json", {
        "deploy:upload": "wrangler deploy",
      }),
    ]);
    expect(result.ok).toBe(true);
  });

  it("flags allowlisted frontend deploy scripts that target Pages", () => {
    const result = scanPackageJsonsForRawWrangler([
      pkg("apps/web/package.json", {
        "deploy:upload":
          "wrangler pages deploy dist --project-name boardstack-web --branch master",
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toContain("unsafe wrangler target");
  });

  it("ignores packages without scripts", () => {
    const result = scanPackageJsonsForRawWrangler([
      { path: "pkg/empty/package.json", json: { name: "empty" } },
      { path: "pkg/bad/package.json", json: null },
      { path: "pkg/nulscripts/package.json", json: { scripts: null } },
      { path: "pkg/arrscripts/package.json", json: { scripts: { x: 1 } } },
    ]);
    expect(result.ok).toBe(true);
  });

  it("loadPackages reads real package.json files from disk", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bs-guard-"));
    try {
      const file = path.join(dir, "package.json");
      writeFileSync(
        file,
        JSON.stringify({ scripts: { build: "echo hi" } }),
        "utf8",
      );
      const loaded = loadPackages([file]);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].path).toBe(file);
      expect(loaded[0].json).toEqual({ scripts: { build: "echo hi" } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows wrangler deploy --dry-run in build scripts", () => {
    const result = scanPackageJsonsForRawWrangler([
      pkg("apps/api/package.json", {
        build: "wrangler deploy --dry-run --outdir dist",
      }),
    ]);
    expect(result.ok).toBe(true);
  });
});
