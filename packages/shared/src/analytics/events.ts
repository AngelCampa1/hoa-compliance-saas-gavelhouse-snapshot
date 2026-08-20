import { z } from "zod";

export const AnalyticsEventName = z.enum([
  "cta_clicked",
  "pricing_viewed",
  "pricing_tier_selected",
  "lead_magnet_impression",
  "lead_magnet_submitted",
  "lead_magnet_download_ready",
  "lead_magnet_downloaded",
  "lead_magnet_download_failed",
  "lead_created",
  "lead_unsubscribed",
  "waitlist_submitted",
  "waitlist_survey_submitted",
  "search_opened",
  "search_performed",
  "search_no_results",
  "search_result_clicked",
  "search_failed",
  "form_submission_failed",
  "setup_step_completed",
  "setup_completed",
  "signup_started",
  "signup_completed",
  "signup_failed",
  "signup_duplicate",
  "user_identified",
  "community_created",
  "member_invited",
  "member_invite_failed",
  "invitation_accept_failed",
  "invitation_accept_completed",
  "chart_of_accounts_seeded",
  "account_created",
  "account_updated",
  "help_search_performed",
  "help_category_selected",
  "help_topic_opened",
  "help_role_path_opened",
  "ai_support_message_sent",
  "ai_support_reply_received",
  "ai_support_message_failed",
  "ai_support_proxy_succeeded",
  "ai_support_proxy_failed",
  "bank_reconciliation_match_created",
  "bank_reconciliation_match_deleted",
  "bank_reconciliation_finalize_failed",
  "bank_reconciliation_finalized",
  "community_settings_updated",
  "community_settings_update_failed",
  "account_password_changed",
  "account_password_change_failed",
  "account_deletion_requested",
  "account_deletion_completed",
  "account_deletion_failed",
  "member_invite_link_copied",
  "login_started",
  "login_completed",
  "login_failed",
  "oauth_login_started",
  "oauth_login_failed",
  "password_reset_requested",
  "password_reset_request_failed",
  "password_reset_completed",
  "password_reset_failed",
  "trial_started",
  "activation_step_completed",
  "activation_completed",
  "aha_reached",
  "feature_access_denied",
  "report_viewed",
  "report_load_failed",
  "report_filter_changed",
  "report_export_downloaded",
  "report_export_failed",
  "audit_pack_downloaded",
  "audit_pack_download_failed",
  "portfolio_rollup_viewed",
  "portfolio_created",
  "portfolio_renamed",
  "portfolio_deleted",
  "portfolio_community_linked",
  "portfolio_community_unlinked",
  "close_started",
  "close_step_updated",
  "close_completed",
  "homeowner_imported",
  "reserve_imported",
  "reserve_allocation_updated",
  "dues_batch_created",
  "dues_payment_started",
  "dues_payment_recorded",
  "bank_statement_uploaded",
  "bank_statement_upload_failed",
  "reconciliation_completed",
  "journal_entry_posted",
  "board_transition_acknowledged",
  "board_transition_completed",
  "governance_item_created",
  "governance_item_reviewed",
  "governance_attachment_uploaded",
  "governance_minutes_updated",
  "governance_minutes_finalized",
  "governance_violation_status_updated",
  "governance_photo_uploaded",
  "governance_motion_created",
  "governance_motion_resolved",
  "governance_vote_cast",
  "owner_portal_session_created",
  "owner_portal_viewed",
  "owner_portal_payment_started",
  "owner_portal_checkout_ready",
  "owner_portal_payment_failed",
  "owner_portal_arch_request_submitted",
  "owner_portal_arch_request_failed",
  "checkout_started",
  "checkout_completed",
  "billing_checkout_started",
  "billing_checkout_completed",
  "billing_checkout_failed",
  "billing_cycle_changed",
  "billing_portal_failed",
  "subscription_started",
  "subscription_upgraded",
  "subscription_cancelled",
  "subscription_cancellation_requested",
  "subscription_cancellation_completed",
  "subscription_cancellation_failed",
  "api_error",
  "feedback_widget_loaded",
  "feedback_widget_unavailable",
  "feedback_widget_load_failed",
  "feedback_submitted",
]);

export type AnalyticsEventName = z.infer<typeof AnalyticsEventName>;

export type AnalyticsProperties = Record<string, unknown>;

export const ANALYTICS_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "li_fat_id",
  "initial_referrer",
  "initial_referring_domain",
  "landing_page",
  "entry_path",
  "current_referrer",
  "current_referring_domain",
  "current_landing_page",
  "current_entry_path",
] as const;

export type AnalyticsAttributionKey =
  (typeof ANALYTICS_ATTRIBUTION_KEYS)[number];

const SNAKE_CASE_KEY = /^[a-z][a-z0-9_]*$/;
const SENSITIVE_PROPERTY_PATTERN =
  /(^|_)(password|passcode|secret|token|auth|authorization|card|cc|cvv|cvc|ssn|email|free_text|notes?|message|body)($|_)/i;
const RAW_QUERY_PROPERTY_PATTERN = /(^|_)(raw_query|search_query|query)$/i;

export const analyticsEventInput = z
  .object({
    name: AnalyticsEventName,
    properties: z.record(z.unknown()).default({}),
  })
  .superRefine(({ name, properties }, ctx) => {
    try {
      assertSafeAnalyticsProperties(properties);
      assertEventSpecificAnalyticsProperties(name, properties);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error
            ? error.message
            : "Unsafe analytics properties.",
        path: ["properties"],
      });
    }
  });

const BANK_RECONCILIATION_EVENTS = new Set<string>([
  "bank_reconciliation_match_created",
  "bank_reconciliation_match_deleted",
  "bank_reconciliation_finalize_failed",
  "bank_reconciliation_finalized",
]);

const BANK_RECONCILIATION_FORBIDDEN_PROPERTY_PATTERN =
  /(^|_)(amount_cents|description|account_name|account_code|raw_error)($|_)/i;

const LEAD_MAGNET_DOWNLOAD_EVENTS = new Set<string>([
  "lead_magnet_downloaded",
  "lead_magnet_download_failed",
]);

const LEAD_MAGNET_DOWNLOAD_FORBIDDEN_PROPERTY_PATTERN =
  /(^|_)(filename|signature|expires|raw_error)($|_)/i;

const GOVERNANCE_MOTION_EVENTS = new Set<string>([
  "governance_motion_created",
  "governance_motion_resolved",
  "governance_vote_cast",
]);

const GOVERNANCE_MOTION_FORBIDDEN_PROPERTY_PATTERN =
  /(^|_)(motion_text|minutes_text|moved_by_user_id|seconded_by_user_id|voter_user_id|raw_error)($|_)/i;

const BANK_STATEMENT_EVENTS = new Set<string>([
  "bank_statement_uploaded",
  "bank_statement_upload_failed",
]);

const BANK_STATEMENT_FORBIDDEN_PROPERTY_PATTERN =
  /(^|_)(csv|csv_text|description|beginning_balance|ending_balance|balance_text|raw_error)($|_)/i;

const BILLING_EVENTS = new Set<string>([
  "billing_checkout_started",
  "billing_checkout_completed",
  "billing_checkout_failed",
  "billing_cycle_changed",
  "billing_portal_failed",
  "checkout_started",
  "checkout_completed",
  "subscription_started",
  "subscription_upgraded",
  "subscription_cancelled",
  "subscription_cancellation_requested",
  "subscription_cancellation_completed",
  "subscription_cancellation_failed",
]);

const BILLING_FORBIDDEN_PROPERTY_PATTERN =
  /(^|_)(raw_error|checkout_url|portal_url|return_url|stripe_customer_id|customer_id|payment_method_id)($|_)/i;

const REPORT_EXPORT_EVENTS = new Set<string>([
  "report_export_downloaded",
  "report_export_failed",
]);

const REPORT_EXPORT_FORBIDDEN_PROPERTY_PATTERN =
  /(^|_)(filename|transition_id|raw_error|account_id|ledger_lines|document|content|contents)($|_)/i;

function assertEventSpecificAnalyticsProperties(
  name: AnalyticsEventName,
  properties: AnalyticsProperties,
): void {
  if (BANK_RECONCILIATION_EVENTS.has(name)) {
    assertNoForbiddenAnalyticsProperties(
      properties,
      name,
      BANK_RECONCILIATION_FORBIDDEN_PROPERTY_PATTERN,
    );
  }

  if (LEAD_MAGNET_DOWNLOAD_EVENTS.has(name)) {
    assertNoForbiddenAnalyticsProperties(
      properties,
      name,
      LEAD_MAGNET_DOWNLOAD_FORBIDDEN_PROPERTY_PATTERN,
    );
  }

  if (GOVERNANCE_MOTION_EVENTS.has(name)) {
    assertNoForbiddenAnalyticsProperties(
      properties,
      name,
      GOVERNANCE_MOTION_FORBIDDEN_PROPERTY_PATTERN,
    );
  }

  if (BANK_STATEMENT_EVENTS.has(name)) {
    assertNoForbiddenAnalyticsProperties(
      properties,
      name,
      BANK_STATEMENT_FORBIDDEN_PROPERTY_PATTERN,
    );
  }

  if (BILLING_EVENTS.has(name)) {
    assertNoForbiddenAnalyticsProperties(
      properties,
      name,
      BILLING_FORBIDDEN_PROPERTY_PATTERN,
    );
  }

  if (REPORT_EXPORT_EVENTS.has(name)) {
    assertNoForbiddenAnalyticsProperties(
      properties,
      name,
      REPORT_EXPORT_FORBIDDEN_PROPERTY_PATTERN,
    );
  }
}

function assertNoForbiddenAnalyticsProperties(
  properties: AnalyticsProperties,
  name: AnalyticsEventName,
  forbiddenPattern: RegExp,
  basePath = "properties",
): void {
  for (const [key, value] of Object.entries(properties)) {
    if (forbiddenPattern.test(key)) {
      throw new Error(
        `Sensitive analytics property "${basePath}.${key}" is not allowed for ${name}.`,
      );
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === "object") {
          assertNoForbiddenAnalyticsProperties(
            item as AnalyticsProperties,
            name,
            forbiddenPattern,
            `${basePath}.${key}.${index}`,
          );
        }
      });
      continue;
    }

    if (value && typeof value === "object") {
      assertNoForbiddenAnalyticsProperties(
        value as AnalyticsProperties,
        name,
        forbiddenPattern,
        `${basePath}.${key}`,
      );
    }
  }
}

function assertSafeValue(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeValue(item, `${path}.${index}`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  assertSafeAnalyticsProperties(value as AnalyticsProperties, path);
}

export function assertSafeAnalyticsProperties(
  properties: AnalyticsProperties,
  basePath = "properties",
): void {
  for (const [key, value] of Object.entries(properties)) {
    if (!SNAKE_CASE_KEY.test(key)) {
      throw new Error(
        `Analytics property "${basePath}.${key}" must use snake_case.`,
      );
    }

    if (SENSITIVE_PROPERTY_PATTERN.test(key)) {
      throw new Error(
        `Sensitive analytics property "${basePath}.${key}" is not allowed.`,
      );
    }

    if (RAW_QUERY_PROPERTY_PATTERN.test(key)) {
      throw new Error(
        `Sensitive analytics property "${basePath}.${key}" is not allowed.`,
      );
    }

    assertSafeValue(value, `${basePath}.${key}`);
  }
}

export function buildAnalyticsEvent(
  name: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): { name: AnalyticsEventName; properties: AnalyticsProperties } {
  assertSafeAnalyticsProperties(properties);
  return analyticsEventInput.parse({ name, properties });
}
