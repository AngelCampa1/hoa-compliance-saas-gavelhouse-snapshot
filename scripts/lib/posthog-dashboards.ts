import {
  AnalyticsEventName,
  type AnalyticsEventName as AnalyticsEventNameType,
} from "../../packages/shared/src/analytics/events";

type JsonObject = Record<string, unknown>;
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PostHogInsightDefinition {
  key: string;
  name: string;
  description: string;
  events: readonly AnalyticsEventNameType[];
  query: JsonObject;
}

export interface PostHogDashboardDefinition {
  key: string;
  name: string;
  description: string;
  insights: readonly PostHogInsightDefinition[];
}

export interface PostHogDashboardPlan {
  dashboards: Array<{
    key: string;
    name: string;
    description: string;
  }>;
  insights: Array<{
    dashboardKey: string;
    key: string;
    name: string;
    description: string;
    query: JsonObject;
    tags: string[];
  }>;
}

export interface PostHogConfig {
  apiHost: string;
  environmentId: string;
  personalApiKey: string;
  projectId: string;
}

export interface PostHogDashboardArgs {
  apply: boolean;
}

export interface PostHogSyncResult {
  createdDashboards: string[];
  updatedDashboards: string[];
  createdInsights: string[];
  updatedInsights: string[];
}

interface PostHogListResponse<T> {
  next?: string | null;
  results?: T[];
}

interface PostHogNamedResource {
  id: number;
  name: string;
}

const ANALYTICS_TAG = "analytics-as-code";
const PRODUCT_TAG = "gavelhouse";
const DEFAULT_PRIVATE_API_HOST = "https://us.posthog.com";

const governanceEvents = [
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
] as const satisfies readonly AnalyticsEventNameType[];

export const POSTHOG_DASHBOARD_DEFINITIONS = [
  {
    key: "growth-funnel",
    name: "Gavelhouse Growth Funnel",
    description:
      "Acquisition, website conversion, lead magnets, search, signup, and early demand signals.",
    insights: [
      funnelInsight(
        "marketing-to-signup-funnel",
        "Marketing to signup funnel",
        "Tracks the path from CTA click through signup completion.",
        ["cta_clicked", "pricing_viewed", "signup_started", "signup_completed"],
      ),
      trendInsight(
        "lead-magnet-conversion",
        "Lead magnet conversion",
        "Shows lead magnet impressions, submits, ready states, downloads, and failures.",
        [
          "lead_magnet_impression",
          "lead_magnet_submitted",
          "lead_magnet_download_ready",
          "lead_magnet_downloaded",
          "lead_magnet_download_failed",
        ],
      ),
      trendInsight(
        "search-performance",
        "Search performance",
        "Shows search usage, no-result rates, result clicks, and failures.",
        [
          "search_opened",
          "search_performed",
          "search_no_results",
          "search_result_clicked",
          "search_failed",
        ],
      ),
      trendInsight(
        "lead-and-waitlist-demand",
        "Lead and waitlist demand",
        "Tracks created leads, unsubscribes, waitlist submits, surveys, pricing tier intent, and form failures.",
        [
          "lead_created",
          "lead_unsubscribed",
          "waitlist_submitted",
          "waitlist_survey_submitted",
          "pricing_tier_selected",
          "form_submission_failed",
        ],
      ),
      trendInsight(
        "signup-quality",
        "Signup quality",
        "Tracks successful, failed, and duplicate signup outcomes.",
        [
          "signup_started",
          "signup_completed",
          "signup_failed",
          "signup_duplicate",
        ],
      ),
    ],
  },
  {
    key: "activation-retention",
    name: "Gavelhouse Activation and Retention",
    description:
      "User identity, community creation, onboarding, aha moments, invites, and activation completion.",
    insights: [
      funnelInsight(
        "new-community-activation-funnel",
        "New community activation funnel",
        "Tracks signup, community creation, setup, aha moment, and activation completion.",
        [
          "signup_completed",
          "community_created",
          "setup_completed",
          "aha_reached",
          "activation_completed",
        ],
      ),
      trendInsight(
        "setup-progress",
        "Setup progress",
        "Tracks setup and activation step completion over time.",
        [
          "setup_step_completed",
          "setup_completed",
          "activation_step_completed",
          "activation_completed",
        ],
      ),
      trendInsight(
        "community-starts",
        "Community starts",
        "Tracks user identification, trials, and new community creation.",
        ["user_identified", "community_created", "trial_started"],
      ),
      trendInsight(
        "activation-work-items",
        "Activation work items",
        "Tracks setup tasks that move a board from empty account to usable system.",
        ["chart_of_accounts_seeded", "homeowner_imported", "reserve_imported"],
      ),
      trendInsight(
        "invite-health",
        "Invite health",
        "Tracks invite sends, failures, copied links, and invitation accept outcomes.",
        [
          "member_invited",
          "member_invite_failed",
          "member_invite_link_copied",
          "invitation_accept_failed",
          "invitation_accept_completed",
        ],
      ),
    ],
  },
  {
    key: "revenue-billing",
    name: "Gavelhouse Revenue and Billing",
    description:
      "Checkout starts, completed revenue moments, billing portal health, plan changes, and churn.",
    insights: [
      funnelInsight(
        "checkout-funnel",
        "Checkout funnel",
        "Tracks checkout intent through completed checkout.",
        ["checkout_started", "billing_checkout_started", "checkout_completed"],
      ),
      trendInsight(
        "billing-outcomes",
        "Billing outcomes",
        "Tracks checkout starts, completions, and failures.",
        [
          "billing_checkout_started",
          "billing_checkout_completed",
          "billing_checkout_failed",
          "billing_portal_failed",
        ],
      ),
      trendInsight(
        "subscription-lifecycle",
        "Subscription lifecycle",
        "Tracks paid subscription starts, upgrades, cancellations, and cancellation flow outcomes.",
        [
          "subscription_started",
          "subscription_upgraded",
          "subscription_cancelled",
          "subscription_cancellation_requested",
          "subscription_cancellation_completed",
          "subscription_cancellation_failed",
        ],
      ),
      trendInsight(
        "billing-cycle-changes",
        "Billing cycle changes",
        "Tracks monthly versus annual billing preference changes.",
        ["billing_cycle_changed", "pricing_tier_selected"],
      ),
    ],
  },
  {
    key: "feature-adoption",
    name: "Gavelhouse Feature Adoption",
    description:
      "Finance, banking, reports, month-end close, portfolio, governance, and owner portal feature usage.",
    insights: [
      trendInsight(
        "finance-adoption",
        "Finance adoption",
        "Tracks accounts, reserves, dues, payments, journal entries, and reconciliation usage.",
        [
          "account_created",
          "account_updated",
          "reserve_allocation_updated",
          "dues_batch_created",
          "dues_payment_started",
          "dues_payment_recorded",
          "journal_entry_posted",
          "reconciliation_completed",
        ],
      ),
      trendInsight(
        "banking-adoption",
        "Banking adoption",
        "Tracks statement upload and reconciliation matching outcomes.",
        [
          "bank_statement_uploaded",
          "bank_statement_upload_failed",
          "bank_reconciliation_match_created",
          "bank_reconciliation_match_deleted",
          "bank_reconciliation_finalize_failed",
          "bank_reconciliation_finalized",
        ],
      ),
      trendInsight(
        "report-and-close-adoption",
        "Reports and close adoption",
        "Tracks report views, exports, audit packs, and close progress.",
        [
          "report_viewed",
          "report_load_failed",
          "report_filter_changed",
          "report_export_downloaded",
          "report_export_failed",
          "audit_pack_downloaded",
          "audit_pack_download_failed",
          "close_started",
          "close_step_updated",
          "close_completed",
        ],
      ),
      trendInsight(
        "portfolio-adoption",
        "Portfolio adoption",
        "Tracks portfolio creation, edits, rollups, and community links.",
        [
          "portfolio_rollup_viewed",
          "portfolio_created",
          "portfolio_renamed",
          "portfolio_deleted",
          "portfolio_community_linked",
          "portfolio_community_unlinked",
        ],
      ),
      trendInsight(
        "governance-adoption",
        "Governance adoption",
        "Tracks transitions, governance records, meetings, votes, violations, photos, and owner portal flows.",
        governanceEvents,
      ),
    ],
  },
  {
    key: "operational-quality",
    name: "Gavelhouse Operational Quality",
    description:
      "Every tracked event, API errors, role denials, support outcomes, feedback, and health signals.",
    insights: [
      hogQlInsight(
        "all-event-volume-by-name",
        "All event volume by name",
        "Shows every canonical event emitted by the system, grouped by event name.",
        AnalyticsEventName.options,
        `SELECT event, count() AS events
FROM events
WHERE event IN (${AnalyticsEventName.options
          .map((eventName) => `'${eventName}'`)
          .join(", ")})
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY event
ORDER BY events DESC`,
      ),
      trendInsight(
        "api-and-access-errors",
        "API and access errors",
        "Tracks API errors, report load failures, feature access denials, and export failures.",
        [
          "api_error",
          "feature_access_denied",
          "report_load_failed",
          "report_export_failed",
          "audit_pack_download_failed",
        ],
      ),
      trendInsight(
        "help-and-support",
        "Help and support",
        "Tracks help usage, support widget messages, replies, proxy success, and failures.",
        [
          "help_search_performed",
          "help_category_selected",
          "help_topic_opened",
          "help_role_path_opened",
          "ai_support_message_sent",
          "ai_support_reply_received",
          "ai_support_message_failed",
          "ai_support_proxy_succeeded",
          "ai_support_proxy_failed",
        ],
      ),
      trendInsight(
        "upload-and-integration-failures",
        "Upload and integration failures",
        "Tracks upload, billing, owner portal, and reconciliation failure signals.",
        [
          "bank_statement_upload_failed",
          "bank_reconciliation_finalize_failed",
          "billing_checkout_failed",
          "billing_portal_failed",
          "owner_portal_payment_failed",
          "owner_portal_arch_request_failed",
        ],
      ),
      trendInsight(
        "feedback",
        "Feedback",
        "Tracks feedback channel availability and direct feedback submissions.",
        [
          "feedback_widget_loaded",
          "feedback_widget_unavailable",
          "feedback_widget_load_failed",
          "feedback_submitted",
        ],
      ),
    ],
  },
] as const satisfies readonly PostHogDashboardDefinition[];

export function buildPostHogDashboardPlan(): PostHogDashboardPlan {
  return {
    dashboards: POSTHOG_DASHBOARD_DEFINITIONS.map((dashboard) => ({
      key: dashboard.key,
      name: dashboard.name,
      description: dashboard.description,
    })),
    insights: POSTHOG_DASHBOARD_DEFINITIONS.flatMap((dashboard) =>
      dashboard.insights.map((insight) => ({
        dashboardKey: dashboard.key,
        key: `${dashboard.key}__${insight.key}`,
        name: insight.name,
        description: insight.description,
        query: insight.query,
        tags: [PRODUCT_TAG, ANALYTICS_TAG, dashboard.key],
      })),
    ),
  };
}

export function parsePostHogDashboardArgs(
  args: string[],
): PostHogDashboardArgs {
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");

  if (apply === dryRun) {
    throw new Error("Pass exactly one of --dry-run or --apply.");
  }

  const unknown = args.filter(
    (arg) => arg !== "--apply" && arg !== "--dry-run",
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  }

  return { apply };
}

export function resolvePostHogConfig(env: NodeJS.ProcessEnv): PostHogConfig {
  const personalApiKey = env.POSTHOG_PERSONAL_API_KEY;
  const projectId = env.POSTHOG_PROJECT_ID;
  const environmentId = env.POSTHOG_ENVIRONMENT_ID ?? projectId;

  if (!personalApiKey) {
    throw new Error("POSTHOG_PERSONAL_API_KEY is required for --apply.");
  }
  if (!projectId) {
    throw new Error("POSTHOG_PROJECT_ID is required for --apply.");
  }
  if (!environmentId) {
    throw new Error("POSTHOG_ENVIRONMENT_ID is required for --apply.");
  }

  return {
    apiHost: normalizePrivateApiHost(env.POSTHOG_API_HOST),
    environmentId,
    personalApiKey,
    projectId,
  };
}

export function createPostHogDashboardSync({
  config,
  fetchImpl = fetch,
  plan = buildPostHogDashboardPlan(),
}: {
  config: PostHogConfig;
  fetchImpl?: FetchLike;
  plan?: PostHogDashboardPlan;
}): { apply: () => Promise<PostHogSyncResult> } {
  return {
    async apply() {
      const result: PostHogSyncResult = {
        createdDashboards: [],
        updatedDashboards: [],
        createdInsights: [],
        updatedInsights: [],
      };
      const dashboards = await listAll<PostHogNamedResource>(
        fetchImpl,
        config,
        `/api/environments/${config.environmentId}/dashboards/`,
      );
      const insights = await listAll<PostHogNamedResource>(
        fetchImpl,
        config,
        `/api/environments/${config.environmentId}/insights/`,
      );

      const dashboardByKey = new Map<string, PostHogNamedResource>();
      for (const dashboard of plan.dashboards) {
        const existing = dashboards.find(
          (item) => item.name === dashboard.name,
        );
        if (existing) {
          await requestJson(fetchImpl, config, {
            body: {
              description: dashboard.description,
              name: dashboard.name,
              pinned: true,
            },
            method: "PATCH",
            path: `/api/environments/${config.environmentId}/dashboards/${existing.id}/`,
          });
          dashboardByKey.set(dashboard.key, existing);
          result.updatedDashboards.push(dashboard.name);
          continue;
        }

        const created = await requestJson<PostHogNamedResource>(
          fetchImpl,
          config,
          {
            body: {
              name: dashboard.name,
              description: dashboard.description,
              pinned: true,
            },
            method: "POST",
            path: `/api/environments/${config.environmentId}/dashboards/`,
          },
        );
        dashboardByKey.set(dashboard.key, created);
        result.createdDashboards.push(dashboard.name);
      }

      for (const insight of plan.insights) {
        const dashboard = dashboardByKey.get(insight.dashboardKey);
        if (!dashboard) {
          throw new Error(`Dashboard ${insight.dashboardKey} was not synced.`);
        }

        const body = {
          dashboards: [dashboard.id],
          description: insight.description,
          name: insight.name,
          query: toInsightVizNode(insight.query),
          tags: insight.tags,
        };
        const existing = insights.find((item) => item.name === insight.name);
        if (existing) {
          await requestJson(fetchImpl, config, {
            body,
            method: "PATCH",
            path: `/api/environments/${config.environmentId}/insights/${existing.id}/`,
          });
          result.updatedInsights.push(insight.name);
          continue;
        }

        await requestJson(fetchImpl, config, {
          body,
          method: "POST",
          path: `/api/environments/${config.environmentId}/insights/`,
        });
        result.createdInsights.push(insight.name);
      }

      return result;
    },
  };
}

export function describePostHogDashboardPlan(
  plan = buildPostHogDashboardPlan(),
): string {
  return plan.dashboards
    .map((dashboard) => {
      const insightCount = plan.insights.filter(
        (insight) => insight.dashboardKey === dashboard.key,
      ).length;
      return `- ${dashboard.name}: ${insightCount} insights`;
    })
    .join("\n");
}

function trendInsight(
  key: string,
  name: string,
  description: string,
  events: readonly AnalyticsEventNameType[],
): PostHogInsightDefinition {
  return {
    key,
    name,
    description,
    events,
    query: {
      kind: "TrendsQuery",
      dateRange: { date_from: "-30d" },
      interval: "day",
      series: events.map(eventNode),
      trendsFilter: { display: "ActionsLineGraph" },
    },
  };
}

function funnelInsight(
  key: string,
  name: string,
  description: string,
  events: readonly AnalyticsEventNameType[],
): PostHogInsightDefinition {
  return {
    key,
    name,
    description,
    events,
    query: {
      kind: "FunnelsQuery",
      dateRange: { date_from: "-30d" },
      funnelsFilter: { layout: "horizontal" },
      series: events.map(eventNode),
    },
  };
}

function hogQlInsight(
  key: string,
  name: string,
  description: string,
  events: readonly AnalyticsEventNameType[],
  query: string,
): PostHogInsightDefinition {
  return {
    key,
    name,
    description,
    events,
    query: {
      kind: "HogQLQuery",
      query,
    },
  };
}

function toInsightVizNode(source: JsonObject): JsonObject {
  return {
    kind: "InsightVizNode",
    source,
  };
}

function eventNode(event: AnalyticsEventNameType): JsonObject {
  return {
    event,
    kind: "EventsNode",
    name: event,
  };
}

function normalizePrivateApiHost(host: string | undefined): string {
  if (
    !host ||
    host === "https://app.posthog.com" ||
    host === "https://us.i.posthog.com"
  ) {
    return DEFAULT_PRIVATE_API_HOST;
  }
  if (host === "https://eu.i.posthog.com") {
    return "https://eu.posthog.com";
  }
  return host.replace(/\/$/, "");
}

async function listAll<T extends PostHogNamedResource>(
  fetchImpl: FetchLike,
  config: PostHogConfig,
  path: string,
): Promise<T[]> {
  const results: T[] = [];
  let nextPath: string | null = path;
  while (nextPath) {
    const page: PostHogListResponse<T> = await requestJson<
      PostHogListResponse<T>
    >(fetchImpl, config, {
      method: "GET",
      path: nextPath,
    });
    results.push(...(page.results ?? []));
    nextPath = page.next ? paginationPath(page.next, config.apiHost) : null;
  }
  return results;
}

function paginationPath(nextUrl: string, apiHost: string): string {
  const parsed = new URL(nextUrl);
  const expected = new URL(apiHost);
  if (parsed.origin !== expected.origin) {
    throw new Error(
      `PostHog pagination crossed host boundary: ${parsed.origin}`,
    );
  }
  return `${parsed.pathname}${parsed.search}`;
}

async function requestJson<T = JsonObject>(
  fetchImpl: FetchLike,
  config: PostHogConfig,
  request: {
    body?: JsonObject;
    method: "GET" | "PATCH" | "POST";
    path: string;
  },
): Promise<T> {
  const response = await fetchImpl(`${config.apiHost}${request.path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${config.personalApiKey}`,
      "Content-Type": "application/json",
    },
    ...(request.body ? { body: JSON.stringify(request.body) } : {}),
  });

  if (!response.ok) {
    throw new Error(
      `PostHog ${request.method} ${request.path} failed with ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}
