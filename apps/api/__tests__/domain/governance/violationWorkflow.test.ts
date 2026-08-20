import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  VALID_TRANSITIONS,
} from "../../../src/domain/governance/violationWorkflow.js";

describe("isValidTransition", () => {
  it("open → notified is valid", () =>
    expect(isValidTransition("open", "notified")).toBe(true));
  it("open → cured is valid", () =>
    expect(isValidTransition("open", "cured")).toBe(true));
  it("open → closed is valid", () =>
    expect(isValidTransition("open", "closed")).toBe(true));
  it("notified → cured is valid", () =>
    expect(isValidTransition("notified", "cured")).toBe(true));
  it("notified → closed is valid", () =>
    expect(isValidTransition("notified", "closed")).toBe(true));
  it("cured → closed is valid", () =>
    expect(isValidTransition("cured", "closed")).toBe(true));
  it("cured → open is valid (re-open)", () =>
    expect(isValidTransition("cured", "open")).toBe(true));
  it("closed → open is invalid", () =>
    expect(isValidTransition("closed", "open")).toBe(false));
  it("closed → notified is invalid", () =>
    expect(isValidTransition("closed", "notified")).toBe(false));
  it("same status is invalid", () => {
    expect(isValidTransition("open", "open")).toBe(false);
    expect(isValidTransition("closed", "closed")).toBe(false);
  });
  it("VALID_TRANSITIONS has entries for all statuses", () => {
    expect(VALID_TRANSITIONS.open).toBeDefined();
    expect(VALID_TRANSITIONS.notified).toBeDefined();
    expect(VALID_TRANSITIONS.cured).toBeDefined();
    expect(VALID_TRANSITIONS.closed).toBeDefined();
  });
});
