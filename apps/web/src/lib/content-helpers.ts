import type { BuyerStage } from "./types";

export interface StageBadge {
  label: string;
  classes: string;
}

export const STAGE_BADGES: Record<BuyerStage, StageBadge> = {
  tofu: {
    label: "Guide",
    classes:
      "bg-[var(--color-primary-50)] text-[var(--color-primary-700)] border-[var(--color-primary-200)]",
  },
  mofu: {
    label: "Compare",
    classes:
      "bg-[var(--color-accent-50)] text-[var(--color-accent-700)] border-[var(--color-accent-200)]",
  },
  bofu: {
    label: "Alternative",
    classes:
      "bg-[var(--color-success-50)] text-[var(--color-success-700)] border-[var(--color-success-200)]",
  },
};

export function formatContentDate(dateString: string): string {
  const normalized = dateString.includes("T")
    ? dateString
    : `${dateString}T00:00:00`;
  return new Date(normalized).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function filterMetadata(
  metadata?: Record<string, string>,
  excludeKeys?: string[],
): [string, string][] {
  if (!metadata) return [];
  const exclude = new Set(excludeKeys);
  return Object.entries(metadata).filter(
    ([key, v]) => v && !exclude.has(key),
  ) as [string, string][];
}
