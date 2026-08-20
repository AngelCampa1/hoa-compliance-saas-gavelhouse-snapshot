import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const redirects = readFileSync(
  resolve(process.cwd(), "public", "_redirects"),
  "utf8",
);
const middleware = readFileSync(
  resolve(process.cwd(), "src", "middleware.ts"),
  "utf8",
);
const wranglerConfig = readFileSync(
  resolve(process.cwd(), "wrangler.toml"),
  "utf8",
);
const worker = readFileSync(resolve(process.cwd(), "worker.ts"), "utf8");
const workerWrapper = readFileSync(
  resolve(process.cwd(), "src", "lib", "worker-wrapper.ts"),
  "utf8",
);

describe("marketing canonical redirects", () => {
  it("redirects the www hostname to the apex canonical host in middleware", () => {
    expect(middleware).toContain('url.hostname === "www.gavelhouse.app"');
    expect(middleware).toContain('url.hostname = "gavelhouse.app"');
    expect(middleware).toContain("context.redirect(url.toString(), 301)");
    expect(workerWrapper).toContain('url.hostname === "www.gavelhouse.app"');
    expect(workerWrapper).toContain('url.hostname = "gavelhouse.app"');
    expect(workerWrapper).toContain("Response.redirect(url.toString(), 301)");
    expect(worker).toContain('from "./dist/_worker.js/index.js"');
    expect(wranglerConfig).toContain('main = "worker.ts"');
    expect(wranglerConfig).toContain('binding = "ASSETS"');
    expect(wranglerConfig).toContain("run_worker_first = true");
    expect(wranglerConfig).toContain('pattern = "www.gavelhouse.app"');
    expect(wranglerConfig).toContain("custom_domain = true");
    expect(
      existsSync(resolve(process.cwd(), "src", "www-redirect-worker.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), "wrangler.www-redirect.toml")),
    ).toBe(false);
    expect(redirects).not.toContain("https://www.gavelhouse.app/*");
  });

  it("301-redirects the retired boardstack.app domain to the gavelhouse.app canonical host", () => {
    // boardstack.app is routed through the Worker only to redirect it. It must
    // resolve to the gavelhouse.app apex host and must never be served (mirror).
    expect(middleware).toContain('url.hostname === "boardstack.app"');
    expect(middleware).toContain('url.hostname === "www.boardstack.app"');
    expect(workerWrapper).toContain('url.hostname === "boardstack.app"');
    expect(workerWrapper).toContain('url.hostname === "www.boardstack.app"');
    expect(wranglerConfig).toContain('pattern = "boardstack.app/*"');
    expect(wranglerConfig).toContain('pattern = "www.boardstack.app/*"');
    expect(wranglerConfig).toContain('zone_name = "boardstack.app"');
  });

  it("redirects duplicate-slash URLs found during the SEO audit", () => {
    expect(redirects).toContain(
      "/resources/guides/hoa-board-liability-guide// /resources/guides/hoa-board-liability-guide/ 301",
    );
    expect(redirects).toContain(
      "/free/reserve-compliance-checklist// /free/reserve-compliance-checklist/ 301",
    );
    expect(redirects).not.toContain("//pricing/ /pricing/ 301");
  });
});
