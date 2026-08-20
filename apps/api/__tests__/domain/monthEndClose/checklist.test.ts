import { describe, it, expect } from "vitest";
import {
  buildChecklistItems,
  allCompleted,
} from "../../../src/domain/monthEndClose/checklist.js";
import { CLOSE_STEPS } from "@boardstack/shared";

describe("buildChecklistItems", () => {
  it("returns exactly 5 items — one per CLOSE_STEP", () => {
    const items = buildChecklistItems("close-1", "comm-1");
    expect(items).toHaveLength(5);
  });

  it("includes all CLOSE_STEPS in the returned items", () => {
    const items = buildChecklistItems("close-1", "comm-1");
    const steps = items.map((i) => i.step);
    for (const step of CLOSE_STEPS) {
      expect(steps).toContain(step);
    }
  });

  it("sets closeId and communityId on all items", () => {
    const items = buildChecklistItems("close-abc", "comm-xyz");
    for (const item of items) {
      expect(item.closeId).toBe("close-abc");
      expect(item.communityId).toBe("comm-xyz");
    }
  });

  it("initialises all items as not completed", () => {
    const items = buildChecklistItems("close-1", "comm-1");
    for (const item of items) {
      expect(item.completed).toBe(false);
      expect(item.completedAt).toBeNull();
      expect(item.completedByUserId).toBeNull();
    }
  });

  it("generates a unique id for each item", () => {
    const items = buildChecklistItems("close-1", "comm-1");
    const ids = items.map((i) => i.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(5);
  });
});

describe("allCompleted", () => {
  it("returns true when every item is completed", () => {
    const items = [
      { completed: true },
      { completed: true },
      { completed: true },
    ];
    expect(allCompleted(items)).toBe(true);
  });

  it("returns false when at least one item is not completed", () => {
    const items = [
      { completed: true },
      { completed: false },
      { completed: true },
    ];
    expect(allCompleted(items)).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(allCompleted([])).toBe(false);
  });

  it("returns false when all items are not completed", () => {
    const items = [{ completed: false }, { completed: false }];
    expect(allCompleted(items)).toBe(false);
  });
});
