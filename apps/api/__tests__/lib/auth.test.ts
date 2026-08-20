import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing auth
// Note: vi.mock factories are hoisted, so we cannot reference variables defined
// outside the factory. We use vi.fn() inline and retrieve the mocks via
// vi.mocked() after import.

vi.mock("../../src/db/client.js", () => ({
  createDb: vi.fn(() => {
    const insert = vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    }));
    return {
      insert,
      transaction: vi.fn(
        async (cb: (tx: { insert: typeof insert }) => Promise<void>) => {
          await cb({ insert });
        },
      ),
    };
  }),
}));

vi.mock("better-auth", () => ({
  betterAuth: vi.fn((config: unknown) => ({
    _config: config,
    handler: vi.fn(),
  })),
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn(() => ({ _type: "drizzle-adapter" })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({ _isDb: true })),
}));

// nanoid needs to return predictable values for slug tests
vi.mock("../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "abc123"),
}));

vi.mock("../../src/domain/signup/signupEmails.js", () => ({
  buildSignupConfirmationEmail: vi.fn().mockResolvedValue({
    to: "jane@example.com",
    subject: "Confirm",
    html: "<p>Confirm</p>",
    text: "Confirm",
  }),
  sendSignupEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/domain/accounting/seed.js", () => ({
  insertDefaultChartOfAccounts: vi.fn().mockResolvedValue(undefined),
}));

const mockEnrollSequencerSequence = vi.fn().mockResolvedValue(true);

vi.mock("../../src/lib/sequencer.js", () => ({
  enrollSequencerSequence: (...args: unknown[]) =>
    mockEnrollSequencerSequence(...args),
}));

const mockCaptureEvent = vi.fn().mockResolvedValue(undefined);
const mockCaptureException = vi.fn();

vi.mock("../../src/lib/observability.js", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import {
  buildTrustedOrigins,
  createAuth,
  getAuth,
  getAuthProviders,
} from "../../src/lib/auth.js";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "../../src/db/client.js";
import type { Db } from "../../src/db/client.js";
import type { Env } from "../../src/types/env.js";
import {
  buildSignupConfirmationEmail,
  sendSignupEmail,
} from "../../src/domain/signup/signupEmails.js";
import { insertDefaultChartOfAccounts } from "../../src/domain/accounting/seed.js";

const mockEnv: Env = {
  BETTER_AUTH_SECRET: "super-secret-key",
  BETTER_AUTH_URL: "http://localhost:8060",
  APP_URL: "http://localhost:3060",
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_STARTER_MONTHLY: "price_sm",
  STRIPE_PRICE_STARTER_ANNUAL: "price_sa",
  STRIPE_PRICE_GROWTH_MONTHLY: "price_gm",
  STRIPE_PRICE_GROWTH_ANNUAL: "price_ga",
  STRIPE_PRICE_SCALE_MONTHLY: "price_scm",
  STRIPE_PRICE_SCALE_ANNUAL: "price_sca",
  STRIPE_PRICE_PORTFOLIO_MONTHLY: "price_pm",
  STRIPE_PRICE_PORTFOLIO_ANNUAL: "price_pa",
  RESEND_API_KEY: "resend_test",
  DATABASE_URL: "postgres://localhost/test",
};

// Helper: build a spy-backed mock db and register it as the createDb return value
// The transaction callback receives the same mock object so insert calls are captured.
function makeMockDb() {
  const mockInsertValues = vi.fn().mockResolvedValue(undefined);
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockTransaction = vi.fn(
    async (cb: (tx: { insert: typeof mockInsert }) => Promise<void>) => {
      await cb({ insert: mockInsert });
    },
  );
  const mockDb = {
    insert: mockInsert,
    transaction: mockTransaction,
  } as unknown as Db;
  vi.mocked(createDb).mockReturnValue(mockDb);
  return { mockInsert, mockInsertValues, mockTransaction };
}

// Helper: extract the after hook from the most recent betterAuth call
function getAfterHook() {
  const betterAuthMock = vi.mocked(betterAuth);
  const lastCallIndex = betterAuthMock.mock.calls.length - 1;
  const config = betterAuthMock.mock.calls[lastCallIndex][0] as {
    databaseHooks: {
      user: {
        create: {
          after: (user: {
            id: string;
            name: string;
            email: string;
          }) => Promise<void>;
        };
      };
    };
  };
  return config.databaseHooks.user.create.after;
}

function getDeleteUserConfig() {
  const betterAuthMock = vi.mocked(betterAuth);
  const config = betterAuthMock.mock.calls.at(-1)?.[0] as {
    user: {
      deleteUser: {
        enabled: boolean;
        beforeDelete: (user: { id: string }) => Promise<void>;
        afterDelete: (user: { id: string }) => Promise<void>;
      };
    };
  };
  return config.user.deleteUser;
}

function makeDeletionDb(selectRows: unknown[][] = []) {
  const mockWhere = vi.fn(async () => selectRows.shift() ?? []);
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));
  const mockDb = {
    select: mockSelect,
    delete: mockDelete,
  } as unknown as Db;
  vi.mocked(createDb).mockReturnValue(mockDb);
  return { mockSelect, mockDelete, mockDeleteWhere };
}

describe("createAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-configure the default createDb mock after clearAllMocks resets call history
    const insert = vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mocked(createDb).mockReturnValue({
      insert,
      transaction: vi.fn(
        async (cb: (tx: { insert: typeof insert }) => Promise<void>) => {
          await cb({ insert });
        },
      ),
    } as unknown as Db);
  });

  it("calls betterAuth with the correct secret and baseURL", () => {
    createAuth(mockEnv);
    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: "super-secret-key",
        baseURL: "http://localhost:8060",
      }),
    );
  });

  it("includes APP_URL and localhost ports in trustedOrigins", () => {
    createAuth(mockEnv);
    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        trustedOrigins: expect.arrayContaining([
          "http://localhost:3060",
          "http://localhost:3061",
          "http://localhost:3060",
        ]),
      }),
    );
  });

  it("limits trustedOrigins to production origins when both app and auth URLs are production", () => {
    const prodEnv: Env = {
      ...mockEnv,
      APP_URL: "https://my.gavelhouse.app",
      BETTER_AUTH_URL: "https://api.gavelhouse.app",
    };

    expect(buildTrustedOrigins(prodEnv)).toEqual(["https://my.gavelhouse.app"]);
  });

  it("keeps localhost trusted origins for non-production environments", () => {
    expect(buildTrustedOrigins(mockEnv)).toEqual([
      "http://localhost:3060",
      "http://localhost:3060",
      "http://localhost:3061",
    ]);
  });

  it("enables emailAndPassword with minPasswordLength 8", () => {
    createAuth(mockEnv);
    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAndPassword: { enabled: true, minPasswordLength: 8 },
      }),
    );
  });

  describe("user.deleteUser", () => {
    it("enables Better Auth account deletion hooks", () => {
      createAuth(mockEnv);

      expect(getDeleteUserConfig()).toEqual(
        expect.objectContaining({
          enabled: true,
          beforeDelete: expect.any(Function),
          afterDelete: expect.any(Function),
        }),
      );
    });

    it("allows deletion when no owned business records block the user", async () => {
      const { mockSelect } = makeDeletionDb([[], [], []]);
      createAuth(mockEnv);

      await expect(
        getDeleteUserConfig().beforeDelete({ id: "user-clear" }),
      ).resolves.toBeUndefined();

      expect(mockSelect).toHaveBeenCalledTimes(3);
    });

    it("blocks deletion when the user owns a community", async () => {
      makeDeletionDb([[{ id: "community-1" }]]);
      createAuth(mockEnv);

      await expect(
        getDeleteUserConfig().beforeDelete({ id: "owner-user" }),
      ).rejects.toThrow(/Transfer or close owned communities/);
    });

    it("blocks deletion when the user owns a portfolio", async () => {
      makeDeletionDb([[], [{ id: "portfolio-1" }]]);
      createAuth(mockEnv);

      await expect(
        getDeleteUserConfig().beforeDelete({ id: "portfolio-user" }),
      ).rejects.toThrow(/Delete your portfolios/);
    });

    it("blocks deletion when billing records still reference the user", async () => {
      makeDeletionDb([[], [], [{ id: "churn-1" }]]);
      createAuth(mockEnv);

      await expect(
        getDeleteUserConfig().beforeDelete({ id: "billing-user" }),
      ).rejects.toThrow(/billing records reference your user/);
    });

    it("cleans non-relational feedback rows after Better Auth deletes the user", async () => {
      const { mockDelete, mockDeleteWhere } = makeDeletionDb();
      createAuth(mockEnv);

      await getDeleteUserConfig().afterDelete({ id: "deleted-user" });

      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    });
  });

  it("sends verification emails on signup without requiring verified email to sign in", () => {
    createAuth(mockEnv);
    const betterAuthMock = vi.mocked(betterAuth);
    const config = betterAuthMock.mock.calls.at(-1)?.[0] as {
      emailAndPassword: { requireEmailVerification?: boolean };
      emailVerification: {
        sendOnSignUp: boolean;
        sendVerificationEmail: unknown;
      };
    };

    expect(config.emailAndPassword.requireEmailVerification).toBeUndefined();
    expect(config.emailVerification.sendOnSignUp).toBe(true);
    expect(config.emailVerification.sendVerificationEmail).toEqual(
      expect.any(Function),
    );
  });

  it("uses the Gavelhouse confirmation template for Better Auth verification emails", async () => {
    createAuth(mockEnv);
    const betterAuthMock = vi.mocked(betterAuth);
    const config = betterAuthMock.mock.calls.at(-1)?.[0] as {
      emailVerification: {
        sendVerificationEmail: (input: {
          user: { email: string; name: string };
          url: string;
        }) => Promise<void>;
      };
    };

    await config.emailVerification.sendVerificationEmail({
      user: { email: "jane@example.com", name: "Jane Owner" },
      url: "https://api.gavelhouse.app/verify-email?token=tok",
    });

    expect(buildSignupConfirmationEmail).toHaveBeenCalledWith(
      {
        email: "jane@example.com",
        recipientName: "Jane Owner",
        verificationUrl:
          "https://api.gavelhouse.app/api/auth/verify-email?token=tok&callbackURL=%2Fbilling",
      },
      mockEnv,
    );
    expect(sendSignupEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com" }),
      mockEnv.RESEND_API_KEY,
    );
  });

  it("skips the verification email when no Resend key is configured", async () => {
    createAuth({ ...mockEnv, RESEND_API_KEY: "" });
    const betterAuthMock = vi.mocked(betterAuth);
    const config = betterAuthMock.mock.calls.at(-1)?.[0] as {
      emailVerification: {
        sendVerificationEmail: (input: {
          user: { email: string; name: string };
          url: string;
        }) => Promise<void>;
      };
    };

    await config.emailVerification.sendVerificationEmail({
      user: { email: "jane@example.com", name: "Jane Owner" },
      url: "https://api.gavelhouse.app/verify-email?token=tok",
    });

    expect(buildSignupConfirmationEmail).not.toHaveBeenCalled();
    expect(sendSignupEmail).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("reports to Sentry when the Resend key is missing in production", async () => {
    createAuth({
      ...mockEnv,
      RESEND_API_KEY: "",
      SENTRY_ENVIRONMENT: "production",
    });
    const betterAuthMock = vi.mocked(betterAuth);
    const config = betterAuthMock.mock.calls.at(-1)?.[0] as {
      emailVerification: {
        sendVerificationEmail: (input: {
          user: { email: string; name: string };
          url: string;
        }) => Promise<void>;
      };
    };

    await config.emailVerification.sendVerificationEmail({
      user: { email: "jane@example.com", name: "Jane Owner" },
      url: "https://api.gavelhouse.app/verify-email?token=tok",
    });

    expect(sendSignupEmail).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("RESEND_API_KEY is unset"),
      }),
      { tags: { component: "auth" } },
    );
  });

  it("keeps mounted verification URLs and callback URLs intact", async () => {
    createAuth(mockEnv);
    const betterAuthMock = vi.mocked(betterAuth);
    const config = betterAuthMock.mock.calls.at(-1)?.[0] as {
      emailVerification: {
        sendVerificationEmail: (input: {
          user: { email: string; name: string };
          url: string;
        }) => Promise<void>;
      };
    };

    await config.emailVerification.sendVerificationEmail({
      user: { email: "jane@example.com", name: "Jane Owner" },
      url: "https://api.gavelhouse.app/api/auth/verify-email?token=tok&callbackURL=%2Fdashboard",
    });

    expect(buildSignupConfirmationEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        verificationUrl:
          "https://api.gavelhouse.app/api/auth/verify-email?token=tok&callbackURL=%2Fdashboard",
      }),
      mockEnv,
    );
  });

  it("passes drizzle adapter to betterAuth", () => {
    createAuth(mockEnv);
    expect(drizzleAdapter).toHaveBeenCalled();
    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        database: expect.objectContaining({ _type: "drizzle-adapter" }),
      }),
    );
  });

  it("returns the auth object from betterAuth", () => {
    const auth = createAuth(mockEnv);
    expect(auth).toBeDefined();
    expect((auth as { handler?: unknown }).handler).toBeDefined();
  });

  it("omits Google socialProviders when credentials are absent", () => {
    createAuth(mockEnv);
    const betterAuthMock = vi.mocked(betterAuth);
    const lastCallIndex = betterAuthMock.mock.calls.length - 1;
    const config = betterAuthMock.mock.calls[lastCallIndex][0] as {
      socialProviders?: unknown;
    };
    expect(config.socialProviders).toBeUndefined();
  });

  it("uses GOOGLE_CLIENT_ID when provided in env", () => {
    const envWithGoogle = {
      ...mockEnv,
      GOOGLE_CLIENT_ID: "real-client-id",
      GOOGLE_CLIENT_SECRET: "real-client-secret",
    } as unknown as Env;
    createAuth(envWithGoogle);
    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        socialProviders: expect.objectContaining({
          google: expect.objectContaining({
            clientId: "real-client-id",
            clientSecret: "real-client-secret",
          }),
        }),
      }),
    );
  });

  it("reports provider availability from env", () => {
    expect(getAuthProviders(mockEnv)).toEqual({ google: false });
    expect(
      getAuthProviders({
        ...mockEnv,
        GOOGLE_CLIENT_ID: "real-client-id",
        GOOGLE_CLIENT_SECRET: "real-client-secret",
      }),
    ).toEqual({ google: true });
  });

  it("includes databaseHooks with user.create.after in betterAuth config", () => {
    createAuth(mockEnv);
    expect(betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseHooks: expect.objectContaining({
          user: expect.objectContaining({
            create: expect.objectContaining({
              after: expect.any(Function),
            }),
          }),
        }),
      }),
    );
  });

  describe("cross-subdomain cookie config", () => {
    it("sets crossSubDomainCookies with domain .gavelhouse.app when APP_URL contains gavelhouse.app", () => {
      const prodEnv: Env = {
        ...mockEnv,
        APP_URL: "https://my.gavelhouse.app",
      };
      createAuth(prodEnv);
      expect(betterAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          advanced: expect.objectContaining({
            crossSubDomainCookies: expect.objectContaining({
              enabled: true,
              domain: ".gavelhouse.app",
            }),
          }),
        }),
      );
    });

    it("does not set crossSubDomainCookies when APP_URL is localhost", () => {
      createAuth(mockEnv);
      const betterAuthMock = vi.mocked(betterAuth);
      const lastCallIndex = betterAuthMock.mock.calls.length - 1;
      const config = betterAuthMock.mock.calls[lastCallIndex][0] as {
        advanced?: { crossSubDomainCookies?: unknown };
      };
      expect(config.advanced?.crossSubDomainCookies).toBeUndefined();
    });
  });

  describe("databaseHooks.user.create.after", () => {
    it("makes 4 local insert calls and delegates signup sequences to Sequencer", async () => {
      const { mockInsert } = makeMockDb();
      createAuth(mockEnv);
      const hook = getAfterHook();

      await hook({
        id: "user-1",
        name: "Jane Smith",
        email: "jane@example.com",
      });

      expect(mockInsert).toHaveBeenCalledTimes(4);
      expect(mockEnrollSequencerSequence).toHaveBeenCalledTimes(2);
      expect(mockEnrollSequencerSequence).toHaveBeenCalledWith(
        mockEnv,
        expect.objectContaining({
          email: "jane@example.com",
          sequenceSlug: "boardstack-fulfillment-welcome",
          externalId: "user-1:fulfillment-welcome",
        }),
      );
      expect(mockEnrollSequencerSequence).toHaveBeenCalledWith(
        mockEnv,
        expect.objectContaining({
          email: "jane@example.com",
          sequenceSlug: "boardstack-nurture-value-1",
          externalId: "user-1:nurture-value-1",
        }),
      );
    });

    it("captures signup lifecycle analytics without email or name properties", async () => {
      makeMockDb();
      createAuth(mockEnv);
      const hook = getAfterHook();

      await hook({
        id: "user-analytics",
        name: "Analytics Owner",
        email: "analytics@example.com",
      });

      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "user_identified",
        expect.objectContaining({
          community_id: "abc123",
          role: "owner",
          tier: "scale",
        }),
        "user-analytics",
        mockEnv,
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "community_created",
        expect.objectContaining({
          community_id: "abc123",
          role: "owner",
          source: "signup",
        }),
        "user-analytics",
        mockEnv,
      );
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        "trial_started",
        expect.objectContaining({
          community_id: "abc123",
          tier: "scale",
          trial_duration_days: 30,
        }),
        "user-analytics",
        mockEnv,
      );
      expect(mockCaptureEvent).not.toHaveBeenCalledWith(
        "signup_completed",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );

      for (const [, properties] of mockCaptureEvent.mock.calls) {
        expect(properties).not.toHaveProperty("email");
        expect(properties).not.toHaveProperty("name");
        expect(properties).not.toHaveProperty("signup_name");
      }
    });

    it("seeds the default chart of accounts inside the signup transaction", async () => {
      const { mockInsertValues } = makeMockDb();
      createAuth(mockEnv);
      const hook = getAfterHook();

      await hook({
        id: "user-coa",
        name: "Chart Owner",
        email: "chart@example.com",
      });

      const communityCall = mockInsertValues.mock.calls[0][0] as {
        id: string;
      };
      expect(insertDefaultChartOfAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ insert: expect.any(Function) }),
        communityCall.id,
      );
    });

    it("inserts community with correct name, null state, and ownerUserId", async () => {
      const { mockInsertValues } = makeMockDb();
      createAuth(mockEnv);
      const hook = getAfterHook();

      await hook({
        id: "user-2",
        name: "Alice Wonder",
        email: "alice@example.com",
      });

      const firstCall = mockInsertValues.mock.calls[0][0] as {
        name: string;
        state: string | null | undefined;
        ownerUserId: string;
      };
      expect(firstCall.name).toBe("Alice Wonder's Community");
      expect(firstCall.state == null).toBe(true);
      expect(firstCall.ownerUserId).toBe("user-2");
    });

    it("inserts community member with owner role", async () => {
      const { mockInsertValues } = makeMockDb();
      createAuth(mockEnv);
      const hook = getAfterHook();

      await hook({
        id: "user-3",
        name: "Bob Builder",
        email: "bob@example.com",
      });

      const memberCall = mockInsertValues.mock.calls[1][0] as {
        role: string;
        userId: string;
      };
      expect(memberCall.role).toBe("owner");
      expect(memberCall.userId).toBe("user-3");
    });

    it("starts a 30-day trial on the full self-serve Scale tier", async () => {
      const { mockInsertValues } = makeMockDb();
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));

      createAuth(mockEnv);
      const hook = getAfterHook();

      await hook({
        id: "user-4",
        name: "Carol King",
        email: "carol@example.com",
      });

      vi.useRealTimers();

      const subCall = mockInsertValues.mock.calls[2][0] as {
        status: string;
        tier: string;
        cycle: string | null | undefined;
        trialStartedAt: Date;
        trialEndsAt: Date;
        stripeSubscriptionId: string | null | undefined;
        stripeCustomerId: string | null | undefined;
      };
      expect(subCall.status).toBe("trialing");
      expect(subCall.tier).toBe("scale");
      expect(subCall.cycle == null).toBe(true);
      expect(subCall.trialStartedAt.toISOString()).toBe(
        "2026-05-01T00:00:00.000Z",
      );
      expect(subCall.trialEndsAt.toISOString()).toBe(
        "2026-05-31T00:00:00.000Z",
      );
      expect(subCall.stripeSubscriptionId == null).toBe(true);
      expect(subCall.stripeCustomerId == null).toBe(true);
    });

    it("inserts community_activation row with a communityId", async () => {
      const { mockInsertValues } = makeMockDb();
      createAuth(mockEnv);
      const hook = getAfterHook();

      await hook({
        id: "user-5",
        name: "Dave Day",
        email: "dave@example.com",
      });

      const activationCall = mockInsertValues.mock.calls[3][0] as {
        communityId: string;
        id: string;
      };
      expect(typeof activationCall.communityId).toBe("string");
      expect(activationCall.communityId.length).toBeGreaterThan(0);
      expect(typeof activationCall.id).toBe("string");
    });

    it("generates a slug from the user name with lowercase and hyphens", async () => {
      const { mockInsertValues } = makeMockDb();
      createAuth(mockEnv);
      const hook = getAfterHook();

      await hook({
        id: "user-6",
        name: "Test User",
        email: "test@example.com",
      });

      const communityCall = mockInsertValues.mock.calls[0][0] as {
        slug: string;
      };
      // slug should be lowercase, hyphens, ends with nanoid suffix "-abc123"
      expect(communityCall.slug).toMatch(/^[a-z0-9-]+-abc123$/);
      expect(communityCall.slug).toContain("test-user");
    });

    it("community and member share the same communityId", async () => {
      const { mockInsertValues } = makeMockDb();
      createAuth(mockEnv);
      const hook = getAfterHook();

      await hook({
        id: "user-7",
        name: "Eve Arden",
        email: "eve@example.com",
      });

      const communityCall = mockInsertValues.mock.calls[0][0] as {
        id: string;
      };
      const memberCall = mockInsertValues.mock.calls[1][0] as {
        communityId: string;
      };
      expect(memberCall.communityId).toBe(communityCall.id);
    });

    describe("M-1: atomic transaction", () => {
      it("wraps all signup inserts and chart seeding in a single transaction", async () => {
        const mockTxInsertValues = vi.fn().mockResolvedValue(undefined);
        const mockTxInsert = vi.fn(() => ({ values: mockTxInsertValues }));
        const mockTx = { insert: mockTxInsert };
        const mockTransaction = vi.fn(
          async (cb: (tx: typeof mockTx) => Promise<void>) => {
            await cb(mockTx);
          },
        );
        const mockDb = {
          transaction: mockTransaction,
        } as unknown as Db;
        vi.mocked(createDb).mockReturnValue(mockDb);

        createAuth(mockEnv);
        const hook = getAfterHook();

        await hook({ id: "user-tx", name: "Tx User", email: "tx@test.com" });

        expect(mockTransaction).toHaveBeenCalledTimes(1);
        expect(mockTxInsert).toHaveBeenCalledTimes(4);
        expect(insertDefaultChartOfAccounts).toHaveBeenCalledWith(
          mockTx,
          "abc123",
        );
      });

      it("rolls back all inserts when transaction callback throws", async () => {
        const mockTxInsertValues = vi.fn().mockResolvedValue(undefined);
        const mockTxInsert = vi.fn(() => ({ values: mockTxInsertValues }));
        const mockTx = { insert: mockTxInsert };
        const mockTransaction = vi.fn(
          async (cb: (tx: typeof mockTx) => Promise<void>) => {
            // Simulate DB error partway through
            await cb(mockTx);
          },
        );
        // Make the transaction itself reject (simulating a rollback)
        mockTransaction.mockRejectedValueOnce(
          new Error("transaction rolled back"),
        );
        const mockDb = {
          transaction: mockTransaction,
        } as unknown as Db;
        vi.mocked(createDb).mockReturnValue(mockDb);

        createAuth(mockEnv);
        const hook = getAfterHook();

        await expect(
          hook({ id: "user-fail", name: "Fail User", email: "fail@test.com" }),
        ).rejects.toThrow("transaction rolled back");
      });
    });
  });

  describe("getAuth — no-cache, fresh instance per call", () => {
    it("returns an auth object each call", () => {
      const env1 = { ...mockEnv } as Env;
      const auth1 = getAuth(env1);
      expect(auth1).toBeDefined();
    });

    it("creates a fresh auth instance each call (avoids Cloudflare Workers I/O isolation errors across requests)", () => {
      // Caching auth across CF Worker requests causes "Cannot perform I/O on
      // behalf of a different request" because the postgres client is bound
      // to the originating request's I/O context.
      vi.mocked(betterAuth).mockClear();
      const env1 = { ...mockEnv } as Env;
      getAuth(env1);
      getAuth(env1);
      getAuth(env1);
      expect(vi.mocked(betterAuth).mock.calls.length).toBe(3);
    });
  });
});
