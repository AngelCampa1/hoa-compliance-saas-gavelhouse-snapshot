import { describe, expect, it } from "vitest";
import {
  AnalyticsEventName,
  analyticsEventInput,
  assertSafeAnalyticsProperties,
  buildAnalyticsEvent,
} from "../../src/analytics/events";

describe("analytics event contract", () => {
  it("keeps canonical event names lowercase snake_case", () => {
    for (const eventName of AnalyticsEventName.options) {
      expect(eventName).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("accepts canonical acquisition, activation, and revenue events", () => {
    expect(
      analyticsEventInput.parse({
        name: "cta_clicked",
        properties: {
          cta_id: "hero-start",
          cta_text: "Start Free Trial",
          cta_location: "hero",
          source_page: "/",
          destination_url: "/pricing/",
          funnel_stage: "convert",
        },
      }),
    ).toEqual({
      name: "cta_clicked",
      properties: {
        cta_id: "hero-start",
        cta_text: "Start Free Trial",
        cta_location: "hero",
        source_page: "/",
        destination_url: "/pricing/",
        funnel_stage: "convert",
      },
    });

    expect(
      analyticsEventInput.parse({
        name: "lead_created",
        properties: {
          lead_type: "lead_magnet",
          landing_page: "/reserve-fund-calculator",
          utm_source: "linkedin",
        },
      }).name,
    ).toBe("lead_created");

    expect(
      analyticsEventInput.parse({
        name: "lead_magnet_downloaded",
        properties: {
          content_slug: "reserve-fund-calculator",
        },
      }).name,
    ).toBe("lead_magnet_downloaded");

    expect(
      analyticsEventInput.parse({
        name: "lead_magnet_download_failed",
        properties: {
          content_slug: "reserve-fund-calculator",
          failure_type: "invalid_signature",
        },
      }).name,
    ).toBe("lead_magnet_download_failed");

    expect(
      analyticsEventInput.parse({
        name: "activation_step_completed",
        properties: {
          step: "roster_imported",
          community_id: "comm-1",
          role: "owner",
          completed_count: 1,
          total_count: 4,
        },
      }).name,
    ).toBe("activation_step_completed");

    expect(
      analyticsEventInput.parse({
        name: "checkout_started",
        properties: {
          community_id: "comm-1",
          tier: "growth",
          billing_period: "annual",
          amount_cents: 94800,
        },
      }).name,
    ).toBe("checkout_started");

    expect(
      analyticsEventInput.parse({
        name: "checkout_completed",
        properties: {
          community_id: "comm-1",
          tier: "growth",
          billing_period: "annual",
          amount_cents: 94800,
        },
      }).name,
    ).toBe("checkout_completed");

    expect(
      analyticsEventInput.parse({
        name: "billing_checkout_started",
        properties: {
          community_id: "comm-1",
          tier: "growth",
          billing_period: "annual",
          amount_cents: 94800,
        },
      }).name,
    ).toBe("billing_checkout_started");

    expect(
      analyticsEventInput.parse({
        name: "billing_checkout_failed",
        properties: {
          billing_period: "annual",
          community_id: "comm-1",
          failure_type: "api_error",
          tier: "growth",
        },
      }).name,
    ).toBe("billing_checkout_failed");

    expect(
      analyticsEventInput.parse({
        name: "billing_cycle_changed",
        properties: {
          billing_period: "monthly",
          community_id: "comm-1",
          source: "billing_page",
        },
      }).name,
    ).toBe("billing_cycle_changed");

    expect(
      analyticsEventInput.parse({
        name: "billing_portal_failed",
        properties: {
          community_id: "comm-1",
          failure_type: "api_error",
        },
      }).name,
    ).toBe("billing_portal_failed");

    expect(
      analyticsEventInput.parse({
        name: "subscription_cancellation_requested",
        properties: {
          community_id: "comm-1",
          reason: "too_expensive",
        },
      }).name,
    ).toBe("subscription_cancellation_requested");

    expect(
      analyticsEventInput.parse({
        name: "subscription_cancellation_completed",
        properties: {
          community_id: "comm-1",
          reason: "too_expensive",
        },
      }).name,
    ).toBe("subscription_cancellation_completed");

    expect(
      analyticsEventInput.parse({
        name: "subscription_cancellation_failed",
        properties: {
          community_id: "comm-1",
          failure_type: "api_error",
          reason: "too_expensive",
        },
      }).name,
    ).toBe("subscription_cancellation_failed");

    expect(
      analyticsEventInput.parse({
        name: "waitlist_survey_submitted",
        properties: {
          source_page: "post-signup-survey",
          board_role: "treasurer",
        },
      }).name,
    ).toBe("waitlist_survey_submitted");

    expect(
      analyticsEventInput.parse({
        name: "search_performed",
        properties: {
          query_length: 7,
          result_count: 3,
          page_path: "/pricing",
        },
      }).name,
    ).toBe("search_performed");

    expect(
      analyticsEventInput.parse({
        name: "search_result_clicked",
        properties: {
          query_length: 7,
          result_index: 0,
          result_path: "/features",
          page_path: "/pricing",
        },
      }).name,
    ).toBe("search_result_clicked");

    expect(
      analyticsEventInput.parse({
        name: "form_submission_failed",
        properties: {
          form_name: "lead_magnet_capture",
          source_page: "/pricing",
          failure_type: "validation",
        },
      }).name,
    ).toBe("form_submission_failed");

    expect(
      analyticsEventInput.parse({
        name: "setup_step_completed",
        properties: {
          step: "board_member_invites",
          step_index: 1,
          skipped: true,
          source: "setup_wizard",
          community_id: "comm-1",
        },
      }).name,
    ).toBe("setup_step_completed");

    expect(
      analyticsEventInput.parse({
        name: "setup_completed",
        properties: {
          source: "setup_wizard",
          community_id: "comm-1",
          completed_count: 1,
          skipped_count: 3,
          total_count: 4,
        },
      }).name,
    ).toBe("setup_completed");

    expect(
      analyticsEventInput.parse({
        name: "close_started",
        properties: {
          close_id: "close-1",
          community_id: "comm-1",
          period_month: 1,
          period_year: 2024,
          role: "treasurer",
        },
      }).name,
    ).toBe("close_started");

    expect(
      analyticsEventInput.parse({
        name: "close_step_updated",
        properties: {
          close_id: "close-1",
          community_id: "comm-1",
          step: "reconcile_bank",
          completed: true,
          role: "treasurer",
        },
      }).name,
    ).toBe("close_step_updated");

    expect(
      analyticsEventInput.parse({
        name: "close_completed",
        properties: {
          audit_pack_bytes: 3,
          checklist_count: 5,
          close_id: "close-1",
          community_id: "comm-1",
          period_month: 1,
          period_year: 2024,
          role: "owner",
        },
      }).name,
    ).toBe("close_completed");

    expect(
      analyticsEventInput.parse({
        name: "feature_access_denied",
        properties: {
          capability: "report:read",
          feature: "reports",
          reason: "role",
          role: "secretary",
          tier: "scale",
        },
      }).name,
    ).toBe("feature_access_denied");

    expect(
      analyticsEventInput.parse({
        name: "report_load_failed",
        properties: {
          community_id: "comm-1",
          failure_type: "api_error",
          report_type: "trial_balance",
        },
      }).name,
    ).toBe("report_load_failed");

    expect(
      analyticsEventInput.parse({
        name: "report_filter_changed",
        properties: {
          community_id: "comm-1",
          filter_type: "fund_type",
          report_type: "general_ledger",
        },
      }).name,
    ).toBe("report_filter_changed");

    expect(
      analyticsEventInput.parse({
        name: "report_export_downloaded",
        properties: {
          community_id: "comm-1",
          period_end: "2026-05-31",
          period_start: "2026-05-01",
          report_type: "audit_pack",
        },
      }).name,
    ).toBe("report_export_downloaded");

    expect(
      analyticsEventInput.parse({
        name: "report_export_failed",
        properties: {
          community_id: "comm-1",
          failure_type: "unsupported_role",
          report_type: "role_handoff",
        },
      }).name,
    ).toBe("report_export_failed");

    expect(
      analyticsEventInput.parse({
        name: "audit_pack_downloaded",
        properties: {
          close_id: "close-1",
          community_id: "comm-1",
          period_month: 1,
          period_year: 2024,
          role: "owner",
        },
      }).name,
    ).toBe("audit_pack_downloaded");

    expect(
      analyticsEventInput.parse({
        name: "audit_pack_download_failed",
        properties: {
          community_id: "comm-1",
          failure_type: "api_error",
          period_end: "2024-01-31",
          period_start: "2024-01-01",
        },
      }).name,
    ).toBe("audit_pack_download_failed");

    expect(
      analyticsEventInput.parse({
        name: "board_transition_acknowledged",
        properties: {
          actor_position: "incoming",
          actor_role: "member",
          community_id: "comm-1",
          new_status: "acknowledged",
          previous_status: "pending",
          transition_id: "transition-1",
          transition_role: "treasurer",
        },
      }).name,
    ).toBe("board_transition_acknowledged");

    expect(
      analyticsEventInput.parse({
        name: "board_transition_completed",
        properties: {
          actor_position: "outgoing",
          actor_role: "owner",
          community_id: "comm-1",
          new_status: "complete",
          previous_status: "acknowledged",
          transition_id: "transition-1",
          transition_role: "treasurer",
        },
      }).name,
    ).toBe("board_transition_completed");

    expect(
      analyticsEventInput.parse({
        name: "governance_minutes_updated",
        properties: {
          community_id: "comm-1",
          finalized: false,
          meeting_id: "meeting-1",
          role: "secretary",
        },
      }).name,
    ).toBe("governance_minutes_updated");

    expect(
      analyticsEventInput.parse({
        name: "governance_minutes_finalized",
        properties: {
          community_id: "comm-1",
          meeting_id: "meeting-1",
          role: "secretary",
        },
      }).name,
    ).toBe("governance_minutes_finalized");

    expect(
      analyticsEventInput.parse({
        name: "governance_item_reviewed",
        properties: {
          community_id: "comm-1",
          item_id: "arch-1",
          item_type: "arch_request",
          previous_status: "pending",
          role: "admin",
          status: "approved",
        },
      }).name,
    ).toBe("governance_item_reviewed");

    expect(
      analyticsEventInput.parse({
        name: "governance_attachment_uploaded",
        properties: {
          attachment_type: "arch_request",
          community_id: "comm-1",
          file_type: "application/pdf",
          item_id: "arch-1",
          role: "admin",
          size_bucket: "small",
        },
      }).name,
    ).toBe("governance_attachment_uploaded");

    expect(
      analyticsEventInput.parse({
        name: "governance_violation_status_updated",
        properties: {
          community_id: "comm-1",
          from_status: "open",
          role: "secretary",
          to_status: "notified",
          violation_id: "violation-1",
        },
      }).name,
    ).toBe("governance_violation_status_updated");

    expect(
      analyticsEventInput.parse({
        name: "governance_photo_uploaded",
        properties: {
          community_id: "comm-1",
          file_type: "image/jpeg",
          role: "admin",
          size_bucket: "small",
          violation_id: "violation-1",
        },
      }).name,
    ).toBe("governance_photo_uploaded");

    expect(
      analyticsEventInput.parse({
        name: "dues_payment_started",
        properties: {
          community_id: "comm-1",
          assessment_id: "assess-1",
          amount_cents: 15000,
          method: "card",
          fund_type: "operating",
          reused_pending: false,
        },
      }).name,
    ).toBe("dues_payment_started");

    expect(
      analyticsEventInput.parse({
        name: "reserve_allocation_updated",
        properties: {
          allocation_percent: 15,
          community_id: "comm-1",
          fannie_mae_compliant: true,
          role: "treasurer",
          study_id: "study-1",
        },
      }).name,
    ).toBe("reserve_allocation_updated");

    expect(
      analyticsEventInput.parse({
        name: "dues_payment_recorded",
        properties: {
          community_id: "comm-1",
          assessment_id: "assess-1",
          payment_id: "pay-1",
          amount_cents: 15000,
          method: "check",
          paid_in_full: true,
        },
      }).name,
    ).toBe("dues_payment_recorded");

    expect(
      analyticsEventInput.parse({
        name: "owner_portal_session_created",
        properties: {
          community_id: "comm-1",
          session_id: "session-1",
          invite_sent: true,
          role: "admin",
        },
      }).name,
    ).toBe("owner_portal_session_created");

    expect(
      analyticsEventInput.parse({
        name: "governance_motion_created",
        properties: {
          community_id: "comm-1",
          meeting_id: "meeting-1",
          motion_id: "motion-1",
          role: "secretary",
        },
      }).name,
    ).toBe("governance_motion_created");

    expect(
      analyticsEventInput.parse({
        name: "governance_motion_resolved",
        properties: {
          community_id: "comm-1",
          meeting_id: "meeting-1",
          motion_id: "motion-1",
          role: "secretary",
          status: "passed",
        },
      }).name,
    ).toBe("governance_motion_resolved");

    expect(
      analyticsEventInput.parse({
        name: "governance_vote_cast",
        properties: {
          choice: "yes",
          community_id: "comm-1",
          meeting_id: "meeting-1",
          motion_id: "motion-1",
          role: "admin",
          vote_id: "vote-1",
        },
      }).name,
    ).toBe("governance_vote_cast");

    expect(
      analyticsEventInput.parse({
        name: "owner_portal_viewed",
        properties: {
          arch_request_count: 0,
          arch_requests_available: true,
          assessment_count: 2,
          payable_assessment_count: 1,
          state: "loaded",
        },
      }).name,
    ).toBe("owner_portal_viewed");

    expect(
      analyticsEventInput.parse({
        name: "owner_portal_payment_started",
        properties: {
          amount_cents: 12500,
          assessment_id: "assessment-1",
          method: "card",
          status: "past_due",
        },
      }).name,
    ).toBe("owner_portal_payment_started");

    expect(
      analyticsEventInput.parse({
        name: "owner_portal_checkout_ready",
        properties: {
          assessment_id: "assessment-1",
          checkout_available: true,
          method: "card",
        },
      }).name,
    ).toBe("owner_portal_checkout_ready");

    expect(
      analyticsEventInput.parse({
        name: "owner_portal_payment_failed",
        properties: {
          assessment_id: "assessment-1",
          failure_type: "api_error",
          method: "card",
          status: "past_due",
        },
      }).name,
    ).toBe("owner_portal_payment_failed");

    expect(
      analyticsEventInput.parse({
        name: "owner_portal_arch_request_submitted",
        properties: {
          field_count: 2,
          request_type_length: 11,
        },
      }).name,
    ).toBe("owner_portal_arch_request_submitted");

    expect(
      analyticsEventInput.parse({
        name: "owner_portal_arch_request_failed",
        properties: {
          failure_type: "api_error",
          field_count: 2,
          request_type_length: 11,
        },
      }).name,
    ).toBe("owner_portal_arch_request_failed");

    expect(
      analyticsEventInput.parse({
        name: "portfolio_created",
        properties: {
          portfolio_id: "portfolio-1",
        },
      }).name,
    ).toBe("portfolio_created");

    expect(
      analyticsEventInput.parse({
        name: "portfolio_renamed",
        properties: {
          portfolio_id: "portfolio-1",
        },
      }).name,
    ).toBe("portfolio_renamed");

    expect(
      analyticsEventInput.parse({
        name: "portfolio_deleted",
        properties: {
          portfolio_id: "portfolio-1",
        },
      }).name,
    ).toBe("portfolio_deleted");

    expect(
      analyticsEventInput.parse({
        name: "portfolio_community_linked",
        properties: {
          community_id: "comm-1",
          membership_role: "owner",
          portfolio_id: "portfolio-1",
          tier: "portfolio",
        },
      }).name,
    ).toBe("portfolio_community_linked");

    expect(
      analyticsEventInput.parse({
        name: "portfolio_community_unlinked",
        properties: {
          community_id: "comm-1",
          portfolio_id: "portfolio-1",
        },
      }).name,
    ).toBe("portfolio_community_unlinked");

    expect(
      analyticsEventInput.parse({
        name: "member_invited",
        properties: {
          community_id: "comm-1",
          role: "treasurer",
        },
      }).name,
    ).toBe("member_invited");

    expect(
      analyticsEventInput.parse({
        name: "member_invite_failed",
        properties: {
          community_id: "comm-1",
          failure_reason: "rate_limited",
          role: "treasurer",
        },
      }).name,
    ).toBe("member_invite_failed");

    expect(
      analyticsEventInput.parse({
        name: "invitation_accept_failed",
        properties: {
          community_id: "comm-1",
          failure_reason: "email_mismatch",
          role: "secretary",
        },
      }).name,
    ).toBe("invitation_accept_failed");

    expect(
      analyticsEventInput.parse({
        name: "invitation_accept_completed",
        properties: {
          community_id: "comm-1",
          role: "secretary",
          transition_created: false,
        },
      }).name,
    ).toBe("invitation_accept_completed");

    expect(
      analyticsEventInput.parse({
        name: "chart_of_accounts_seeded",
        properties: {
          community_id: "comm-1",
          role: "owner",
          seeded_count: 14,
        },
      }).name,
    ).toBe("chart_of_accounts_seeded");

    expect(
      analyticsEventInput.parse({
        name: "account_created",
        properties: {
          account_id: "account-1",
          account_type: "asset",
          community_id: "comm-1",
          fund_type: "reserve",
          role: "treasurer",
        },
      }).name,
    ).toBe("account_created");

    expect(
      analyticsEventInput.parse({
        name: "account_updated",
        properties: {
          account_id: "account-1",
          changed_active: false,
          changed_name: true,
          changed_parent_account: false,
          community_id: "comm-1",
          role: "owner",
        },
      }).name,
    ).toBe("account_updated");

    expect(
      analyticsEventInput.parse({
        name: "help_search_performed",
        properties: {
          query_length: 3,
          result_count: 1,
        },
      }).name,
    ).toBe("help_search_performed");

    expect(
      analyticsEventInput.parse({
        name: "help_category_selected",
        properties: {
          category: "reports",
          result_count: 1,
        },
      }).name,
    ).toBe("help_category_selected");

    expect(
      analyticsEventInput.parse({
        name: "help_topic_opened",
        properties: {
          category: "files",
          source: "help_index",
          topic_id: "opening-downloaded-files",
        },
      }).name,
    ).toBe("help_topic_opened");

    expect(
      analyticsEventInput.parse({
        name: "help_role_path_opened",
        properties: {
          role_path_id: "plain-language",
          source: "help_index",
        },
      }).name,
    ).toBe("help_role_path_opened");

    expect(
      analyticsEventInput.parse({
        name: "ai_support_message_sent",
        properties: {
          content_length: 34,
          page_path: "/",
          reused_session: false,
          source: "dashboard_widget",
        },
      }).name,
    ).toBe("ai_support_message_sent");

    expect(
      analyticsEventInput.parse({
        name: "ai_support_reply_received",
        properties: {
          content_length: 34,
          page_path: "/",
          reply_available: true,
          source: "dashboard_widget",
        },
      }).name,
    ).toBe("ai_support_reply_received");

    expect(
      analyticsEventInput.parse({
        name: "ai_support_message_failed",
        properties: {
          content_length: 8,
          failure_type: "unavailable",
          page_path: "/",
          source: "dashboard_widget",
        },
      }).name,
    ).toBe("ai_support_message_failed");

    expect(
      analyticsEventInput.parse({
        name: "ai_support_proxy_succeeded",
        properties: {
          action: "chat",
          request_field_count: 2,
        },
      }).name,
    ).toBe("ai_support_proxy_succeeded");

    expect(
      analyticsEventInput.parse({
        name: "ai_support_proxy_failed",
        properties: {
          action: "chat",
          failure_type: "upstream_unavailable",
          request_field_count: 2,
        },
      }).name,
    ).toBe("ai_support_proxy_failed");

    expect(
      analyticsEventInput.parse({
        name: "bank_reconciliation_match_created",
        properties: {
          community_id: "comm-1",
          match_id: "match-1",
          match_target_type: "payment",
          reconciliation_id: "recon-1",
          role: "treasurer",
          statement_id: "stmt-1",
        },
      }).name,
    ).toBe("bank_reconciliation_match_created");

    expect(
      analyticsEventInput.parse({
        name: "bank_statement_upload_failed",
        properties: {
          account_id: "account-1",
          community_id: "comm-1",
          failure_type: "validation",
          field: "csv",
        },
      }).name,
    ).toBe("bank_statement_upload_failed");

    expect(
      analyticsEventInput.parse({
        name: "bank_reconciliation_match_deleted",
        properties: {
          community_id: "comm-1",
          match_id: "match-1",
          reconciliation_id: "recon-1",
          role: "treasurer",
        },
      }).name,
    ).toBe("bank_reconciliation_match_deleted");

    expect(
      analyticsEventInput.parse({
        name: "bank_reconciliation_finalize_failed",
        properties: {
          balanced: false,
          community_id: "comm-1",
          line_count: 2,
          matched_line_count: 1,
          reconciliation_id: "recon-1",
          role: "treasurer",
          statement_id: "stmt-1",
          unmatched_line_count: 1,
        },
      }).name,
    ).toBe("bank_reconciliation_finalize_failed");

    expect(
      analyticsEventInput.parse({
        name: "bank_reconciliation_finalized",
        properties: {
          community_id: "comm-1",
          line_count: 2,
          matched_line_count: 2,
          reconciliation_id: "recon-1",
          role: "treasurer",
          statement_id: "stmt-1",
        },
      }).name,
    ).toBe("bank_reconciliation_finalized");

    expect(
      analyticsEventInput.parse({
        name: "community_settings_updated",
        properties: {
          changed_name: true,
          changed_state: false,
          community_id: "comm-1",
        },
      }).name,
    ).toBe("community_settings_updated");

    expect(
      analyticsEventInput.parse({
        name: "community_settings_update_failed",
        properties: {
          changed_name: true,
          changed_state: false,
          community_id: "comm-1",
          failure_type: "api_error",
        },
      }).name,
    ).toBe("community_settings_update_failed");

    expect(
      analyticsEventInput.parse({
        name: "account_password_changed",
        properties: {
          source: "settings",
        },
      }).name,
    ).toBe("account_password_changed");

    expect(
      analyticsEventInput.parse({
        name: "account_password_change_failed",
        properties: {
          failure_type: "api_error",
          source: "settings",
        },
      }).name,
    ).toBe("account_password_change_failed");

    expect(
      analyticsEventInput.parse({
        name: "account_deletion_requested",
        properties: {
          credential_provided: true,
          source: "settings",
        },
      }).name,
    ).toBe("account_deletion_requested");

    expect(
      analyticsEventInput.parse({
        name: "account_deletion_completed",
        properties: {
          source: "settings",
        },
      }).name,
    ).toBe("account_deletion_completed");

    expect(
      analyticsEventInput.parse({
        name: "account_deletion_failed",
        properties: {
          failure_type: "api_error",
          source: "settings",
        },
      }).name,
    ).toBe("account_deletion_failed");

    expect(
      analyticsEventInput.parse({
        name: "member_invite_link_copied",
        properties: {
          community_id: "comm-1",
          role: "treasurer",
          source: "settings",
        },
      }).name,
    ).toBe("member_invite_link_copied");

    expect(
      analyticsEventInput.parse({
        name: "login_started",
        properties: {
          has_redirect: true,
          method: "email",
        },
      }).name,
    ).toBe("login_started");

    expect(
      analyticsEventInput.parse({
        name: "login_completed",
        properties: {
          has_redirect: false,
          method: "email",
        },
      }).name,
    ).toBe("login_completed");

    expect(
      analyticsEventInput.parse({
        name: "login_failed",
        properties: {
          failure_type: "invalid_credentials",
          has_redirect: false,
          method: "email",
        },
      }).name,
    ).toBe("login_failed");

    expect(
      analyticsEventInput.parse({
        name: "oauth_login_started",
        properties: {
          has_redirect: true,
          provider: "google",
        },
      }).name,
    ).toBe("oauth_login_started");

    expect(
      analyticsEventInput.parse({
        name: "oauth_login_failed",
        properties: {
          failure_type: "provider_error",
          has_redirect: false,
          provider: "google",
        },
      }).name,
    ).toBe("oauth_login_failed");

    expect(
      analyticsEventInput.parse({
        name: "password_reset_requested",
        properties: {
          source: "forgot_password",
        },
      }).name,
    ).toBe("password_reset_requested");

    expect(
      analyticsEventInput.parse({
        name: "password_reset_request_failed",
        properties: {
          failure_type: "api_error",
          source: "forgot_password",
        },
      }).name,
    ).toBe("password_reset_request_failed");

    expect(
      analyticsEventInput.parse({
        name: "password_reset_completed",
        properties: {
          source: "reset_password",
        },
      }).name,
    ).toBe("password_reset_completed");

    expect(
      analyticsEventInput.parse({
        name: "password_reset_failed",
        properties: {
          failure_type: "api_error",
          source: "reset_password",
        },
      }).name,
    ).toBe("password_reset_failed");
  });

  it("rejects unknown events", () => {
    expect(() =>
      analyticsEventInput.parse({
        name: "Signup Completed",
        properties: {},
      }),
    ).toThrow();
  });

  it("rejects sensitive analytics property names", () => {
    expect(() =>
      assertSafeAnalyticsProperties({
        community_id: "comm-1",
        password: "not-for-analytics",
      }),
    ).toThrow(/sensitive analytics property/i);

    expect(() =>
      assertSafeAnalyticsProperties({
        billing: { card_number: "4242424242424242" },
      }),
    ).toThrow(/sensitive analytics property/i);

    expect(() =>
      assertSafeAnalyticsProperties({
        attempted_values: [{ auth_token: "token-123" }],
      }),
    ).toThrow(/sensitive analytics property/i);
  });

  it("rejects unsafe properties through the exported event input schema", () => {
    expect(() =>
      analyticsEventInput.parse({
        name: "api_error",
        properties: { email: "owner@example.com" },
      }),
    ).toThrow(/sensitive analytics property/i);

    expect(() =>
      analyticsEventInput.parse({
        name: "api_error",
        properties: { reportType: "balance_sheet" },
      }),
    ).toThrow(/snake_case/i);

    expect(() =>
      analyticsEventInput.parse({
        name: "search_performed",
        properties: { query: "raw search text" },
      }),
    ).toThrow(/sensitive analytics property/i);

    for (const key of [
      "amount_cents",
      "description",
      "account_name",
      "account_code",
      "raw_error",
    ]) {
      expect(() =>
        analyticsEventInput.parse({
          name: "bank_reconciliation_match_created",
          properties: {
            community_id: "comm-1",
            match_id: "match-1",
            match_target_type: "payment",
            reconciliation_id: "recon-1",
            role: "treasurer",
            statement_id: "stmt-1",
            [key]: "unsafe",
          },
        }),
      ).toThrow(/sensitive analytics property/i);
    }

    expect(() =>
      analyticsEventInput.parse({
        name: "bank_reconciliation_finalized",
        properties: {
          community_id: "comm-1",
          line: {
            amount_cents: 123,
          },
          reconciliation_id: "recon-1",
        },
      }),
    ).toThrow(/sensitive analytics property/i);

    for (const key of [
      "amount_cents",
      "description",
      "account_name",
      "account_code",
      "raw_error",
    ]) {
      expect(() =>
        analyticsEventInput.parse({
          name: "bank_reconciliation_finalized",
          properties: {
            community_id: "comm-1",
            lines: [{ [key]: "unsafe" }],
            reconciliation_id: "recon-1",
          },
        }),
      ).toThrow(/sensitive analytics property/i);
    }

    for (const key of ["filename", "signature", "expires", "raw_error"]) {
      expect(() =>
        analyticsEventInput.parse({
          name: "lead_magnet_download_failed",
          properties: {
            content_slug: "reserve-fund-calculator",
            failure_type: "invalid_signature",
            [key]: "unsafe",
          },
        }),
      ).toThrow(/sensitive analytics property/i);
    }

    expect(() =>
      analyticsEventInput.parse({
        name: "lead_magnet_downloaded",
        properties: {
          content_slug: "reserve-fund-calculator",
          nested: {
            signature: "unsafe",
          },
        },
      }),
    ).toThrow(/sensitive analytics property/i);

    for (const key of [
      "motion_text",
      "minutes_text",
      "moved_by_user_id",
      "seconded_by_user_id",
      "voter_user_id",
      "raw_error",
    ]) {
      expect(() =>
        analyticsEventInput.parse({
          name: "governance_motion_created",
          properties: {
            community_id: "comm-1",
            meeting_id: "meeting-1",
            motion_id: "motion-1",
            role: "secretary",
            [key]: "unsafe",
          },
        }),
      ).toThrow(/sensitive analytics property/i);
    }

    expect(() =>
      analyticsEventInput.parse({
        name: "governance_vote_cast",
        properties: {
          choice: "yes",
          community_id: "comm-1",
          nested: {
            voter_user_id: "user-1",
          },
        },
      }),
    ).toThrow(/sensitive analytics property/i);

    for (const key of [
      "csv",
      "csv_text",
      "description",
      "beginning_balance",
      "ending_balance",
      "balance_text",
      "raw_error",
    ]) {
      expect(() =>
        analyticsEventInput.parse({
          name: "bank_statement_upload_failed",
          properties: {
            account_id: "account-1",
            community_id: "comm-1",
            failure_type: "api_error",
            [key]: "unsafe",
          },
        }),
      ).toThrow(/sensitive analytics property/i);
    }

    expect(() =>
      analyticsEventInput.parse({
        name: "bank_statement_uploaded",
        properties: {
          community_id: "comm-1",
          rows: [{ description: "unsafe" }],
        },
      }),
    ).toThrow(/sensitive analytics property/i);

    for (const key of [
      "raw_error",
      "checkout_url",
      "portal_url",
      "return_url",
      "stripe_customer_id",
      "customer_id",
      "payment_method_id",
    ]) {
      expect(() =>
        analyticsEventInput.parse({
          name: "billing_checkout_failed",
          properties: {
            billing_period: "annual",
            community_id: "comm-1",
            failure_type: "api_error",
            tier: "growth",
            [key]: "unsafe",
          },
        }),
      ).toThrow(/sensitive analytics property/i);
    }

    expect(() =>
      analyticsEventInput.parse({
        name: "subscription_cancellation_failed",
        properties: {
          community_id: "comm-1",
          nested: {
            portal_url: "unsafe",
          },
          reason: "too_expensive",
        },
      }),
    ).toThrow(/sensitive analytics property/i);

    for (const key of [
      "filename",
      "transition_id",
      "raw_error",
      "account_id",
      "ledger_lines",
      "document",
      "content",
      "contents",
    ]) {
      expect(() =>
        analyticsEventInput.parse({
          name: "report_export_downloaded",
          properties: {
            community_id: "comm-1",
            report_type: "audit_pack",
            [key]: "unsafe",
          },
        }),
      ).toThrow(/sensitive analytics property/i);
    }

    expect(() =>
      analyticsEventInput.parse({
        name: "report_export_failed",
        properties: {
          community_id: "comm-1",
          nested: {
            filename: "unsafe",
          },
          report_type: "role_handoff",
        },
      }),
    ).toThrow(/sensitive analytics property/i);
  });

  it("builds events with safe snake_case properties", () => {
    expect(
      buildAnalyticsEvent("lead_magnet_submitted", {
        content_slug: "reserve-fund-calculator",
        utm_content: "hero",
      }),
    ).toEqual({
      name: "lead_magnet_submitted",
      properties: {
        content_slug: "reserve-fund-calculator",
        utm_content: "hero",
      },
    });

    expect(
      buildAnalyticsEvent("report_viewed", {
        report_type: "balance_sheet",
        community_id: "comm-1",
      }),
    ).toEqual({
      name: "report_viewed",
      properties: {
        report_type: "balance_sheet",
        community_id: "comm-1",
      },
    });

    expect(
      buildAnalyticsEvent("cta_clicked", {
        cta_id: "hero",
        variants: [{ variant_id: "a" }, { variant_id: "b" }],
      }),
    ).toEqual({
      name: "cta_clicked",
      properties: {
        cta_id: "hero",
        variants: [{ variant_id: "a" }, { variant_id: "b" }],
      },
    });

    expect(() =>
      buildAnalyticsEvent("report_viewed", {
        reportType: "balance_sheet",
      }),
    ).toThrow(/snake_case/i);
  });
});
