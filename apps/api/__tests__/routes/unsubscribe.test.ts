import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../src/types/env.js";

const mockEnv: Env = {
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:8060",
  APP_URL: "http://localhost:3060",
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
  STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual",
  STRIPE_PRICE_GROWTH_MONTHLY: "price_growth_monthly",
  STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_annual",
  STRIPE_PRICE_SCALE_MONTHLY: "price_scale_monthly",
  STRIPE_PRICE_SCALE_ANNUAL: "price_scale_annual",
  STRIPE_PRICE_PORTFOLIO_MONTHLY: "price_portfolio_monthly",
  STRIPE_PRICE_PORTFOLIO_ANNUAL: "price_portfolio_annual",
  RESEND_API_KEY: "resend_test",
  POSTHOG_KEY: "phc_test_key",
  PUBLIC_WEB_URL: "https://gavelhouse.app",
};

type LeadRow = {
  id: string;
  email: string;
  unsubscribeToken: string;
  unsubscribedAt: Date | null;
};

interface DbState {
  existingLead: LeadRow | null;
  leadUpdateCalled: boolean;
  lastUpdateSet: Record<string, unknown> | null;
}

const dbState: DbState = {
  existingLead: null,
  leadUpdateCalled: false,
  lastUpdateSet: null,
};

const mockCaptureEvent: ReturnType<
  typeof vi.fn<
    (
      name: string,
      props: Record<string, unknown>,
      distinctId: string | undefined,
      env: Env | undefined,
    ) => Promise<void>
  >
> = vi.fn(async () => {
  // default: success
});

vi.mock("../../src/lib/observability.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/observability.js")
  >("../../src/lib/observability.js");
  return {
    ...actual,
    captureEvent: (...args: unknown[]) =>
      mockCaptureEvent(...(args as Parameters<typeof mockCaptureEvent>)),
  };
});

const mockUnsubscribeSequencerContact = vi.fn(
  async (_env: unknown, _email: unknown, _metadata: unknown) => true,
);

vi.mock("../../src/lib/sequencer.js", () => ({
  unsubscribeSequencerContact: (...args: unknown[]) =>
    mockUnsubscribeSequencerContact(args[0], args[1], args[2]),
}));

vi.mock("../../src/db/client.js", () => {
  const createDb = vi.fn(() => {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve(
                dbState.existingLead ? [dbState.existingLead] : [],
              ),
            ),
          })),
        })),
      })),
      update: vi.fn((table: { __name?: string }) => {
        const tableName = table.__name ?? "unknown";
        return {
          set: vi.fn((values: Record<string, unknown>) => {
            if (tableName === "leads") {
              dbState.leadUpdateCalled = true;
              dbState.lastUpdateSet = values;
            }
            return {
              where: vi.fn(async () => undefined),
            };
          }),
        };
      }),
    };
  });
  return { createDb };
});

vi.mock("../../src/db/schema/index.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/db/schema/index.js")
  >("../../src/db/schema/index.js");
  return {
    ...actual,
    leads: Object.assign({}, actual.leads, { __name: "leads" }),
  };
});

const unsubscribeModule = await import("../../src/routes/unsubscribe.js");
const unsubscribeApp = unsubscribeModule.default;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/unsubscribe", unsubscribeApp);
  return app;
}

async function get(path: string, env: Env = mockEnv): Promise<Response> {
  const req = new Request(`http://localhost${path}`);
  return makeApp().fetch(req, env);
}

function resetDb() {
  dbState.existingLead = null;
  dbState.leadUpdateCalled = false;
  dbState.lastUpdateSet = null;
}

const validUuid = "11111111-1111-4111-8111-111111111111";

describe("GET /unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    mockCaptureEvent.mockImplementation(async () => {
      // default: success
    });
  });

  it("302 redirects to /unsubscribed and updates lead + enrollments for a valid token", async () => {
    dbState.existingLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: validUuid,
      unsubscribedAt: null,
    };

    const res = await get(`/unsubscribe?token=${validUuid}`);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://gavelhouse.app/unsubscribed",
    );
    expect(dbState.leadUpdateCalled).toBe(true);
    expect(dbState.lastUpdateSet).toHaveProperty("unsubscribedAt");
    expect(mockUnsubscribeSequencerContact).toHaveBeenCalledWith(
      mockEnv,
      "board@example.com",
      { leadId: "lead-1" },
    );
    expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
    expect(mockCaptureEvent.mock.calls[0][0]).toBe("lead_unsubscribed");
  });

  it("302 redirects to /unsubscribed?error=invalid when token is not a UUID", async () => {
    const res = await get(`/unsubscribe?token=not-a-uuid`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://gavelhouse.app/unsubscribed?error=invalid",
    );
    expect(dbState.leadUpdateCalled).toBe(false);
    expect(mockUnsubscribeSequencerContact).not.toHaveBeenCalled();
  });

  it("302 redirects to /unsubscribed?error=invalid when token is missing", async () => {
    const res = await get(`/unsubscribe`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://gavelhouse.app/unsubscribed?error=invalid",
    );
  });

  it("302 redirects legacy signup unsubscribe links to the invalid unsubscribe page", async () => {
    const res = await get(`/unsubscribe/signup`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://gavelhouse.app/unsubscribed?error=invalid",
    );
    expect(dbState.leadUpdateCalled).toBe(false);
    expect(mockUnsubscribeSequencerContact).not.toHaveBeenCalled();
  });

  it("falls back to default PUBLIC_WEB_URL for legacy signup unsubscribe links", async () => {
    const env: Env = { ...mockEnv, PUBLIC_WEB_URL: undefined };
    const res = await get(`/unsubscribe/signup`, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://gavelhouse.app/unsubscribed?error=invalid",
    );
    expect(dbState.leadUpdateCalled).toBe(false);
    expect(mockUnsubscribeSequencerContact).not.toHaveBeenCalled();
  });

  it("302 redirects to /unsubscribed?error=invalid when lead not found", async () => {
    dbState.existingLead = null;
    const res = await get(`/unsubscribe?token=${validUuid}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://gavelhouse.app/unsubscribed?error=invalid",
    );
    expect(dbState.leadUpdateCalled).toBe(false);
  });

  it("is idempotent for an already-unsubscribed lead — does not overwrite unsubscribedAt", async () => {
    dbState.existingLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: validUuid,
      unsubscribedAt: new Date("2025-01-01T00:00:00Z"),
    };

    const res = await get(`/unsubscribe?token=${validUuid}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://gavelhouse.app/unsubscribed",
    );
    // Critical: the original unsubscribedAt timestamp is preserved as the
    // record-of-request for CAN-SPAM audit purposes.
    expect(dbState.leadUpdateCalled).toBe(false);
    expect(mockUnsubscribeSequencerContact).not.toHaveBeenCalled();
  });

  it("swallows PostHog errors without failing the redirect", async () => {
    dbState.existingLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: validUuid,
      unsubscribedAt: null,
    };
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await get(`/unsubscribe?token=${validUuid}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://gavelhouse.app/unsubscribed",
    );
  });

  it("falls back to default PUBLIC_WEB_URL when env is unset", async () => {
    const env: Env = { ...mockEnv, PUBLIC_WEB_URL: undefined };
    const res = await get(`/unsubscribe?token=bogus`, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://gavelhouse.app/unsubscribed?error=invalid",
    );
  });

  it("falls back to default PUBLIC_WEB_URL for a successful unsubscribe when env is unset", async () => {
    const env: Env = { ...mockEnv, PUBLIC_WEB_URL: undefined };
    dbState.existingLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: validUuid,
      unsubscribedAt: null,
    };

    const res = await get(`/unsubscribe?token=${validUuid}`, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://gavelhouse.app/unsubscribed",
    );
    expect(mockUnsubscribeSequencerContact).toHaveBeenCalledWith(
      env,
      "board@example.com",
      { leadId: "lead-1" },
    );
  });
});
