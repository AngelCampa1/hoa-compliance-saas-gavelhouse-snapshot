import { describe, it, expect, vi, beforeEach } from "vitest";

const { getCollectionMock } = vi.hoisted(() => {
  const getCollectionMock = vi.fn();
  return { getCollectionMock };
});
vi.mock("astro:content", () => ({ getCollection: getCollectionMock }));

import {
  resolveLeadMagnetBySlug,
  resolveMagnetForPage,
} from "./resolve-lead-magnet";
import { LEAD_MAGNET } from "@boardstack/shared";

beforeEach(() => {
  getCollectionMock.mockReset();
  getCollectionMock.mockResolvedValue([
    {
      slug: "hoa-budget-template",
      data: { title: "HOA Budget Template", description: "A budget template." },
    },
    {
      slug: "reserve-fund-calculator",
      data: {
        title: "Reserve Fund Calculator",
        description: "Calc your reserves.",
      },
    },
  ]);
});

describe("resolveLeadMagnetBySlug", () => {
  it("returns the collection entry as a LeadMagnet", async () => {
    const m = await resolveLeadMagnetBySlug("hoa-budget-template");
    expect(m).toEqual({
      slug: "hoa-budget-template",
      title: "HOA Budget Template",
      description: "A budget template.",
    });
  });

  it("falls back to the global default for an unknown/missing slug", async () => {
    const m = await resolveLeadMagnetBySlug("not-present");
    expect(m).toEqual(LEAD_MAGNET);
    const none = await resolveLeadMagnetBySlug(undefined);
    expect(none).toEqual(LEAD_MAGNET);
  });
});

describe("resolveMagnetForPage", () => {
  it("resolves via keyword mapping then collection copy", async () => {
    const m = await resolveMagnetForPage({
      primaryKeyword: "hoa reserve fund study",
    });
    expect(m.slug).toBe("reserve-fund-calculator");
    expect(m.title).toBe("Reserve Fund Calculator");
  });

  it("honors an explicit slug", async () => {
    const m = await resolveMagnetForPage({
      explicitSlug: "hoa-budget-template",
      primaryKeyword: "reserve",
    });
    expect(m.slug).toBe("hoa-budget-template");
  });
});
