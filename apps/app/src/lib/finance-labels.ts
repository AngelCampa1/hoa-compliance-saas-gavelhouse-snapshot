/**
 * Human-readable label maps for finance domain enumerations.
 * These are utility functions (not UI) so they are covered by unit tests.
 */

/** Map of snake_case close step keys → human-readable labels. */
export const CLOSE_STEP_LABELS: Record<string, string> = {
  reconcile_bank: "Reconcile bank statements",
  bank_rec: "Reconcile bank statements",
  review_journal: "Review journal entries",
  run_trial_balance: "Run trial balance",
  approve_close: "Approve period close",
  sign_off: "Approve period close",
  fund_transfer: "Transfer funds",
  archive_docs: "Archive documents",
};

/**
 * Return the human-readable label for a close checklist step key.
 * Falls back to a title-cased version of the key (underscores → spaces)
 * if the key is not in the map.
 */
export function getCloseStepLabel(step: string): string {
  if (CLOSE_STEP_LABELS[step] !== undefined) {
    return CLOSE_STEP_LABELS[step];
  }
  // Fallback: replace underscores with spaces and title-case each word
  return step.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map of assessment status values → human-readable labels. */
export const ASSESSMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  past_due: "Past Due",
  waived: "Waived",
};

/**
 * Return the human-readable label for an assessment status value.
 * Falls back to a capitalized version of the status if not in the map.
 */
export function getAssessmentStatusLabel(status: string): string {
  if (ASSESSMENT_STATUS_LABELS[status] !== undefined) {
    return ASSESSMENT_STATUS_LABELS[status];
  }
  const formatted = status.replace(/_/g, " ");
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
