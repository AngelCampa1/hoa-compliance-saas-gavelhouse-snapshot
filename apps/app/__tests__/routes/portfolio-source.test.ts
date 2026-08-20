import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("portfolio route source", () => {
  it("updates the portfolio list cache immediately after create", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_app.portfolio.index.tsx"),
      "utf8",
    );

    expect(source).toContain("queryClient.setQueryData");
    expect(source).toContain('["portfolios"]');
    expect(source).toContain("result.portfolioId");
    expect(source).toContain("result.name ?? portfolioName");
    expect(source).toContain("void queryClient.invalidateQueries");
  });

  it("wires community membership controls to portfolio link APIs", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_app.portfolio.index.tsx"),
      "utf8",
    );

    expect(source).toContain("api.communities.list");
    expect(source).toContain("api.portfolio.linkCommunity");
    expect(source).toContain("api.portfolio.unlinkCommunity");
    expect(source).toContain("rollupData?.communities ?? []");
    expect(source).toContain('queryKey: ["communities"]');
    expect(source).not.toContain("window.alert");
  });

  it("gates the page behind the Portfolio-tier upgrade gate like other gated features", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/_app.portfolio.index.tsx"),
      "utf8",
    );

    // Portfolio rollups are a Portfolio-tier feature. Wrapping the page in the
    // shared TierUpgradeGate gives sub-Portfolio users the same tasteful upsell
    // every other gated feature shows, instead of letting them submit and hit a
    // raw "upgrade_required" API error toast.
    expect(source).toContain("TierUpgradeGate");
    expect(source).toContain('feature="portfolio-rollups"');
  });
});
