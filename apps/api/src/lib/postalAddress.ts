import type { Env } from "../types/env.js";

const PLACEHOLDER_POSTAL_ADDRESS_PATTERNS: RegExp[] = [
  /\[set\s+COMPANY_POSTAL_ADDRESS\s+in\s+production\]/i,
  /<real registered mailing address/i,
];

/**
 * Reads `COMPANY_POSTAL_ADDRESS` from the env, trims it, and refuses to return
 * a value that is missing or still contains a known placeholder.
 *
 * The CAN-SPAM footer must contain a real postal address; mailers call this
 * before render so they fail loudly rather than ship a placeholder to inboxes.
 */
export function resolveCompanyPostalAddress(
  env: Pick<Env, "COMPANY_POSTAL_ADDRESS">,
): string {
  const value = env.COMPANY_POSTAL_ADDRESS?.trim();
  if (
    !value ||
    PLACEHOLDER_POSTAL_ADDRESS_PATTERNS.some((pattern) => pattern.test(value))
  ) {
    throw new Error(
      "COMPANY_POSTAL_ADDRESS not configured with a real address — refusing to send email without a CAN-SPAM compliant footer address.",
    );
  }
  return value;
}
