/**
 * Stress / fuzz tests for governance domain modules.
 * Uses a hand-rolled mulberry32 PRNG — no extra npm deps.
 */

import { describe, it, expect } from "vitest";
import {
  TRANSITION_ROLES,
  buildTransitionChecklist,
} from "../../src/domain/governance/boardTransition.js";
import {
  VALID_TRANSITIONS,
  isValidTransition,
} from "../../src/domain/governance/violationWorkflow.js";

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
// boardTransition stress tests
// ---------------------------------------------------------------------------

type ViolationStatus = "open" | "notified" | "cured" | "closed";
const ALL_STATES: ViolationStatus[] = ["open", "notified", "cured", "closed"];

describe("buildTransitionChecklist – stress invariants", () => {
  /**
   * Invariant A: known roles always return a non-empty array.
   */
  it("A – known roles always return non-empty checklists", () => {
    for (const role of TRANSITION_ROLES) {
      const a = buildTransitionChecklist(role);
      expect(a.length).toBeGreaterThan(0);
    }
  });

  /**
   * Invariant A2 (BUG): the result should be a fresh array each call — callers
   * must not be able to mutate the internal checklist constant via the returned ref.
   *
   * Source: apps/api/src/domain/governance/boardTransition.ts line 28
   *   return CHECKLISTS[role] ?? [];
   * This returns a direct reference to the shared internal CHECKLISTS array.
   * A caller who mutates the returned array mutates the module-level constant,
   * affecting all future calls.
   *
   * Reproducing input: buildTransitionChecklist("treasurer") twice.
   * Expected: a !== b (different array references, same content).
   * Actual: a === b (same reference — internal mutable constant exposed).
   */
  it(
    "A2 (BUG) – buildTransitionChecklist returns a fresh array each call (not a shared reference)",
    () => {
      for (const role of TRANSITION_ROLES) {
        const a = buildTransitionChecklist(role);
        const b = buildTransitionChecklist(role);
        expect(a).not.toBe(b);
      }
    },
  );

  /**
   * Invariant B: unknown / normal-looking role strings always return [].
   */
  it("B – unknown roles always return empty array", () => {
    const safeUnknownRoles = [
      "",
      " ",
      "TREASURER",
      "Treasurer",
      "OWNER",
      "Secretary",
      "admin",
      "viewer",
      "board_member",
      "treasurer ",
      " treasurer",
      "treasurer\n",
      "0",
      "null",
      "undefined",
    ];
    for (const role of safeUnknownRoles) {
      expect(buildTransitionChecklist(role)).toHaveLength(0);
    }
  });

  /**
   * Invariant B2 (BUG): prototype property names used as role strings must also
   * return [] — but CHECKLISTS[role] hits Object.prototype properties for keys
   * like "toString", "valueOf", "constructor", "hasOwnProperty", which are
   * truthy functions. The `?? []` guard only fires for null/undefined, not for
   * these inherited truthy values, so the function returns a Function (not an
   * array), breaking the return-type contract.
   *
   * Source: apps/api/src/domain/governance/boardTransition.ts line 28
   *   return CHECKLISTS[role] ?? [];
   * CHECKLISTS is a plain object, so CHECKLISTS["toString"] is the inherited
   * Object.prototype.toString function — truthy, so ?? [] is never reached.
   *
   * Reproducing input: buildTransitionChecklist("toString")
   * Expected: [] (empty array, length 0)
   * Actual: Object.prototype.toString (a Function with no .length === 0, but
   *         it is not an array — toHaveLength(0) asserts .length property which
   *         for a function is its arity, coincidentally 0, so the length check
   *         passes but the value is wrong type; "constructor" has .length=1,
   *         which makes toHaveLength(0) fail).
   */
  it(
    "B2 (BUG) – prototype-named role strings return [] (not inherited Object.prototype props)",
    () => {
      const protoRoles = ["__proto__", "constructor", "hasOwnProperty", "toString", "valueOf"];
      for (const role of protoRoles) {
        const result = buildTransitionChecklist(role);
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(0);
      }
    },
  );

  /**
   * Invariant C: checklist items are strings and none are empty.
   */
  it("C – all checklist items are non-empty strings for known roles", () => {
    for (const role of TRANSITION_ROLES) {
      const items = buildTransitionChecklist(role);
      for (const item of items) {
        expect(typeof item).toBe("string");
        expect(item.trim().length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * Invariant D: each role's checklist items are unique (no duplicates).
   */
  it("D – each role checklist has no duplicate items", () => {
    for (const role of TRANSITION_ROLES) {
      const items = buildTransitionChecklist(role);
      const unique = new Set(items);
      expect(unique.size).toBe(items.length);
    }
  });

  /**
   * Invariant E: calling many times with the same role always returns the
   * same set of items (deterministic / idempotent).
   */
  it("E – checklist is deterministic across repeated calls", () => {
    for (const role of TRANSITION_ROLES) {
      const first = buildTransitionChecklist(role);
      for (let i = 0; i < 100; i++) {
        const subsequent = buildTransitionChecklist(role);
        expect(subsequent).toEqual(first);
      }
    }
  });

  /**
   * Invariant F (BUG): mutating the returned array must not corrupt subsequent
   * calls. This is the observable consequence of bug A2 — the shared reference
   * means mutation is permanent.
   *
   * Source: apps/api/src/domain/governance/boardTransition.ts line 28
   * Reproducing input: push/overwrite items on the returned array, then call again.
   * Expected: fresh call returns the original unmodified checklist.
   * Actual: fresh call returns the mutated version (same reference).
   */
  it(
    "F (BUG) – mutating the returned checklist does not corrupt subsequent calls",
    () => {
      for (const role of TRANSITION_ROLES) {
        const original = buildTransitionChecklist(role);
        const originalCopy = [...original];

        const mutable = buildTransitionChecklist(role);
        mutable.push("INJECTED ITEM");
        mutable[0] = "OVERWRITTEN";

        const fresh = buildTransitionChecklist(role);
        expect(fresh).toEqual(originalCopy);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// violationWorkflow stress tests
// ---------------------------------------------------------------------------

describe("isValidTransition – stress invariants", () => {
  /**
   * Invariant A: self-transition is always rejected for every state.
   */
  it("A – self-transition is always false for all states", () => {
    for (const state of ALL_STATES) {
      expect(isValidTransition(state, state)).toBe(false);
    }
  });

  /**
   * Invariant B: isValidTransition(from, to) === VALID_TRANSITIONS[from].includes(to)
   * for all (from, to) state pairs, with from !== to.
   */
  it("B – result matches VALID_TRANSITIONS table for every state pair", () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        const expected =
          from !== to && VALID_TRANSITIONS[from].includes(to);
        expect(isValidTransition(from, to)).toBe(expected);
      }
    }
  });

  /**
   * Invariant C: 'closed' is a terminal state — no escape from closed.
   */
  it("C – closed is terminal: no transitions out of closed are valid", () => {
    for (const to of ALL_STATES) {
      expect(isValidTransition("closed", to)).toBe(false);
    }
  });

  /**
   * Invariant D: legal paths from 'open' include notified, cured, and closed
   * (all documented transitions).
   */
  it("D – open can transition to notified, cured, and closed", () => {
    expect(isValidTransition("open", "notified")).toBe(true);
    expect(isValidTransition("open", "cured")).toBe(true);
    expect(isValidTransition("open", "closed")).toBe(true);
  });

  /**
   * Invariant E: 'notified' cannot go back to 'open' (no regression allowed).
   */
  it("E – notified cannot transition back to open", () => {
    expect(isValidTransition("notified", "open")).toBe(false);
  });

  /**
   * Invariant F: 'cured' CAN reopen (documented in VALID_TRANSITIONS).
   */
  it("F – cured can transition to open (re-open path is legal)", () => {
    expect(isValidTransition("cured", "open")).toBe(true);
  });

  /**
   * Invariant G: symmetry is NOT required — verify asymmetry is preserved
   * for the documented asymmetric pairs.
   * (notified→open is invalid, but open→notified is valid)
   */
  it("G – transition table is correctly asymmetric", () => {
    expect(isValidTransition("open", "notified")).toBe(true);
    expect(isValidTransition("notified", "open")).toBe(false);

    expect(isValidTransition("open", "cured")).toBe(true);
    // cured→open is valid per the table, check it is exactly what the table says
    expect(isValidTransition("cured", "open")).toBe(
      VALID_TRANSITIONS["cured"].includes("open"),
    );
  });

  /**
   * Invariant H: exhaustive path reachability — closed must be reachable from
   * every other state via some legal path (no dead-end that can never reach closed).
   */
  it("H – closed is reachable from every state", () => {
    function canReachClosed(start: ViolationStatus): boolean {
      const visited = new Set<ViolationStatus>();
      const queue: ViolationStatus[] = [start];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (cur === "closed") return true;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const next of VALID_TRANSITIONS[cur]) {
          queue.push(next);
        }
      }
      return false;
    }

    for (const state of ALL_STATES) {
      if (state !== "closed") {
        expect(canReachClosed(state)).toBe(true);
      }
    }
  });

  /**
   * Invariant I: isValidTransition never throws for any combination of
   * adversarial (non-state) string inputs — it should return false, not crash.
   *
   * BUG: The function casts its parameters to ViolationStatus but the runtime
   * VALID_TRANSITIONS lookup will return undefined for unknown keys, causing
   * .includes() to throw "Cannot read properties of undefined". Marked
   * it.fails as this is a genuine source bug.
   *
   * Source: apps/api/src/domain/governance/violationWorkflow.ts
   * Reproducing input: isValidTransition("garbage" as any, "open")
   * Expected: false (graceful rejection of unknown state)
   * Actual: throws TypeError: Cannot read properties of undefined (reading 'includes')
   */
  it(
    "I (BUG) – isValidTransition does not throw for unknown string inputs",
    () => {
      const badInputs = ["", "OPEN", "Open", "garbage", "null", "undefined", "admin"];
      for (const bad of badInputs) {
        // Should return false, not throw
        expect(() =>
          isValidTransition(bad as ViolationStatus, "open"),
        ).not.toThrow();
        expect(() =>
          isValidTransition("open", bad as ViolationStatus),
        ).not.toThrow();
      }
    },
  );

  /**
   * Invariant J: stress — random walk through states never escapes from closed.
   * Uses the PRNG to pick random transitions; once closed, no further legal
   * transition should exist.
   */
  it("J – random walk: once in closed state no legal outgoing transition exists", () => {
    const rng = mulberry32(0xfacade42);
    for (let trial = 0; trial < 1_000; trial++) {
      let state: ViolationStatus =
        ALL_STATES[Math.floor(rng() * ALL_STATES.length)]!;

      // Walk up to 20 steps
      for (let step = 0; step < 20; step++) {
        if (state === "closed") {
          // Must have no valid outgoing transitions
          for (const next of ALL_STATES) {
            expect(isValidTransition(state, next)).toBe(false);
          }
          break;
        }
        const nexts = VALID_TRANSITIONS[state];
        if (nexts.length === 0) break;
        state = nexts[Math.floor(rng() * nexts.length)]!;
      }
    }
  });
});
