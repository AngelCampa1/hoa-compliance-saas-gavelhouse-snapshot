export const TRANSITION_ROLES = ["treasurer", "secretary", "owner"] as const;

const CHECKLISTS: Record<string, string[]> = {
  treasurer: [
    "Transfer bank account signatory rights",
    "Share access to accounting software and financial records",
    "Hand off pending invoices and vendor contacts",
    "Provide current reserve fund balance documentation",
    "Transfer Stripe account access for dues collection",
    "Share annual budget and reserve study documents",
  ],
  secretary: [
    "Transfer custody of meeting minutes archive",
    "Hand off pending correspondence and open action items",
    "Share community governing documents (CC&Rs, bylaws)",
    "Transfer document storage credentials",
    "Brief on upcoming meeting schedule",
  ],
  owner: [
    "Transfer admin access in Gavelhouse",
    "Introduce new owner to board members",
    "Hand off vendor and service contracts",
    "Transfer emergency contact lists",
  ],
};

export function buildTransitionChecklist(role: string): string[] {
  // Object.hasOwn guards against prototype-named roles ("constructor",
  // "toString"); the spread returns a fresh array so callers cannot mutate
  // the shared module-level checklist.
  if (!Object.hasOwn(CHECKLISTS, role)) return [];
  return [...CHECKLISTS[role]];
}
