import { describe, it, expect } from "vitest";
import { buildBreadcrumbs } from "@/lib/breadcrumb-config";

describe("buildBreadcrumbs", () => {
  it("returns empty array for unknown route", () => {
    expect(buildBreadcrumbs("/unknown")).toEqual([]);
  });

  it("returns single item for top-level route", () => {
    const items = buildBreadcrumbs("/dashboard");
    expect(items).toEqual([{ label: "Dashboard", href:"/dashboard" }]);
  });

  it("returns parent + child for nested route", () => {
    const items = buildBreadcrumbs("/finance/journal");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ label: "Finance", href:"/finance" });
    expect(items[1]).toEqual({ label: "Journal", href:"/finance/journal" });
  });

  it("returns parent + child for governance nested route", () => {
    const items = buildBreadcrumbs("/governance/violations");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ label: "Governance", href:"/governance" });
    expect(items[1]).toEqual({
      label: "Violations",
      href:"/governance/violations",
    });
  });

  it("returns single item for reports root", () => {
    const items = buildBreadcrumbs("/reports");
    expect(items).toEqual([{ label: "Reports", href:"/reports" }]);
  });

  it("returns parent + child for reports sub-route", () => {
    const items = buildBreadcrumbs("/reports/balance-sheet");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ label: "Reports", href:"/reports" });
    expect(items[1]).toEqual({
      label: "Balance Sheet",
      href:"/reports/balance-sheet",
    });
  });

  it("returns single item for finance/accounts (parent exists but is separate entry)", () => {
    const items = buildBreadcrumbs("/finance/accounts");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ label: "Finance", href:"/finance" });
    expect(items[1]).toEqual({
      label: "Chart of Accounts",
      href:"/finance/accounts",
    });
  });

  it("returns single item for billing (top-level, no parent section)", () => {
    const items = buildBreadcrumbs("/billing");
    expect(items).toEqual([{ label: "Billing", href:"/billing" }]);
  });

  it("returns single item for nested route whose parent is not in labels", () => {
    // Exercise the parentLabel === undefined branch using a custom labels map
    const customLabels = {"/orphan/page": "Orphan Page" };
    const items = buildBreadcrumbs("/orphan/page", customLabels);
    expect(items).toEqual([{ label: "Orphan Page", href:"/orphan/page" }]);
  });
});
