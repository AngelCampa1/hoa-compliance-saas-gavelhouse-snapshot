/**
 * Pure validation helpers for the journal-entry composer.
 *
 * Kept out of the route component so the "why is Post Entry disabled?"
 * logic is unit-testable and the message stays consistent with the form's
 * disabled condition.
 */

export interface PostEntryBlockInput {
  /** ISO date string (yyyy-mm-dd) bound to the date field. */
  entryDate: string;
  /** Raw memo field value. */
  memo: string;
  /** True when at least one line has an account and a non-zero amount. */
  hasPostableLine: boolean;
  /** True when every fund's debits equal its credits. */
  entryBalanced: boolean;
}

/**
 * Returns a short, plain reason the entry cannot be posted yet, or `null`
 * when the entry is ready. Ordered so the user is guided through the form
 * top-to-bottom: date → memo → lines → balance.
 */
export function postEntryBlockReason(
  input: PostEntryBlockInput,
): string | null {
  if (!input.entryDate) {
    return "Add an entry date to post.";
  }
  if (!input.memo.trim()) {
    return "Add a memo so others know what this entry is for.";
  }
  if (!input.hasPostableLine) {
    return "Add at least one line with an account and an amount.";
  }
  if (!input.entryBalanced) {
    return "Make the debits and credits equal before posting.";
  }
  return null;
}
