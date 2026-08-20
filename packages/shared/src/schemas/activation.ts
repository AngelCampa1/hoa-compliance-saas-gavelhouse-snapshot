import { z } from "zod";

export const ActivationStep = z.enum([
  "roster_imported",
  "reserve_populated",
  "compliance_acknowledged",
  "dues_batch_configured",
]);
export type ActivationStep = z.infer<typeof ActivationStep>;

export const ACTIVATION_CHECKLIST: Array<{
  step: ActivationStep;
  label: string;
  description: string;
}> = [
  {
    step: "roster_imported",
    label: "Import homeowner roster",
    description: "Upload your community member list to get started.",
  },
  {
    step: "reserve_populated",
    label: "Set up reserve fund",
    description: "Enter your reserve study data or starting balance.",
  },
  {
    step: "compliance_acknowledged",
    label: "Review compliance status",
    description: "Acknowledge your state reserve requirements.",
  },
  {
    step: "dues_batch_configured",
    label: "Configure dues collection",
    description: "Set up your assessment schedule and payment methods.",
  },
];
