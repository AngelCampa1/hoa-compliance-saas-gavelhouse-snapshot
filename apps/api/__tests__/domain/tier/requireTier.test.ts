import { Hono } from "hono";
import { requireTier } from "../../../src/domain/tier/requireTier.js";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Db, Env as DbEnv } from "../../../src/db/client.js";

type MockDb = {
  select: () => {
    from: () => {
      where: () => {
        limit: () => Promise<{ stripePriceId: string | null }[]>;
      };
    };
  };
};

function mockDb(
  priceId: string | null | undefined,
  found = true,
): () => MockDb {
  return () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve(found ? [{ stripePriceId: priceId ?? null }] : []),
        }),
      }),
    }),
  });
}

function buildApp(
  createDbFn: () => MockDb,
  minimum: "starter" | "growth" | "scale" | "portfolio",
) {
  const app = new Hono();
  app.use("/*",
    requireTier(createDbFn as unknown as (env: DbEnv) => Db, minimum),
  );
  app.get("/test", (c) => c.json({ ok: true }, 200));
  app.post("/test", (c) => c.json({ ok: true }, 200));
  return app;
}

describe("requireTier middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no communityId in query or body", async () => {
    const app = buildApp(mockDb("price_scale"), "scale");
    const res = await app.request("/test");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "communityId required" });
  });

  it("returns 404 when community not found", async () => {
    const app = buildApp(mockDb(null, false), "scale");
    const res = await app.request("/test?communityId=cid-123");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "community not found" });
  });

  it("returns 403 when community has no stripePriceId (null → null tier, below minimum)", async () => {
    const app = buildApp(mockDb(null), "scale");
    const res = await app.request("/test?communityId=cid-123");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "upgrade_required", minimum: "scale" });
  });

  it("returns 403 when community is on starter tier but minimum is scale", async () => {
    const app = buildApp(mockDb("price_starter"), "scale");
    const res = await app.request("/test?communityId=cid-123");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "upgrade_required", minimum: "scale" });
  });

  it("returns 403 when stripePriceId is unknown", async () => {
    const app = buildApp(mockDb("price_unknown_xyz"), "scale");
    const res = await app.request("/test?communityId=cid-123");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "upgrade_required", minimum: "scale" });
  });

  it("calls next() (returns 200) when scale community meets scale minimum", async () => {
    const app = buildApp(mockDb("price_scale"), "scale");
    const res = await app.request("/test?communityId=cid-123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("calls next() when portfolio community meets scale minimum (portfolio > scale)", async () => {
    const app = buildApp(mockDb("price_portfolio"), "scale");
    const res = await app.request("/test?communityId=cid-123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 403 for growth community vs scale minimum", async () => {
    const app = buildApp(mockDb("price_growth"), "scale");
    const res = await app.request("/test?communityId=cid-123");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "upgrade_required", minimum: "scale" });
  });

  it("reads communityId from JSON body when not in query string (POST)", async () => {
    const app = buildApp(mockDb("price_scale"), "scale");
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "cid-from-body" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 400 when body has non-string communityId and no query param", async () => {
    const app = buildApp(mockDb("price_scale"), "scale");
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: 12345 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "communityId required" });
  });
});
