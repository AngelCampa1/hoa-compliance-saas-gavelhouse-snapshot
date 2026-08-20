import { describe, it, expect } from "vitest";
import {
  TRANSITION_ROLES,
  buildTransitionChecklist,
} from "../../../src/domain/governance/boardTransition.js";

describe("TRANSITION_ROLES", () => {
  it("includes treasurer", () =>
    expect(TRANSITION_ROLES).toContain("treasurer"));
  it("includes secretary", () =>
    expect(TRANSITION_ROLES).toContain("secretary"));
  it("includes owner", () => expect(TRANSITION_ROLES).toContain("owner"));
});

describe("buildTransitionChecklist", () => {
  it("returns non-empty list for treasurer", () => {
    const items = buildTransitionChecklist("treasurer");
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.toLowerCase().includes("bank"))).toBe(true);
  });
  it("returns non-empty list for secretary", () => {
    const items = buildTransitionChecklist("secretary");
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.some(
        (i) =>
          i.toLowerCase().includes("minutes") ||
          i.toLowerCase().includes("record"),
      ),
    ).toBe(true);
  });
  it("returns non-empty list for owner", () => {
    const items = buildTransitionChecklist("owner");
    expect(items.length).toBeGreaterThan(0);
  });
  it("returns empty list for non-transition roles", () => {
    expect(buildTransitionChecklist("viewer")).toHaveLength(0);
    expect(buildTransitionChecklist("admin")).toHaveLength(0);
  });
});
