/**
 * Stress / fuzz tests for monthEndClose/checklist domain module.
 * Uses a hand-rolled mulberry32 PRNG — no extra npm deps.
 */

import { describe, it, expect } from "vitest";
import {
  buildChecklistItems,
  allCompleted,
} from "../../src/domain/monthEndClose/checklist.js";
import { CLOSE_STEPS } from "@boardstack/shared";

// ---------------------------------------------------------------------------
// Mulberry32 PRNG
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// buildChecklistItems stress tests
// ---------------------------------------------------------------------------

describe("buildChecklistItems – stress invariants", () => {
  /**
   * Invariant A: item count always equals CLOSE_STEPS.length regardless of
   * the closeId / communityId strings passed.
   */
  it("A – item count always equals CLOSE_STEPS.length for any id pair", () => {
    const idPairs = [
      ["", ""],
      ["close-1", "comm-1"],
      ["a".repeat(1000), "b".repeat(1000)],
      ["0", "0"],
      ["null", "undefined"],
      ["__proto__", "constructor"],
      [" ", "\t"],
    ];
    for (const [closeId, communityId] of idPairs) {
      const items = buildChecklistItems(closeId!, communityId!);
      expect(items).toHaveLength(CLOSE_STEPS.length);
    }
  });

  /**
   * Invariant B: every CLOSE_STEP appears exactly once per call.
   */
  it("B – each CLOSE_STEP appears exactly once in every build", () => {
    const rng = mulberry32(0xaabbccdd);
    for (let trial = 0; trial < 200; trial++) {
      const closeId = `close-${Math.floor(rng() * 1e9)}`;
      const communityId = `comm-${Math.floor(rng() * 1e9)}`;
      const items = buildChecklistItems(closeId, communityId);
      const stepCounts = new Map<string, number>();
      for (const item of items) {
        stepCounts.set(item.step, (stepCounts.get(item.step) ?? 0) + 1);
      }
      for (const step of CLOSE_STEPS) {
        expect(stepCounts.get(step)).toBe(1);
      }
    }
  });

  /**
   * Invariant C: all ids are unique across each build call.
   */
  it("C – all item ids are unique within each buildChecklistItems call", () => {
    for (let trial = 0; trial < 300; trial++) {
      const items = buildChecklistItems(`close-${trial}`, `comm-${trial}`);
      const ids = items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  /**
   * Invariant D: ids are also unique ACROSS separate calls (nanoid guarantee).
   */
  it("D – ids are unique across multiple independent buildChecklistItems calls", () => {
    const allIds: string[] = [];
    for (let trial = 0; trial < 100; trial++) {
      const items = buildChecklistItems(`close-${trial}`, "comm-1");
      allIds.push(...items.map((i) => i.id));
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  /**
   * Invariant E: all items initialise with completed=false, completedAt=null,
   * completedByUserId=null regardless of argument values.
   */
  it("E – all items are initialised as not completed regardless of ids", () => {
    const ids = ["", "x", "close-abc", "a".repeat(500)];
    for (const id of ids) {
      const items = buildChecklistItems(id, id);
      for (const item of items) {
        expect(item.completed).toBe(false);
        expect(item.completedAt).toBeNull();
        expect(item.completedByUserId).toBeNull();
      }
    }
  });

  /**
   * Invariant F: closeId and communityId are correctly threaded through to
   * every item for many random id pairs.
   */
  it("F – closeId and communityId propagate correctly to every item", () => {
    const rng = mulberry32(0x11223344);
    for (let trial = 0; trial < 500; trial++) {
      const closeId = `close-${Math.floor(rng() * 1e9)}`;
      const communityId = `comm-${Math.floor(rng() * 1e9)}`;
      const items = buildChecklistItems(closeId, communityId);
      for (const item of items) {
        expect(item.closeId).toBe(closeId);
        expect(item.communityId).toBe(communityId);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// allCompleted stress tests
// ---------------------------------------------------------------------------

describe("allCompleted – stress invariants", () => {
  const rng = mulberry32(0x55667788);

  /**
   * Invariant A: empty array always returns false.
   */
  it("A – empty array always returns false", () => {
    for (let i = 0; i < 100; i++) {
      expect(allCompleted([])).toBe(false);
    }
  });

  /**
   * Invariant B: all-true arrays always return true.
   */
  it("B – arrays where every item.completed=true always return true", () => {
    for (let n = 1; n <= 50; n++) {
      const items = Array.from({ length: n }, () => ({ completed: true }));
      expect(allCompleted(items)).toBe(true);
    }
  });

  /**
   * Invariant C: any single false makes it false regardless of array length.
   */
  it("C – a single false item makes allCompleted return false regardless of position", () => {
    for (let n = 1; n <= 30; n++) {
      for (let falseAt = 0; falseAt < n; falseAt++) {
        const items = Array.from({ length: n }, (_, i) => ({
          completed: i !== falseAt,
        }));
        expect(allCompleted(items)).toBe(false);
      }
    }
  });

  /**
   * Invariant D: allCompleted result equals items.every(i => i.completed)
   * for randomised arrays of various sizes.
   */
  it("D – result matches items.every(i => i.completed) for all random inputs", () => {
    for (let trial = 0; trial < 2_000; trial++) {
      const n = Math.floor(rng() * 20);
      const items = Array.from({ length: n }, () => ({
        completed: rng() < 0.7,
      }));

      const expected = n > 0 && items.every((i) => i.completed);
      expect(allCompleted(items)).toBe(expected);
    }
  });

  /**
   * Invariant E: the function does not mutate the input array.
   */
  it("E – allCompleted does not mutate the input array", () => {
    const items = [{ completed: true }, { completed: false }, { completed: true }];
    const snapshot = items.map((i) => ({ ...i }));
    allCompleted(items);
    expect(items).toEqual(snapshot);
  });

  /**
   * Invariant F: large array (10 000 items) — all true returns true quickly;
   * one false at the end still returns false.
   */
  it("F – large arrays (10 000 items) compute correctly", () => {
    const allTrue = Array.from({ length: 10_000 }, () => ({ completed: true }));
    expect(allCompleted(allTrue)).toBe(true);

    const lastFalse = [...allTrue.slice(0, -1), { completed: false }];
    expect(allCompleted(lastFalse)).toBe(false);
  });

  /**
   * Invariant G: off-by-one — an array of exactly CLOSE_STEPS.length items
   * with one false returns false; all true returns true.
   */
  it("G – no off-by-one at CLOSE_STEPS.length boundary", () => {
    const n = CLOSE_STEPS.length;
    const allTrue = Array.from({ length: n }, () => ({ completed: true }));
    expect(allCompleted(allTrue)).toBe(true);

    for (let falseAt = 0; falseAt < n; falseAt++) {
      const withOneFalse = allTrue.map((item, i) =>
        i === falseAt ? { completed: false } : item,
      );
      expect(allCompleted(withOneFalse)).toBe(false);
    }
  });

  /**
   * Invariant H: allCompleted is consistent when called twice on the same input.
   */
  it("H – allCompleted is idempotent (same result on repeated calls)", () => {
    const rng2 = mulberry32(0x99aabb);
    for (let trial = 0; trial < 500; trial++) {
      const n = Math.floor(rng2() * 10) + 1;
      const items = Array.from({ length: n }, () => ({
        completed: rng2() < 0.5,
      }));
      expect(allCompleted(items)).toBe(allCompleted(items));
    }
  });
});
