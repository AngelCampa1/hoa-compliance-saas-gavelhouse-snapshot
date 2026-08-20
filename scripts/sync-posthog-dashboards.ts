import {
  buildPostHogDashboardPlan,
  createPostHogDashboardSync,
  describePostHogDashboardPlan,
  parsePostHogDashboardArgs,
  resolvePostHogConfig,
} from "./lib/posthog-dashboards";

async function main(): Promise<void> {
  const { apply } = parsePostHogDashboardArgs(process.argv.slice(2));
  const plan = buildPostHogDashboardPlan();

  if (!apply) {
    console.log("PostHog dashboard dry run:");
    console.log(describePostHogDashboardPlan(plan));
    console.log(
      "Run with --apply and POSTHOG_PERSONAL_API_KEY plus POSTHOG_PROJECT_ID to sync.",
    );
    return;
  }

  const sync = createPostHogDashboardSync({
    config: resolvePostHogConfig(process.env),
    plan,
  });
  const result = await sync.apply();

  console.log(`Created dashboards: ${result.createdDashboards.length}`);
  console.log(`Updated dashboards: ${result.updatedDashboards.length}`);
  console.log(`Created insights: ${result.createdInsights.length}`);
  console.log(`Updated insights: ${result.updatedInsights.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
