import { describe, expect, it } from "vitest";
import { app } from "../../src/index.js";
import type { Env } from "../../src/types/env.js";
import {
  buildHmacPayload,
  signHmacPayload,
  stableJson,
  verifyHmacSignature,
} from "../../src/routes/aiSdrContext.js";
import { buildGavelhouseAppContext } from "../../src/routes/aiCsContext.js";

const secret = "test-ai-cs-context-secret";

type NonceRow = { nonce: string; expiresAt: number };

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
              throw new Error("missing ai_cs_nonces table");
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
    AI_CS_CONTEXT_SECRET: secret,
    AI_CS_NONCE_DB: nonceDatabase(),
  };
}

async function signedHeaders(
  path: string,
  appId = "gavelhouse",
  userId = "user-1",
  nonce = "cs-nonce-123",
) {
  const timestamp = new Date().toISOString();
  const payload = await buildHmacPayload({
    timestamp,
    nonce,
    method: "GET",
    path,
    body: { appId, userId },
  });
  return {
    "X-Ventora-Timestamp": timestamp,
    "X-Ventora-Nonce": nonce,
    "X-Ventora-Signature": await signHmacPayload(payload, secret),
  };
}

const PATH = "/api/ai-cs/context?appId=gavelhouse&userId=user-1";

describe("GET /api/ai-cs/context", () => {
  it("returns a signed Gavelhouse app context for valid Worker requests", async () => {
    const response = await app.request(
      PATH,
      { headers: await signedHeaders(PATH) },
      env(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(response.headers.get("X-Ventora-Signature")).toMatch(
      /^[a-f0-9]{64}$/,
    );

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      assistantId: "ai-cs",
      appId: "gavelhouse",
      appName: "Gavelhouse",
      authenticatedOnly: true,
    });

    const payload = await buildHmacPayload({
      timestamp: response.headers.get("X-Ventora-Timestamp") ?? "",
      nonce: response.headers.get("X-Ventora-Nonce") ?? "",
      method: "GET",
      path: PATH,
      body: body as never,
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

  it("emits the exact canonical (key-sorted) bytes the response signature commits to", async () => {
    const response = await app.request(
      PATH,
      { headers: await signedHeaders(PATH) },
      env(),
    );

    expect(response.status).toBe(200);
    // The upstream Ventora Worker re-hashes the raw received bytes. Those bytes
    // must equal the canonical key-sorted serialization the X-Ventora-Signature
    // was computed over — not c.json's insertion-order serialization (which puts
    // `assistantId` first instead of the alphabetical `appId`).
    const raw = await response.text();
    expect(raw).toBe(stableJson(buildGavelhouseAppContext()));

    // And re-hashing those exact wire bytes must verify against the signature.
    const responsePayload = await buildHmacPayload({
      timestamp: response.headers.get("X-Ventora-Timestamp") ?? "",
      nonce: response.headers.get("X-Ventora-Nonce") ?? "",
      method: "GET",
      path: PATH,
      body: JSON.parse(raw) as never,
    });
    await expect(
      verifyHmacSignature({
        payload: responsePayload,
        signature: response.headers.get("X-Ventora-Signature") ?? "",
        secret,
        timestamp: response.headers.get("X-Ventora-Timestamp") ?? "",
      }),
    ).resolves.toBe(true);
  });

  it("rejects missing, invalid, stale, unknown-app, and missing-user requests safely", async () => {
    const missing = await app.request(PATH, {}, env());
    expect(missing.status).toBe(401);

    const invalid = await app.request(
      PATH,
      {
        headers: {
          "X-Ventora-Timestamp": new Date().toISOString(),
          "X-Ventora-Nonce": "cs-nonce-123",
          "X-Ventora-Signature": "0".repeat(64),
        },
      },
      env(),
    );
    expect(invalid.status).toBe(401);

    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const stalePayload = await buildHmacPayload({
      timestamp: staleTimestamp,
      nonce: "cs-nonce-stale",
      method: "GET",
      path: PATH,
      body: { appId: "gavelhouse", userId: "user-1" },
    });
    const stale = await app.request(
      PATH,
      {
        headers: {
          "X-Ventora-Timestamp": staleTimestamp,
          "X-Ventora-Nonce": "cs-nonce-stale",
          "X-Ventora-Signature": await signHmacPayload(stalePayload, secret),
        },
      },
      env(),
    );
    expect(stale.status).toBe(401);

    const unknownPath = "/api/ai-cs/context?appId=other&userId=user-1";
    const unknown = await app.request(
      unknownPath,
      { headers: await signedHeaders(unknownPath, "other") },
      env(),
    );
    expect(unknown.status).toBe(404);

    const noUserPath = "/api/ai-cs/context?appId=gavelhouse";
    const noUser = await app.request(noUserPath, {}, env());
    expect(noUser.status).toBe(401);
  });

  it("rejects replayed nonces inside the timestamp skew window", async () => {
    const headers = await signedHeaders(PATH);
    const configuredEnv = env();

    expect((await app.request(PATH, { headers }, configuredEnv)).status).toBe(
      200,
    );
    expect((await app.request(PATH, { headers }, configuredEnv)).status).toBe(
      401,
    );
  });

  it("fails closed when the context secret is not configured", async () => {
    const configuredEnv = env();
    delete configuredEnv.AI_CS_CONTEXT_SECRET;

    const response = await app.request(
      PATH,
      { headers: await signedHeaders(PATH) },
      configuredEnv,
    );
    expect(response.status).toBe(503);
  });

  it("fails closed when the nonce database binding is missing", async () => {
    const configuredEnv = env();
    delete configuredEnv.AI_CS_NONCE_DB;

    const response = await app.request(
      PATH,
      { headers: await signedHeaders(PATH) },
      configuredEnv,
    );
    expect(response.status).toBe(503);
  });

  it("fails closed when nonce persistence rejects the insert", async () => {
    const configuredEnv = env();
    configuredEnv.AI_CS_NONCE_DB = failingNonceDatabase();

    const response = await app.request(
      PATH,
      { headers: await signedHeaders(PATH) },
      configuredEnv,
    );
    expect(response.status).toBe(401);
  });

  it("fails closed when nonce persistence throws", async () => {
    const configuredEnv = env();
    configuredEnv.AI_CS_NONCE_DB = throwingNonceDatabase();

    const response = await app.request(
      PATH,
      { headers: await signedHeaders(PATH) },
      configuredEnv,
    );
    expect(response.status).toBe(503);
  });

  it("exposes only public in-app help surface area", () => {
    const context = buildGavelhouseAppContext();
    const serialized = JSON.stringify(context);

    expect(context.sources.length).toBeGreaterThan(0);
    expect(context.navigation.length).toBeGreaterThan(0);
    expect(context.workflow.length).toBeGreaterThan(0);
    expect(context.sources.length).toBeLessThanOrEqual(8);
    expect(context.workflow.every((step) => step.status === "next")).toBe(true);
    expect(serialized).toContain("Gavelhouse");
    expect(serialized).not.toMatch(
      /SECRET|TOKEN|DATABASE_URL|STRIPE|BETTER_AUTH|RESEND/i,
    );
  });
});
