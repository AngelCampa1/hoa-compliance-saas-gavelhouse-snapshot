import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { LEAD_MAGNET_SLUGS } from "@boardstack/shared";
import type { Env } from "../../src/types/env.js";
import type { SendLeadMagnetEmailInput } from "../../src/lib/leadMagnetMailer.js";

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
  PUBLIC_API_URL: "https://api.gavelhouse.app",
  LEAD_MAGNET_DOWNLOAD_SECRET: "test-download-secret",
  COMPANY_POSTAL_ADDRESS: "Gavelhouse, 123 Test St, Testville, CA 94000",
};

// State container mutated by individual tests to control how the mocked
// database behaves on each call.
type LeadRow = {
  id: string;
  email: string;
  unsubscribeToken: string;
  unsubscribedAt: Date | null;
  surveyToken?: string;
  surveyCompletedAt?: Date | null;
  sourcePage?: string | null;
  posthogDistinctId?: string | null;
};

type DownloadInsertResult = LeadRow | undefined;

interface DbState {
  existingLead: LeadRow | null;
  leadAfterInsertConflict: LeadRow | null;
  insertedLead: LeadRow | null;
  insertLeadError: unknown;
  leadSelectCount: number;
  downloadInserted: boolean;
  leadUpdateCalled: boolean;
  surveyUpdateReturnedRows: Array<{ id: string }>;
  lastDownloadValues: Record<string, unknown> | null;
  lastLeadUpdateSet: Record<string, unknown> | null;
}

const dbState: DbState = {
  existingLead: null,
  leadAfterInsertConflict: null,
  insertedLead: null,
  insertLeadError: null,
  leadSelectCount: 0,
  downloadInserted: false,
  leadUpdateCalled: false,
  surveyUpdateReturnedRows: [{ id: "lead-survey" }],
  lastDownloadValues: null,
  lastLeadUpdateSet: null,
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
  // default: no-op success
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

const mockSendLeadMagnetEmail: ReturnType<
  typeof vi.fn<(input: SendLeadMagnetEmailInput) => Promise<void>>
> = vi.fn(async () => {
  // default: no-op success
});

vi.mock("../../src/lib/leadMagnetMailer.js", () => ({
  sendLeadMagnetEmail: (...args: unknown[]) =>
    mockSendLeadMagnetEmail(
      ...(args as Parameters<typeof mockSendLeadMagnetEmail>),
    ),
}));

const mockEnrollSequencerSequence = vi.fn(
  async (_env: unknown, _input: unknown) => true,
);

vi.mock("../../src/lib/sequencer.js", () => ({
  enrollSequencerSequence: (...args: unknown[]) =>
    mockEnrollSequencerSequence(args[0], args[1]),
}));

vi.mock("../../src/db/client.js", () => {
  const createDb = vi.fn(() => {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockImplementation(() => {
              dbState.leadSelectCount += 1;
              const row =
                dbState.leadSelectCount > 1 && dbState.leadAfterInsertConflict
                  ? dbState.leadAfterInsertConflict
                  : dbState.existingLead;
              return Promise.resolve(row ? [row] : []);
            }),
          })),
        })),
      })),
      insert: vi.fn((table: { _leadTable?: boolean }) => {
        // Identify table by reference — we'll mark them on the schema mock.
        const tableName: string =
          (table as unknown as { __name?: string }).__name ?? "unknown";
        if (tableName === "leads") {
          return {
            values: vi.fn(() => ({
              returning: vi.fn(async () => {
                if (dbState.insertLeadError) throw dbState.insertLeadError;
                if (dbState.insertedLead) return [dbState.insertedLead];
                return [];
              }),
            })),
          };
        }
        if (tableName === "leadMagnetDownloads") {
          return {
            values: vi.fn((vals: Record<string, unknown>) => {
              dbState.lastDownloadValues = vals;
              return {
                onConflictDoNothing: vi.fn(() => ({
                  returning: vi.fn(
                    async (): Promise<DownloadInsertResult[]> => {
                      if (dbState.downloadInserted) {
                        return [
                          {
                            id: "dl-1",
                            email: "x",
                            unsubscribeToken: "x",
                            unsubscribedAt: null,
                          },
                        ];
                      }
                      return [];
                    },
                  ),
                })),
              };
            }),
          };
        }
        return {
          values: vi.fn(async () => undefined),
        };
      }),
      update: vi.fn((table: { __name?: string }) => {
        const tableName = table.__name ?? "unknown";
        return {
          set: vi.fn((values: Record<string, unknown>) => {
            if (tableName === "leads") {
              dbState.leadUpdateCalled = true;
              dbState.lastLeadUpdateSet = values;
            }
            if ("surveyAnswers" in values) {
              return {
                where: vi.fn(() => ({
                  returning: vi.fn(
                    async () => dbState.surveyUpdateReturnedRows,
                  ),
                })),
              };
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

// Controls whether buildSignedLeadMagnetDownloadUrl should throw in tests.
const leadMagnetDownloadsState = {
  buildSignedShouldThrow: false,
};

vi.mock("../../src/lib/leadMagnetDownloads.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/leadMagnetDownloads.js")
  >("../../src/lib/leadMagnetDownloads.js");
  return {
    ...actual,
    buildSignedLeadMagnetDownloadUrl: async (
      ...args: Parameters<typeof actual.buildSignedLeadMagnetDownloadUrl>
    ) => {
      if (leadMagnetDownloadsState.buildSignedShouldThrow) {
        throw new Error("Simulated URL signing failure");
      }
      return actual.buildSignedLeadMagnetDownloadUrl(...args);
    },
  };
});

// Provide a schema mock so inserts tag their table name.
vi.mock("../../src/db/schema/index.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/db/schema/index.js")
  >("../../src/db/schema/index.js");
  return {
    ...actual,
    leads: Object.assign({}, actual.leads, { __name: "leads" }),
    leadMagnetDownloads: Object.assign({}, actual.leadMagnetDownloads, {
      __name: "leadMagnetDownloads",
    }),
  };
});

const leadMagnetModule = await import("../../src/routes/leadMagnet.js");
const leadMagnetApp = leadMagnetModule.default;
const resetRateLimiter = leadMagnetModule.__resetRateLimiterForTests;

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/lead-magnets", leadMagnetApp);
  app.route("/waitlist", leadMagnetApp);
  return app;
}

async function jsonPost(
  path: string,
  body: unknown,
  env: Env = mockEnv,
  headers: Record<string, string> = {},
): Promise<Response> {
  const req = new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": "203.0.113.10",
      "user-agent": "test-agent/1.0",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return makeApp().fetch(req, env);
}

function resetDbState() {
  dbState.existingLead = null;
  dbState.leadAfterInsertConflict = null;
  dbState.insertedLead = null;
  dbState.insertLeadError = null;
  dbState.leadSelectCount = 0;
  dbState.downloadInserted = false;
  dbState.leadUpdateCalled = false;
  dbState.surveyUpdateReturnedRows = [{ id: "lead-survey" }];
  dbState.lastDownloadValues = null;
  dbState.lastLeadUpdateSet = null;
}

describe("POST /lead-magnets/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbState();
    resetRateLimiter();
    leadMagnetDownloadsState.buildSignedShouldThrow = false;
    mockCaptureEvent.mockImplementation(async () => {
      // default: success
    });
    mockSendLeadMagnetEmail.mockResolvedValue(undefined);
    mockEnrollSequencerSequence.mockResolvedValue(true);
  });

  it("returns 200 alreadySubscribed:false and enrolls on first-time subscribe", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: "unsub-1",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;

    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
      sourcePage: "https://gavelhouse.app/resources/reserve-fund-calculator",
      posthogDistinctId: "ph-1",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      downloadUrl: string;
      alreadySubscribed: boolean;
    };
    expect(body.alreadySubscribed).toBe(false);
    const downloadUrl = new URL(body.downloadUrl);
    expect(downloadUrl.origin).toBe("https://api.gavelhouse.app");
    expect(downloadUrl.pathname).toBe("/downloads/reserve-fund-calculator.pdf");
    expect(downloadUrl.searchParams.get("expires")).toMatch(/^\d+$/);
    expect(downloadUrl.searchParams.get("signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(mockEnrollSequencerSequence).toHaveBeenCalledWith(mockEnv, {
      email: "board@example.com",
      sequenceSlug: "boardstack-nurture-value-1",
      externalId: "lead-1:reserve-fund-calculator",
      metadata: expect.objectContaining({
        leadId: "lead-1",
        magnetSlug: "reserve-fund-calculator",
        sourcePage: "https://gavelhouse.app/resources/reserve-fund-calculator",
        posthogDistinctId: "ph-1",
        wasUnsubscribed: false,
      }),
    });
    expect(mockSendLeadMagnetEmail).toHaveBeenCalledTimes(1);
    expect(mockSendLeadMagnetEmail.mock.calls[0][0]).toMatchObject({
      to: "board@example.com",
      subject: "Your Reserve Fund Calculator is ready",
      magnetSlug: "reserve-fund-calculator",
      step: 0,
    });
    expect(mockSendLeadMagnetEmail.mock.calls[0][0]).not.toHaveProperty(
      "unsubscribeUrl",
    );
    expect(mockSendLeadMagnetEmail.mock.calls[0][0].enrollmentId).toMatch(
      /^lead-1:reserve-fund-calculator:\d+$/,
    );
    expect(mockCaptureEvent).toHaveBeenCalledTimes(3);
    // call[0]: lead_magnet_download_ready fires as soon as the URL is built
    expect(mockCaptureEvent.mock.calls[0]).toMatchObject([
      "lead_magnet_download_ready",
      { content_slug: "reserve-fund-calculator", already_subscribed: false },
      "ph-1",
      mockEnv,
    ]);
    // call[1]: lead_created fires inside the post-gate analytics block
    expect(mockCaptureEvent.mock.calls[1]).toMatchObject([
      "lead_created",
      {
        lead_type: "lead_magnet",
        content_slug: "reserve-fund-calculator",
        source_page: "https://gavelhouse.app/resources/reserve-fund-calculator",
      },
      "ph-1",
      mockEnv,
    ]);
    const [eventName, props, distinctId] = mockCaptureEvent.mock.calls[2];
    expect(eventName).toBe("lead_magnet_submitted");
    expect(props).toMatchObject({
      content_slug: "reserve-fund-calculator",
      source_page: "https://gavelhouse.app/resources/reserve-fund-calculator",
      already_subscribed: false,
    });
    expect(distinctId).toBe("ph-1");
  });

  it("recovers when a concurrent lead insert wins the email race", async () => {
    dbState.existingLead = null;
    dbState.insertLeadError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    dbState.leadAfterInsertConflict = {
      id: "lead-race",
      email: "board@example.com",
      unsubscribeToken: "unsub-race",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;

    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
      sourcePage: "https://gavelhouse.app/free/reserve-fund-calculator/",
    });

    expect(res.status).toBe(200);
    expect(dbState.lastDownloadValues).toMatchObject({
      leadId: "lead-race",
      magnetSlug: "reserve-fund-calculator",
    });
    expect(mockSendLeadMagnetEmail.mock.calls[0][0]).toMatchObject({
      to: "board@example.com",
    });
    expect(mockSendLeadMagnetEmail.mock.calls[0][0]).not.toHaveProperty(
      "unsubscribeUrl",
    );
  });

  it("surfaces non-unique lead insert errors", async () => {
    dbState.existingLead = null;
    dbState.insertLeadError = Object.assign(new Error("database offline"), {
      code: "08006",
    });

    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
      sourcePage: "https://gavelhouse.app/free/reserve-fund-calculator/",
    });

    expect(res.status).toBe(500);
  });

  it("throws when lead insert and conflict recovery cannot find a row", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = null;

    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
      sourcePage: "https://gavelhouse.app/free/reserve-fund-calculator/",
    });

    expect(res.status).toBe(500);
  });

  it("captures the client IP and user-agent on the download row", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: "unsub-1",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;

    await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
    });

    expect(dbState.lastDownloadValues).toMatchObject({
      ip: "203.0.113.10",
      userAgent: "test-agent/1.0",
    });
  });

  it("stores ip as null when cf-connecting-ip header is absent", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: "unsub-1",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;

    const req = new Request("http://localhost/lead-magnets/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "board@example.com",
        magnetSlug: "reserve-fund-calculator",
      }),
    });
    const res = await makeApp().fetch(req, mockEnv);
    expect(res.status).toBe(200);
    expect(dbState.lastDownloadValues).toMatchObject({
      ip: null,
      userAgent: null,
    });
  });

  it("returns 200 alreadySubscribed:true for duplicate email+magnet combo", async () => {
    dbState.existingLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: "unsub-1",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = false; // ON CONFLICT DO NOTHING → nothing returned

    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "reserve-fund-calculator",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      alreadySubscribed: boolean;
      downloadUrl: string;
    };
    expect(body.alreadySubscribed).toBe(true);
    // A working download URL is still returned so a returning user can grab the
    // asset from the response...
    expect(new URL(body.downloadUrl).pathname).toBe(
      "/downloads/reserve-fund-calculator.pdf",
    );
    // ...but the email-bombing-relevant side effects are gated on the row being
    // new: a duplicate submission must send no email and trigger no enrollment.
    expect(mockSendLeadMagnetEmail).not.toHaveBeenCalled();
    expect(mockEnrollSequencerSequence).not.toHaveBeenCalled();
    // Analytics still fires so we can observe duplicate submissions.
    expect(mockCaptureEvent).toHaveBeenCalledTimes(2);
    // call[0]: lead_magnet_download_ready fires even for returning subscribers
    expect(mockCaptureEvent.mock.calls[0][0]).toBe(
      "lead_magnet_download_ready",
    );
    expect(
      (mockCaptureEvent.mock.calls[0][1] as { already_subscribed: boolean })
        .already_subscribed,
    ).toBe(true);
    expect(mockCaptureEvent.mock.calls[1][0]).toBe("lead_magnet_submitted");
    const [, props] = mockCaptureEvent.mock.calls[1];
    expect((props as { already_subscribed: boolean }).already_subscribed).toBe(
      true,
    );
  });

  it("emits lead_magnet_download_ready with already_subscribed:false for new subscribers", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-new",
      email: "new@example.com",
      unsubscribeToken: "unsub-new",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;

    await jsonPost("/lead-magnets/subscribe", {
      email: "new@example.com",
      magnetSlug: "reserve-fund-calculator",
      posthogDistinctId: "ph-new",
    });

    const downloadReadyCall = mockCaptureEvent.mock.calls.find(
      ([name]) => name === "lead_magnet_download_ready",
    );
    expect(downloadReadyCall).toBeDefined();
    expect(downloadReadyCall![0]).toBe("lead_magnet_download_ready");
    expect(
      (downloadReadyCall![1] as { already_subscribed: boolean })
        .already_subscribed,
    ).toBe(false);
    expect(
      (downloadReadyCall![1] as { content_slug: string }).content_slug,
    ).toBe("reserve-fund-calculator");
    expect(downloadReadyCall![2]).toBe("ph-new");
  });

  it("emits lead_magnet_download_ready with already_subscribed:true for returning subscribers", async () => {
    dbState.existingLead = {
      id: "lead-returning",
      email: "returning@example.com",
      unsubscribeToken: "unsub-r",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = false;

    await jsonPost("/lead-magnets/subscribe", {
      email: "returning@example.com",
      magnetSlug: "hoa-budget-template",
      posthogDistinctId: "ph-returning",
    });

    const downloadReadyCall = mockCaptureEvent.mock.calls.find(
      ([name]) => name === "lead_magnet_download_ready",
    );
    expect(downloadReadyCall).toBeDefined();
    expect(
      (downloadReadyCall![1] as { already_subscribed: boolean })
        .already_subscribed,
    ).toBe(true);
    expect(downloadReadyCall![2]).toBe("ph-returning");
  });

  it("does not include forbidden props (signature, expires, filename) in lead_magnet_download_ready", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-check",
      email: "check@example.com",
      unsubscribeToken: "unsub-check",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;

    await jsonPost("/lead-magnets/subscribe", {
      email: "check@example.com",
      magnetSlug: "reserve-fund-calculator",
    });

    const downloadReadyCall = mockCaptureEvent.mock.calls.find(
      ([name]) => name === "lead_magnet_download_ready",
    );
    expect(downloadReadyCall).toBeDefined();
    const props = downloadReadyCall![1] as Record<string, unknown>;
    expect(props).not.toHaveProperty("signature");
    expect(props).not.toHaveProperty("expires");
    expect(props).not.toHaveProperty("filename");
    expect(props).not.toHaveProperty("raw_error");
  });

  it("emits lead_magnet_download_failed and returns 500 when URL signing throws", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-fail",
      email: "fail@example.com",
      unsubscribeToken: "unsub-fail",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;
    leadMagnetDownloadsState.buildSignedShouldThrow = true;

    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "fail@example.com",
      magnetSlug: "reserve-fund-calculator",
      posthogDistinctId: "ph-fail",
    });

    expect(res.status).toBe(500);
    const failedCall = mockCaptureEvent.mock.calls.find(
      ([name]) => name === "lead_magnet_download_failed",
    );
    expect(failedCall).toBeDefined();
    expect((failedCall![1] as { failure_type: string }).failure_type).toBe(
      "url_generation_failed",
    );
    expect((failedCall![1] as { content_slug: string }).content_slug).toBe(
      "reserve-fund-calculator",
    );
    // lead_magnet_download_ready must NOT fire on failure
    const readyCall = mockCaptureEvent.mock.calls.find(
      ([name]) => name === "lead_magnet_download_ready",
    );
    expect(readyCall).toBeUndefined();
  });

  it("reactivates a previously unsubscribed lead without re-sending a duplicate magnet", async () => {
    // The lead unsubscribed and now re-requests a magnet they already have
    // (download row exists → not new). Reactivation is a state fix and still
    // happens, but the gated outbound effects (email + enrollment) do not.
    dbState.existingLead = {
      id: "lead-unsubscribed",
      email: "board@example.com",
      unsubscribeToken: "unsub-resub",
      unsubscribedAt: new Date("2026-04-01T00:00:00.000Z"),
    };
    dbState.downloadInserted = false;

    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "hoa-budget-template",
      sourcePage: "https://gavelhouse.app/free/hoa-budget-template/",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadySubscribed: boolean };
    expect(body.alreadySubscribed).toBe(true);
    // Reactivation still occurs.
    expect(dbState.leadUpdateCalled).toBe(true);
    expect(dbState.lastLeadUpdateSet).toEqual({ unsubscribedAt: null });
    // Gated side effects do not fire on a duplicate magnet.
    expect(mockEnrollSequencerSequence).not.toHaveBeenCalled();
    expect(mockSendLeadMagnetEmail).not.toHaveBeenCalled();
  });

  it("re-sends and re-enrolls a returning lead requesting a genuinely new magnet", async () => {
    // Same person, a different magnet → download row IS new → side effects fire.
    dbState.existingLead = {
      id: "lead-returning",
      email: "board@example.com",
      unsubscribeToken: "unsub-ret",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;

    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "hoa-budget-template",
    });

    expect(res.status).toBe(200);
    expect(mockSendLeadMagnetEmail).toHaveBeenCalledTimes(1);
    expect(mockEnrollSequencerSequence).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid email", async () => {
    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "not-an-email",
      magnetSlug: "reserve-fund-calculator",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid magnetSlug", async () => {
    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "not-a-real-slug",
    });
    expect(res.status).toBe(400);
  });

  it("does not fail the request when PostHog capture throws", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: "unsub-1",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "hoa-budget-template",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadySubscribed: boolean };
    expect(body.alreadySubscribed).toBe(false);
  });

  it("falls back to default PUBLIC_API_URL when env is unset", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: "unsub-1",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;
    const envWithoutPublicWebUrl: Env = {
      ...mockEnv,
      PUBLIC_API_URL: undefined,
    };

    const res = await jsonPost(
      "/lead-magnets/subscribe",
      {
        email: "board@example.com",
        magnetSlug: "50-state-reserve-fund-requirements",
      },
      envWithoutPublicWebUrl,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { downloadUrl: string };
    const downloadUrl = new URL(body.downloadUrl);
    expect(downloadUrl.origin).toBe("https://api.gavelhouse.app");
    expect(downloadUrl.pathname).toBe(
      "/downloads/50-state-reserve-fund-requirements.pdf",
    );
  });

  it("passes an empty postal address when the environment omits one", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: "unsub-1",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;
    const envWithoutPostalAddress: Env = {
      ...mockEnv,
      COMPANY_POSTAL_ADDRESS: undefined,
    };

    const res = await jsonPost(
      "/lead-magnets/subscribe",
      {
        email: "board@example.com",
        magnetSlug: "hoa-budget-template",
      },
      envWithoutPostalAddress,
    );

    expect(res.status).toBe(200);
    expect(mockSendLeadMagnetEmail.mock.calls[0][0].react.props).toMatchObject({
      companyPostalAddress: "",
    });
  });

  it("uses email as distinct id fallback when posthogDistinctId is absent", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: "unsub-1",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;

    await jsonPost("/lead-magnets/subscribe", {
      email: "board@example.com",
      magnetSlug: "hoa-annual-meeting-planner",
    });

    expect(mockCaptureEvent).toHaveBeenCalledTimes(3);
    expect(mockCaptureEvent.mock.calls.map(([eventName]) => eventName)).toEqual(
      ["lead_magnet_download_ready", "lead_created", "lead_magnet_submitted"],
    );
    const distinctId = mockCaptureEvent.mock.calls[1][2];
    // Email fallback — not the literal email, but a derived stable id.
    expect(typeof distinctId).toBe("string");
    expect((distinctId as string).length).toBeGreaterThan(0);
  });

  it("returns a signed API download URL for every known slug", async () => {
    for (const slug of LEAD_MAGNET_SLUGS) {
      resetRateLimiter();
      resetDbState();
      dbState.existingLead = null;
      dbState.insertedLead = {
        id: "lead-1",
        email: "board@example.com",
        unsubscribeToken: "unsub-1",
        unsubscribedAt: null,
      };
      dbState.downloadInserted = true;

      const res = await jsonPost("/lead-magnets/subscribe", {
        email: "board@example.com",
        magnetSlug: slug,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { downloadUrl: string };
      const downloadUrl = new URL(body.downloadUrl);
      expect(downloadUrl.origin).toBe("https://api.gavelhouse.app");
      expect(downloadUrl.pathname).toBe(`/downloads/${slug}.pdf`);
      expect(downloadUrl.searchParams.get("expires")).toMatch(/^\d+$/);
      expect(downloadUrl.searchParams.get("signature")).toMatch(
        /^[a-f0-9]{64}$/,
      );
    }
  });
});

describe("POST /lead-magnets/subscribe rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbState();
    resetRateLimiter();
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: "unsub-1",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;
  });

  // Distinct emails per request so the per-identity throttle never fires and
  // we isolate the IP limiter under test.
  const bodyForIndex = (i: number) => ({
    email: `board+${i}@example.com`,
    magnetSlug: "reserve-fund-calculator" as const,
  });

  it("allows up to 5 requests from the same IP per minute and 429s the 6th", async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await jsonPost("/lead-magnets/subscribe", bodyForIndex(i));
      expect(res.status).toBe(200);
    }
    const sixth = await jsonPost("/lead-magnets/subscribe", bodyForIndex(5));
    expect(sixth.status).toBe(429);
    const json = (await sixth.json()) as { error: string };
    expect(json.error).toBe("rate_limited");
  });

  it("tracks limits per IP independently", async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await jsonPost(
        "/lead-magnets/subscribe",
        bodyForIndex(i),
        mockEnv,
        { "cf-connecting-ip": "203.0.113.10" },
      );
      expect(res.status).toBe(200);
    }
    // Different IP — should still succeed.
    const other = await jsonPost(
      "/lead-magnets/subscribe",
      bodyForIndex(99),
      mockEnv,
      { "cf-connecting-ip": "203.0.113.99" },
    );
    expect(other.status).toBe(200);
  });
});

describe("POST /lead-magnets/subscribe abuse hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbState();
    resetRateLimiter();
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-1",
      email: "board@example.com",
      unsubscribeToken: "unsub-1",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;
    mockSendLeadMagnetEmail.mockResolvedValue(undefined);
    mockEnrollSequencerSequence.mockResolvedValue(true);
  });

  it("silently succeeds and performs no side effects when the honeypot is filled", async () => {
    const res = await jsonPost("/lead-magnets/subscribe", {
      email: "bot@example.com",
      magnetSlug: "reserve-fund-calculator",
      companyWebsite: "http://spam.example",
    });

    // Success-shaped — no detection tell.
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      downloadUrl: string;
      alreadySubscribed: boolean;
    };
    expect(new URL(body.downloadUrl).pathname).toBe(
      "/downloads/reserve-fund-calculator.pdf",
    );
    // No DB write, no email, no enrollment.
    expect(dbState.lastDownloadValues).toBeNull();
    expect(dbState.leadSelectCount).toBe(0);
    expect(mockSendLeadMagnetEmail).not.toHaveBeenCalled();
    expect(mockEnrollSequencerSequence).not.toHaveBeenCalled();
  });

  it("silently succeeds on the waitlist path when the honeypot is filled", async () => {
    const res = await jsonPost("/waitlist/subscribe", {
      email: "bot@example.com",
      companyWebsite: "filled",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      alreadySubscribed: boolean;
    };
    expect(body.success).toBe(true);
    expect(dbState.leadSelectCount).toBe(0);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("throttles a single email after 3 submissions even from one IP", async () => {
    const body = (i: number) => ({
      email: "victim@example.com",
      magnetSlug: "reserve-fund-calculator" as const,
      sourcePage: `p${i}`,
    });
    for (let i = 0; i < 3; i += 1) {
      const res = await jsonPost("/lead-magnets/subscribe", body(i));
      expect(res.status).toBe(200);
    }
    const fourth = await jsonPost("/lead-magnets/subscribe", body(3));
    expect(fourth.status).toBe(429);
    const json = (await fourth.json()) as { error: string };
    expect(json.error).toBe("rate_limited");
  });

  it("rejects with 403 and sends no email when Turnstile verification fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: false }), { status: 200 }),
        ),
      ),
    );
    const envWithSecret: Env = {
      ...mockEnv,
      TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    };

    const res = await jsonPost(
      "/lead-magnets/subscribe",
      {
        email: "board@example.com",
        magnetSlug: "reserve-fund-calculator",
        turnstileToken: "bad-token",
      },
      envWithSecret,
    );

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("verification_failed");
    expect(dbState.lastDownloadValues).toBeNull();
    expect(mockSendLeadMagnetEmail).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("does not consume the per-email throttle when Turnstile verification fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: false }), { status: 200 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const envWithSecret: Env = {
      ...mockEnv,
      TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    };

    for (let i = 0; i < 5; i += 1) {
      const res = await jsonPost(
        "/lead-magnets/subscribe",
        {
          email: "victim@example.com",
          magnetSlug: "reserve-fund-calculator",
          turnstileToken: `bad-token-${i}`,
        },
        envWithSecret,
        { "cf-connecting-ip": `203.0.113.${20 + i}` },
      );
      expect(res.status).toBe(403);
    }

    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      ),
    );

    const valid = await jsonPost(
      "/lead-magnets/subscribe",
      {
        email: "victim@example.com",
        magnetSlug: "reserve-fund-calculator",
        turnstileToken: "good-token",
      },
      envWithSecret,
      { "cf-connecting-ip": "203.0.113.90" },
    );

    expect(valid.status).toBe(200);
    expect(mockSendLeadMagnetEmail).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("throttles a single email on the waitlist path after 3 submissions", async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await jsonPost("/waitlist/subscribe", {
        email: "victim@example.com",
        sourcePage: `p${i}`,
      });
      expect(res.status).toBe(200);
    }
    const fourth = await jsonPost("/waitlist/subscribe", {
      email: "victim@example.com",
    });
    expect(fourth.status).toBe(429);
  });

  it("rejects the waitlist path with 403 when Turnstile verification fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: false }), { status: 200 }),
        ),
      ),
    );
    const envWithSecret: Env = {
      ...mockEnv,
      TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    };

    const res = await jsonPost(
      "/waitlist/subscribe",
      { email: "board@example.com", turnstileToken: "bad-token" },
      envWithSecret,
    );

    expect(res.status).toBe(403);
    expect(dbState.leadSelectCount).toBe(0);

    vi.unstubAllGlobals();
  });

  it("does not consume the waitlist email throttle when Turnstile verification fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: false }), { status: 200 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const envWithSecret: Env = {
      ...mockEnv,
      TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    };

    for (let i = 0; i < 5; i += 1) {
      const res = await jsonPost(
        "/waitlist/subscribe",
        {
          email: "victim@example.com",
          turnstileToken: `bad-token-${i}`,
        },
        envWithSecret,
        { "cf-connecting-ip": `203.0.113.${40 + i}` },
      );
      expect(res.status).toBe(403);
    }

    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      ),
    );

    const valid = await jsonPost(
      "/waitlist/subscribe",
      {
        email: "victim@example.com",
        turnstileToken: "good-token",
      },
      envWithSecret,
      { "cf-connecting-ip": "203.0.113.91" },
    );

    expect(valid.status).toBe(200);
    expect(dbState.leadSelectCount).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });

  it("proceeds and sends one email when Turnstile verification passes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), { status: 200 }),
        ),
      ),
    );
    const envWithSecret: Env = {
      ...mockEnv,
      TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    };

    const res = await jsonPost(
      "/lead-magnets/subscribe",
      {
        email: "board@example.com",
        magnetSlug: "reserve-fund-calculator",
        turnstileToken: "good-token",
      },
      envWithSecret,
    );

    expect(res.status).toBe(200);
    expect(mockSendLeadMagnetEmail).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});

describe("POST /waitlist/subscribe (back-compat)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbState();
    resetRateLimiter();
  });

  it("keeps lead magnet compatibility and returns a download URL", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-w",
      email: "waitlist@example.com",
      unsubscribeToken: "unsub-w",
      unsubscribedAt: null,
    };
    dbState.downloadInserted = true;

    const res = await jsonPost("/waitlist/subscribe", {
      email: "waitlist@example.com",
      magnetSlug: "hoa-board-transition-checklist",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      alreadySubscribed: boolean;
      downloadUrl: string;
    };
    expect(body.alreadySubscribed).toBe(false);
    expect(new URL(body.downloadUrl).pathname).toBe(
      "/downloads/hoa-board-transition-checklist.pdf",
    );
    expect(dbState.lastDownloadValues).toMatchObject({
      leadId: "lead-w",
      magnetSlug: "hoa-board-transition-checklist",
    });
    expect(mockSendLeadMagnetEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for malformed waitlist JSON", async () => {
    const req = new Request("http://localhost/waitlist/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
      },
      body: "{",
    });
    const res = await makeApp().fetch(req, mockEnv);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request body" });
  });

  it("accepts plain public signup payloads without a magnet slug", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-plain",
      email: "waitlist@example.com",
      unsubscribeToken: "unsub-plain",
      unsubscribedAt: null,
      surveyToken: "11111111-1111-4111-8111-111111111111",
    };

    const res = await jsonPost("/waitlist/subscribe", {
      email: "waitlist@example.com",
      sourcePage: "/pricing",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "spring",
      referredBy: "partner",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      alreadySubscribed: boolean;
      surveyToken: string;
    };
    expect(body).toEqual({
      success: true,
      alreadySubscribed: false,
      surveyToken: "11111111-1111-4111-8111-111111111111",
    });
    expect(dbState.lastDownloadValues).toBeNull();
    expect(mockSendLeadMagnetEmail).not.toHaveBeenCalled();
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "lead_created",
      {
        lead_type: "waitlist",
        source_page: "/pricing",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "spring",
        referred_by: "partner",
      },
      "lead:lead-plain",
      mockEnv,
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "waitlist_submitted",
      {
        source_page: "/pricing",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "spring",
        referred_by: "partner",
      },
      "lead:lead-plain",
      mockEnv,
    );
  });

  it("saves waitlist survey answers once by survey token", async () => {
    dbState.existingLead = {
      id: "lead-survey",
      email: "waitlist@example.com",
      unsubscribeToken: "unsub-survey",
      unsubscribedAt: null,
      surveyToken: "22222222-2222-4222-8222-222222222222",
      surveyCompletedAt: null,
      sourcePage: "/pricing",
      posthogDistinctId: "ph-survey",
    };

    const res = await jsonPost("/waitlist/survey", {
      surveyToken: "22222222-2222-4222-8222-222222222222",
      answers: [{ questionId: "community-size", answer: "25-50" }],
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(dbState.lastLeadUpdateSet).toMatchObject({
      surveyAnswers: [{ questionId: "community-size", answer: "25-50" }],
      surveyCompletedAt: expect.any(Date),
    });
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "waitlist_survey_submitted",
      { answer_count: 1, source_page: "/pricing" },
      "ph-survey",
      mockEnv,
    );
  });

  it("returns 409 when waitlist survey answers were already saved", async () => {
    dbState.existingLead = {
      id: "lead-survey",
      email: "waitlist@example.com",
      unsubscribeToken: "unsub-survey",
      unsubscribedAt: null,
      surveyToken: "22222222-2222-4222-8222-222222222222",
      surveyCompletedAt: new Date("2026-05-01T00:00:00.000Z"),
    };

    const res = await jsonPost("/waitlist/survey", {
      surveyToken: "22222222-2222-4222-8222-222222222222",
      answers: [{ questionId: "community-size", answer: "25-50" }],
    });

    expect(res.status).toBe(409);
    expect(dbState.lastLeadUpdateSet).toBeNull();
  });

  it("returns 409 when a concurrent survey submission wins the update race", async () => {
    dbState.existingLead = {
      id: "lead-survey",
      email: "waitlist@example.com",
      unsubscribeToken: "unsub-survey",
      unsubscribedAt: null,
      surveyToken: "22222222-2222-4222-8222-222222222222",
      surveyCompletedAt: null,
    };
    dbState.surveyUpdateReturnedRows = [];

    const res = await jsonPost("/waitlist/survey", {
      surveyToken: "22222222-2222-4222-8222-222222222222",
      answers: [{ questionId: "community-size", answer: "25-50" }],
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Survey already submitted",
    });
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "waitlist_survey_submitted",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("captures null attribution fields for minimal waitlist signups", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = {
      id: "lead-minimal",
      email: "waitlist@example.com",
      unsubscribeToken: "unsub-minimal",
      unsubscribedAt: null,
    };

    const res = await jsonPost("/waitlist/subscribe", {
      email: "waitlist@example.com",
    });

    expect(res.status).toBe(200);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "lead_created",
      {
        lead_type: "waitlist",
        source_page: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        referred_by: null,
      },
      "lead:lead-minimal",
      mockEnv,
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "waitlist_submitted",
      {
        source_page: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        referred_by: null,
      },
      "lead:lead-minimal",
      mockEnv,
    );
  });

  it("returns 400 for invalid plain waitlist payloads", async () => {
    const res = await jsonPost("/waitlist/subscribe", {
      email: "not-an-email",
      sourcePage: "/pricing",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request body");
  });

  it("recovers when a concurrent waitlist lead insert wins the email race", async () => {
    dbState.existingLead = null;
    dbState.insertLeadError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    dbState.leadAfterInsertConflict = {
      id: "lead-race",
      email: "waitlist@example.com",
      unsubscribeToken: "unsub-race",
      unsubscribedAt: null,
    };

    const res = await jsonPost("/waitlist/subscribe", {
      email: "waitlist@example.com",
      sourcePage: "/pricing",
      posthogDistinctId: "ph-waitlist",
    });

    expect(res.status).toBe(200);
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "lead_created",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "waitlist_submitted",
      {
        source_page: "/pricing",
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        referred_by: null,
      },
      "ph-waitlist",
      mockEnv,
    );
  });

  it("surfaces non-unique waitlist lead insert errors", async () => {
    dbState.existingLead = null;
    dbState.insertLeadError = Object.assign(new Error("database offline"), {
      code: "08006",
    });

    const res = await jsonPost("/waitlist/subscribe", {
      email: "waitlist@example.com",
    });

    expect(res.status).toBe(500);
  });

  it("throws when waitlist lead insert returns no row", async () => {
    dbState.existingLead = null;
    dbState.insertedLead = null;

    const res = await jsonPost("/waitlist/subscribe", {
      email: "waitlist@example.com",
    });

    expect(res.status).toBe(500);
  });

  it("resubscribes existing unsubscribed leads on plain waitlist signup", async () => {
    dbState.existingLead = {
      id: "lead-unsub",
      email: "waitlist@example.com",
      unsubscribeToken: "unsub-token",
      unsubscribedAt: new Date("2026-04-01T00:00:00.000Z"),
    };

    const res = await jsonPost("/waitlist/subscribe", {
      email: "waitlist@example.com",
      sourcePage: "/pricing",
    });

    expect(res.status).toBe(200);
    expect(dbState.leadUpdateCalled).toBe(true);
    expect(dbState.lastLeadUpdateSet).toEqual({ unsubscribedAt: null });
  });
});

describe("POST /waitlist/pricing-click", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbState();
    resetRateLimiter();
  });

  it("returns 204 and captures the click event", async () => {
    const res = await jsonPost("/waitlist/pricing-click", {
      tier: "growth",
      sourcePage: "https://gavelhouse.app/",
      sessionId: "session-123",
      billingPeriod: "monthly",
    });

    expect(res.status).toBe(204);
    expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "pricing_tier_selected",
      {
        tier: "growth",
        source_page: "https://gavelhouse.app/",
        session_id: "session-123",
        billing_period: "monthly",
      },
      "session-123",
      mockEnv,
    );
  });

  it("still returns 204 when analytics capture throws", async () => {
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await jsonPost("/waitlist/pricing-click", {
      tier: "growth",
      sourcePage: "https://gavelhouse.app/",
      sessionId: "session-456",
      billingPeriod: "annual",
    });

    expect(res.status).toBe(204);
  });

  it("defaults the billing period to monthly when omitted", async () => {
    const res = await jsonPost("/lead-magnets/pricing-click", {
      tier: "growth",
      sourcePage: null,
      sessionId: "session-789",
    });

    expect(res.status).toBe(204);
    expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "pricing_tier_selected",
      {
        tier: "growth",
        source_page: null,
        session_id: "session-789",
        billing_period: "monthly",
      },
      "session-789",
      mockEnv,
    );
  });
});
