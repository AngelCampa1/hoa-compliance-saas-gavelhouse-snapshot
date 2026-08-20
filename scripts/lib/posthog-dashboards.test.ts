import { describe, expect, it, vi } from "vitest";
import { AnalyticsEventName } from "../../packages/shared/src/analytics/events";
import {
  POSTHOG_DASHBOARD_DEFINITIONS,
  buildPostHogDashboardPlan,
  createPostHogDashboardSync,
  describePostHogDashboardPlan,
  parsePostHogDashboardArgs,
  resolvePostHogConfig,
} from "./posthog-dashboards";

describe("PostHog dashboard manifest", () => {
  it("covers every canonical analytics event in at least one dashboard insight", () => {
    const coveredEvents = new Set(
      POSTHOG_DASHBOARD_DEFINITIONS.flatMap((dashboard) =>
        dashboard.insights.flatMap((insight) => insight.events),
      ),
    );

    for (const eventName of AnalyticsEventName.options) {
      expect(coveredEvents, `${eventName} is not dashboarded`).toContain(
        eventName,
      );
    }
  });

  it("groups insights into decision-oriented product and business dashboards", () => {
    expect(
      POSTHOG_DASHBOARD_DEFINITIONS.map((dashboard) => dashboard.key),
    ).toEqual([
      "growth-funnel",
      "activation-retention",
      "revenue-billing",
      "feature-adoption",
      "operational-quality",
    ]);

    for (const dashboard of POSTHOG_DASHBOARD_DEFINITIONS) {
      expect(dashboard.name).toMatch(/^Gavelhouse /);
      expect(dashboard.insights.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("builds deterministic dashboard and insight payloads", () => {
    const plan = buildPostHogDashboardPlan();

    expect(plan.dashboards[0]).toMatchObject({
      key: "growth-funnel",
      name: "Gavelhouse Growth Funnel",
      description: expect.stringContaining("Acquisition"),
    });
    expect(plan.insights[0]).toMatchObject({
      dashboardKey: "growth-funnel",
      key: "growth-funnel__marketing-to-signup-funnel",
      name: "Marketing to signup funnel",
      tags: ["gavelhouse", "analytics-as-code", "growth-funnel"],
    });
  });

  it("describes dashboard dry-run counts for operators", () => {
    expect(describePostHogDashboardPlan()).toContain(
      "- Gavelhouse Growth Funnel: 5 insights",
    );
    expect(describePostHogDashboardPlan()).toContain(
      "- Gavelhouse Operational Quality: 5 insights",
    );
  });
});

describe("PostHog dashboard sync config", () => {
  it("parses dry-run and apply flags", () => {
    expect(parsePostHogDashboardArgs(["--dry-run"]).apply).toBe(false);
    expect(parsePostHogDashboardArgs(["--apply"]).apply).toBe(true);
  });

  it("requires explicit apply or dry-run mode", () => {
    expect(() => parsePostHogDashboardArgs([])).toThrow(/--dry-run/);
  });

  it("rejects conflicting or unknown flags", () => {
    expect(() => parsePostHogDashboardArgs(["--apply", "--dry-run"])).toThrow(
      /exactly one/,
    );
    expect(() => parsePostHogDashboardArgs(["--apply", "--force"])).toThrow(
      /Unknown arguments/,
    );
  });

  it("resolves the US private PostHog API host by default", () => {
    const config = resolvePostHogConfig({
      POSTHOG_PERSONAL_API_KEY: "phx_test",
      POSTHOG_PROJECT_ID: "123",
    });

    expect(config).toEqual({
      apiHost: "https://us.posthog.com",
      environmentId: "123",
      personalApiKey: "phx_test",
      projectId: "123",
    });
  });

  it("normalizes ingest and app hosts to the private US API host", () => {
    const fromIngest = resolvePostHogConfig({
      POSTHOG_API_HOST: "https://us.i.posthog.com",
      POSTHOG_PERSONAL_API_KEY: "phx_test",
      POSTHOG_PROJECT_ID: "123",
    });
    const fromApp = resolvePostHogConfig({
      POSTHOG_API_HOST: "https://app.posthog.com",
      POSTHOG_PERSONAL_API_KEY: "phx_test",
      POSTHOG_PROJECT_ID: "123",
    });

    expect(fromIngest.apiHost).toBe("https://us.posthog.com");
    expect(fromApp.apiHost).toBe("https://us.posthog.com");
  });

  it("normalizes EU ingest hosts and trims custom private hosts", () => {
    expect(
      resolvePostHogConfig({
        POSTHOG_API_HOST: "https://eu.i.posthog.com",
        POSTHOG_PERSONAL_API_KEY: "phx_test",
        POSTHOG_PROJECT_ID: "123",
      }).apiHost,
    ).toBe("https://eu.posthog.com");
    expect(
      resolvePostHogConfig({
        POSTHOG_API_HOST: "https://posthog.example.com/",
        POSTHOG_PERSONAL_API_KEY: "phx_test",
        POSTHOG_PROJECT_ID: "123",
      }).apiHost,
    ).toBe("https://posthog.example.com");
  });

  it("fails fast when apply mode lacks credentials", () => {
    expect(() => resolvePostHogConfig({ POSTHOG_PROJECT_ID: "123" })).toThrow(
      /POSTHOG_PERSONAL_API_KEY/,
    );
    expect(() =>
      resolvePostHogConfig({ POSTHOG_PERSONAL_API_KEY: "phx_test" }),
    ).toThrow(/POSTHOG_PROJECT_ID/);
    expect(() =>
      resolvePostHogConfig({
        POSTHOG_ENVIRONMENT_ID: "",
        POSTHOG_PERSONAL_API_KEY: "phx_test",
        POSTHOG_PROJECT_ID: "123",
      }),
    ).toThrow(/POSTHOG_ENVIRONMENT_ID/);
  });
});

describe("PostHog dashboard sync runner", () => {
  it("creates missing dashboards and attaches missing insights", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockImplementation(() => Promise.resolve(jsonResponse({ id: 10 })));

    const sync = createPostHogDashboardSync({
      config: {
        apiHost: "https://us.posthog.com",
        environmentId: "123",
        personalApiKey: "phx_test",
        projectId: "123",
      },
      fetchImpl: fetchMock,
      plan: {
        dashboards: [
          {
            description: "Growth",
            key: "growth-funnel",
            name: "Gavelhouse Growth Funnel",
          },
        ],
        insights: [
          {
            dashboardKey: "growth-funnel",
            description: "Signup funnel",
            key: "growth-funnel__signup",
            name: "Signup funnel",
            query: {
              kind: "FunnelsQuery",
              series: [{ event: "signup_started", kind: "EventsNode" }],
            },
            tags: ["gavelhouse", "analytics-as-code", "growth-funnel"],
          },
        ],
      },
    });

    const result = await sync.apply();

    expect(result.createdDashboards).toEqual(["Gavelhouse Growth Funnel"]);
    expect(result.createdInsights).toEqual(["Signup funnel"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://us.posthog.com/api/environments/123/dashboards/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Gavelhouse Growth Funnel",
          description: "Growth",
          pinned: true,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://us.posthog.com/api/environments/123/insights/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          dashboards: [10],
          description: "Signup funnel",
          name: "Signup funnel",
          query: {
            kind: "InsightVizNode",
            source: {
              kind: "FunnelsQuery",
              series: [{ event: "signup_started", kind: "EventsNode" }],
            },
          },
          tags: ["gavelhouse", "analytics-as-code", "growth-funnel"],
        }),
      }),
    );
  });

  it("updates existing dashboards and insights by name", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: 10, name: "Gavelhouse Growth Funnel" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 20, name: "Signup funnel" }] }),
      )
      .mockImplementation(() => Promise.resolve(jsonResponse({ id: 10 })));

    const sync = createPostHogDashboardSync({
      config: {
        apiHost: "https://us.posthog.com",
        environmentId: "123",
        personalApiKey: "phx_test",
        projectId: "123",
      },
      fetchImpl: fetchMock,
      plan: {
        dashboards: [
          {
            description: "Growth",
            key: "growth-funnel",
            name: "Gavelhouse Growth Funnel",
          },
        ],
        insights: [
          {
            dashboardKey: "growth-funnel",
            description: "Signup funnel",
            key: "growth-funnel__signup",
            name: "Signup funnel",
            query: { kind: "TrendsQuery", series: [] },
            tags: ["gavelhouse", "analytics-as-code", "growth-funnel"],
          },
        ],
      },
    });

    const result = await sync.apply();

    expect(result.updatedDashboards).toEqual(["Gavelhouse Growth Funnel"]);
    expect(result.updatedInsights).toEqual(["Signup funnel"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://us.posthog.com/api/environments/123/dashboards/10/",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://us.posthog.com/api/environments/123/insights/20/",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"kind":"InsightVizNode"'),
      }),
    );
  });

  it("follows paginated PostHog list responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          next: "https://us.posthog.com/api/environments/123/dashboards/?offset=100",
          results: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: 10, name: "Gavelhouse Growth Funnel" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 20, name: "Signup funnel" }] }),
      )
      .mockImplementation(() => Promise.resolve(jsonResponse({ id: 10 })));

    const sync = createPostHogDashboardSync({
      config: {
        apiHost: "https://us.posthog.com",
        environmentId: "123",
        personalApiKey: "phx_test",
        projectId: "123",
      },
      fetchImpl: fetchMock,
      plan: {
        dashboards: [
          {
            description: "Growth",
            key: "growth-funnel",
            name: "Gavelhouse Growth Funnel",
          },
        ],
        insights: [
          {
            dashboardKey: "growth-funnel",
            description: "Signup funnel",
            key: "growth-funnel__signup",
            name: "Signup funnel",
            query: { kind: "TrendsQuery", series: [] },
            tags: ["gavelhouse", "analytics-as-code", "growth-funnel"],
          },
        ],
      },
    });

    await sync.apply();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://us.posthog.com/api/environments/123/dashboards/?offset=100",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects paginated PostHog list responses that cross hosts", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        next: "https://evil.example.com/api/environments/123/dashboards/?offset=100",
        results: [],
      }),
    );

    const sync = createPostHogDashboardSync({
      config: {
        apiHost: "https://us.posthog.com",
        environmentId: "123",
        personalApiKey: "phx_test",
        projectId: "123",
      },
      fetchImpl: fetchMock,
      plan: { dashboards: [], insights: [] },
    });

    await expect(sync.apply()).rejects.toThrow(/crossed host boundary/);
  });

  it("surfaces failed PostHog API responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("nope", {
        status: 401,
      }),
    );

    const sync = createPostHogDashboardSync({
      config: {
        apiHost: "https://us.posthog.com",
        environmentId: "123",
        personalApiKey: "phx_test",
        projectId: "123",
      },
      fetchImpl: fetchMock,
      plan: { dashboards: [], insights: [] },
    });

    await expect(sync.apply()).rejects.toThrow(/PostHog GET .*dashboards.*401/);
  });

  it("fails when an insight references a dashboard that was not synced", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));

    const sync = createPostHogDashboardSync({
      config: {
        apiHost: "https://us.posthog.com",
        environmentId: "123",
        personalApiKey: "phx_test",
        projectId: "123",
      },
      fetchImpl: fetchMock,
      plan: {
        dashboards: [],
        insights: [
          {
            dashboardKey: "missing-dashboard",
            description: "Broken plan",
            key: "broken",
            name: "Broken plan",
            query: { kind: "TrendsQuery", series: [] },
            tags: ["gavelhouse", "analytics-as-code", "missing-dashboard"],
          },
        ],
      },
    });

    await expect(sync.apply()).rejects.toThrow(
      /Dashboard missing-dashboard was not synced/,
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
