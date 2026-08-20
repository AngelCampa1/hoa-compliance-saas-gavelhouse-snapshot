import { describe, expect, it } from "vitest";
import { buildLeadMagnetBreadcrumbs } from "./lead-magnet-breadcrumbs";

describe("buildLeadMagnetBreadcrumbs", () => {
  it("omits the hub crumb when no lead magnet hub exists", () => {
    expect(
      buildLeadMagnetBreadcrumbs({
        title: "Wedding budget spreadsheet",
        canonicalPath:"/free/wedding-budget-spreadsheet",
      }),
    ).toEqual([
      { label: "Home", href:"/" },
      {
        label: "Wedding budget spreadsheet",
        href:"/free/wedding-budget-spreadsheet",
      },
    ]);
  });

  it("includes the configured hub crumb when a real hub route exists", () => {
    expect(
      buildLeadMagnetBreadcrumbs({
        title: "Wedding budget spreadsheet",
        canonicalPath:"/free/wedding-budget-spreadsheet",
        hubLabel: "Free",
        hubHref:"/free/",
      }),
    ).toEqual([
      { label: "Home", href:"/" },
      { label: "Free", href:"/free/" },
      {
        label: "Wedding budget spreadsheet",
        href:"/free/wedding-budget-spreadsheet",
      },
    ]);
  });

  it("ignores incomplete hub config so components cannot emit broken links", () => {
    expect(
      buildLeadMagnetBreadcrumbs({
        title: "Wedding budget spreadsheet",
        canonicalPath:"/free/wedding-budget-spreadsheet",
        hubLabel: "Free",
      }),
    ).toEqual([
      { label: "Home", href:"/" },
      {
        label: "Wedding budget spreadsheet",
        href:"/free/wedding-budget-spreadsheet",
      },
    ]);
  });
});
