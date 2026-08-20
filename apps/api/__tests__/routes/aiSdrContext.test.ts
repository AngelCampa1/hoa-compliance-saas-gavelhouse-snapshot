import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/index.js";
import type { Env } from "../../src/types/env.js";
import {
  buildGavelhouseContext,
  buildHmacPayload,
  clearAiSdrNonceCache,
  signHmacPayload,
  verifyHmacSignature,
} from "../../src/routes/aiSdrContext.js";

const secret = "test-context-secret";

type ContextBody = {
  productId: string;
  name: string;
  sources: Array<{ id: string; url?: string }>;
  plans: Array<{
    id: string;
    price: string;
    monthlyPrice: string;
    annualPrice: string;
    discount: string;
    defaultCadence: string;
    trialDays: number;
    ctaUrl: string;
    features: string[];
  }>;
};

type NonceRow = {
  nonce: string;
  expiresAt: number;
};

function nonceDatabase(): D1Database {
  const rows = new Map<string, NonceRow>();
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (sql.startsWith("DELETE")) {
                const cutoff = Number(values[0]);
                let changes = 0;
                for (const [nonce, row] of rows) {
                  if (row.expiresAt <= cutoff) {
                    rows.delete(nonce);
                    changes += 1;
                  }
                }
                return { success: true, meta: { changes } };
              }

              const nonce = String(values[0]);
              const expiresAt = Number(values[1]);
              if (rows.has(nonce)) {
                return { success: true, meta: { changes: 0 } };
              }
              rows.set(nonce, { nonce, expiresAt });
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function failingNonceDatabase(): D1Database {
  return {
    prepare() {
      return {
        bind() {
          return {
            async run() {
              return { success: false, meta: { changes: 0 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function throwingNonceDatabase(): D1Database {
  return {
    prepare() {
      return {
        bind() {
          return {
            async run() {
              throw new Error("missing ai_sdr_nonces table");
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function env(): Env {
  return {
    BETTER_AUTH_SECRET: "better-auth-secret",
    BETTER_AUTH_URL: "https://api.gavelhouse.app",
    APP_URL: "https://my.gavelhouse.app",
    STRIPE_SECRET_KEY: "stripe-secret",
    STRIPE_WEBHOOK_SECRET: "stripe-webhook-secret",
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
    STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual",
    STRIPE_PRICE_GROWTH_MONTHLY: "price_growth_monthly",
    STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_annual",
    STRIPE_PRICE_SCALE_MONTHLY: "price_scale_monthly",
    STRIPE_PRICE_SCALE_ANNUAL: "price_scale_annual",
    STRIPE_PRICE_PORTFOLIO_MONTHLY: "price_portfolio_monthly",
    STRIPE_PRICE_PORTFOLIO_ANNUAL: "price_portfolio_annual",
    RESEND_API_KEY: "resend-secret",
    AI_SDR_CONTEXT_SECRET: secret,
    AI_SDR_NONCE_DB: nonceDatabase(),
  };
}

async function signedHeaders(path: string, productId = "gavelhouse") {
  const timestamp = new Date().toISOString();
  const nonce = "nonce-123";
  const payload = await buildHmacPayload({
    timestamp,
    nonce,
    method: "GET",
    path,
    body: { productId },
  });
  return {
    "X-Ventora-Timestamp": timestamp,
    "X-Ventora-Nonce": nonce,
    "X-Ventora-Signature": await signHmacPayload(payload, secret),
  };
}

describe("GET /api/ai-sdr/context", () => {
  afterEach(() => {
    clearAiSdrNonceCache();
  });

  it("returns signed Gavelhouse product context for valid Worker requests", async () => {
    const path = "/api/ai-sdr/context?productId=gavelhouse";
    const response = await app.request(
      path,
      { headers: await signedHeaders(path) },
      env(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(response.headers.get("X-Ventora-Signature")).toMatch(
      /^[a-f0-9]{64}$/,
    );

    const body = (await response.json()) as ContextBody;
    expect(body).toMatchObject({
      productId: "gavelhouse",
      name: "Gavelhouse",
    });
    expect(body.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pricing",
          url: "https://gavelhouse.app/pricing/",
        }),
        expect.objectContaining({ id: "founder-contact" }),
      ]),
    );
    expect(body.plans.length).toBeGreaterThan(0);
    expect(body.plans[0]).toMatchObject({
      id: "starter",
      price: "$10/mo",
      monthlyPrice: "$12/mo",
      annualPrice: "$10/mo billed annually",
      discount: "Y80OFF: 80% off the first year",
      defaultCadence: "year",
      trialDays: 30,
      ctaUrl: "https://my.gavelhouse.app/signup",
    });

    const payload = await buildHmacPayload({
      timestamp: response.headers.get("X-Ventora-Timestamp") ?? "",
      nonce: response.headers.get("X-Ventora-Nonce") ?? "",
      method: "GET",
      path,
      body,
    });
    await expect(
      verifyHmacSignature({
        payload,
        signature: response.headers.get("X-Ventora-Signature") ?? "",
        secret,
        timestamp: response.headers.get("X-Ventora-Timestamp") ?? "",
      }),
    ).resolves.toBe(true);
  });

  it("sends byte-identical canonical JSON (wire body matches the HMAC-committed serialization)", async () => {
    const path = "/api/ai-sdr/context?productId=gavelhouse";
    const response = await app.request(
      path,
      { headers: await signedHeaders(path) },
      env(),
    );

    expect(response.status).toBe(200);
    const raw = await response.text();

    // The X-Ventora-Signature commits to stableJson(body) — the recursively
    // key-sorted serialization. The bytes actually sent must be that same
    // canonical string, or a consumer that re-hashes the received response body
    // computes a different digest and rejects the signature. c.json would emit
    // the ProductContext in insertion order (productId,name,description,...),
    // which is not alphabetical.
    const canonicalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (value !== null && typeof value === "object") {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
          sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
        }
        return sorted;
      }
      return value;
    };
    const expected = JSON.stringify(canonicalize(JSON.parse(raw)));
    expect(raw).toBe(expected);
  });

  it("rejects missing, invalid, stale, and unknown-product requests safely", async () => {
    const path = "/api/ai-sdr/context?productId=gavelhouse";
    const missing = await app.request(path, {}, env());
    expect(missing.status).toBe(401);

    const invalid = await app.request(
      path,
      {
        headers: {
          "X-Ventora-Timestamp": new Date().toISOString(),
          "X-Ventora-Nonce": "nonce-123",
          "X-Ventora-Signature": "0".repeat(64),
        },
      },
      env(),
    );
    expect(invalid.status).toBe(401);

    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const stalePayload = await buildHmacPayload({
      timestamp: staleTimestamp,
      nonce: "nonce-stale",
      method: "GET",
      path,
      body: { productId: "gavelhouse" },
    });
    const stale = await app.request(
      path,
      {
        headers: {
          "X-Ventora-Timestamp": staleTimestamp,
          "X-Ventora-Nonce": "nonce-stale",
          "X-Ventora-Signature": await signHmacPayload(stalePayload, secret),
        },
      },
      env(),
    );
    expect(stale.status).toBe(401);

    const malformed = await app.request(
      path,
      {
        headers: {
          "X-Ventora-Timestamp": "not-a-date",
          "X-Ventora-Nonce": "nonce-123",
          "X-Ventora-Signature": "not-hex",
        },
      },
      env(),
    );
    expect(malformed.status).toBe(401);

    const unknownPath = "/api/ai-sdr/context?productId=other";
    const unknown = await app.request(
      unknownPath,
      { headers: await signedHeaders(unknownPath, "other") },
      env(),
    );
    expect(unknown.status).toBe(404);
  });

  it("rejects replayed nonces inside the timestamp skew window", async () => {
    const path = "/api/ai-sdr/context?productId=gavelhouse";
    const headers = await signedHeaders(path);
    const configuredEnv = env();

    expect((await app.request(path, { headers }, configuredEnv)).status).toBe(
      200,
    );
    expect((await app.request(path, { headers }, configuredEnv)).status).toBe(
      401,
    );
  });

  it("uses D1 to atomically consume each nonce once", async () => {
    const path = "/api/ai-sdr/context?productId=gavelhouse";
    const configuredEnv = env();
    const headers = await signedHeaders(path);

    expect((await app.request(path, { headers }, configuredEnv)).status).toBe(
      200,
    );
    expect((await app.request(path, { headers }, configuredEnv)).status).toBe(
      401,
    );
  });

  it("fails closed when the context secret is not configured", async () => {
    const path = "/api/ai-sdr/context?productId=gavelhouse";
    const configuredEnv = env();
    delete configuredEnv.AI_SDR_CONTEXT_SECRET;

    const response = await app.request(
      path,
      { headers: await signedHeaders(path) },
      configuredEnv,
    );

    expect(response.status).toBe(503);
  });

  it("fails closed when the nonce database binding is missing", async () => {
    const path = "/api/ai-sdr/context?productId=gavelhouse";
    const configuredEnv = env();
    delete configuredEnv.AI_SDR_NONCE_DB;

    const response = await app.request(
      path,
      { headers: await signedHeaders(path) },
      configuredEnv,
    );

    expect(response.status).toBe(503);
  });

  it("fails closed when nonce persistence rejects the insert", async () => {
    const path = "/api/ai-sdr/context?productId=gavelhouse";
    const configuredEnv = env();
    configuredEnv.AI_SDR_NONCE_DB = failingNonceDatabase();

    const response = await app.request(
      path,
      { headers: await signedHeaders(path) },
      configuredEnv,
    );

    expect(response.status).toBe(401);
  });

  it("fails closed when nonce persistence throws", async () => {
    const path = "/api/ai-sdr/context?productId=gavelhouse";
    const configuredEnv = env();
    configuredEnv.AI_SDR_NONCE_DB = throwingNonceDatabase();

    const response = await app.request(
      path,
      { headers: await signedHeaders(path) },
      configuredEnv,
    );

    expect(response.status).toBe(503);
  });

  it("keeps product context limited to public source and plan fields", () => {
    const serialized = JSON.stringify(buildGavelhouseContext());

    expect(serialized).toContain("Gavelhouse");
    expect(serialized).not.toMatch(
      /SECRET|TOKEN|DATABASE_URL|STRIPE|BETTER_AUTH|RESEND/i,
    );
    expect(
      buildGavelhouseContext().plans.every((plan) => plan.features.length > 0),
    ).toBe(true);
  });

  it("canonicalizes HMAC bodies without undefined properties", async () => {
    const timestamp = new Date().toISOString();
    const nonce = "nonce-canonical";

    await expect(
      buildHmacPayload({
        timestamp,
        nonce,
        method: "get",
        path: "/api/ai-sdr/context?productId=gavelhouse",
        body: { productId: "gavelhouse", omitted: undefined },
      }),
    ).resolves.toBe(
      await buildHmacPayload({
        timestamp,
        nonce,
        method: "GET",
        path: "/api/ai-sdr/context?productId=gavelhouse",
        body: { productId: "gavelhouse" },
      }),
    );
  });
});
