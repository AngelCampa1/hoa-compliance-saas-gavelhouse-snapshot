type ViolationStatus = "open" | "notified" | "cured" | "closed";

export const VALID_TRANSITIONS: Record<ViolationStatus, ViolationStatus[]> = {
  open: ["notified", "cured", "closed"],
  notified: ["cured", "closed"],
  cured: ["closed", "open"],
  closed: [],
};

export function isValidTransition(
  from: ViolationStatus,
  to: ViolationStatus,
): boolean {
  if (from === to) return false;
  // Guard against unknown/prototype-named `from` values reaching this from
  // unvalidated input: return false rather than throwing on a missing key.
  if (!Object.hasOwn(VALID_TRANSITIONS, from)) return false;
  return VALID_TRANSITIONS[from].includes(to);
}
