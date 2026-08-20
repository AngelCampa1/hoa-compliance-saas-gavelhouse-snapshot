import { CLOSE_STEPS, type CloseStep } from "@boardstack/shared";
import { nanoid } from "../../lib/nanoid.js";

export type ChecklistItemInit = {
  id: string;
  closeId: string;
  communityId: string;
  step: CloseStep;
  completed: boolean;
  completedAt: null;
  completedByUserId: null;
};

export function buildChecklistItems(
  closeId: string,
  communityId: string,
): ChecklistItemInit[] {
  return CLOSE_STEPS.map((step) => ({
    id: nanoid(),
    closeId,
    communityId,
    step,
    completed: false,
    completedAt: null,
    completedByUserId: null,
  }));
}

export function allCompleted(items: { completed: boolean }[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => item.completed);
}
