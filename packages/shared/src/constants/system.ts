/**
 * Sentinel actor ID used when an automated system process (e.g. a Stripe
 * webhook handler) writes to the audit log with no real user context.
 *
 * Stored as actorUserId in audit_events rows so operators can distinguish
 * user-initiated mutations from background system actions in audit exports.
 */
export const SYSTEM_ACTOR_ID = "system:stripe-webhook" as const;

export const OWNER_PORTAL_LINK_EXPIRY_DAYS = 30;
export const LEAD_MAGNET_DOWNLOAD_LINK_EXPIRY_DAYS = 30;
export const DUES_REMINDER_OVERDUE_INTERVAL_DAYS = [1, 7, 14, 30] as const;

/** Signed 32-bit integer bounds — the width of Postgres `integer` columns.
 *  Monetary cents and integer quantities are stored as `integer`, so input
 *  schemas bound to this range to reject oversized values at validation time
 *  (a clean 400) instead of letting Postgres throw a 22003 overflow (a 500). */
export const INT32_MAX = 2147483647;
export const INT32_MIN = -2147483648;
