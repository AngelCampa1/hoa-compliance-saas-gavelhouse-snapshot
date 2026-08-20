import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  enforceBoardUserLimit,
  enforceFeatureTier,
  enforceHomeLimit,
  getCommunityMembership,
  getCommunityTier,
  getCommunityTierResult,
  assertBoardUserLimit,
  assertFeatureTier,
  assertHomeLimit,
  requireCapability,
  requireFeatureTier,
} from "../../../src/domain/policy/access.js";
import type { Db } from "../../../src/db/client.js";

type RowSet = unknown[];

function query(rows: RowSet) {
  const promise = Promise.resolve(rows);
  return {
    where: () => query(rows),
    limit: () => promise,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    [Symbol.toStringTag]: "Promise",
  };
}

function dbWithRows(...rowSets: RowSet[]): Db {
  const queues = [...rowSets];
  return {
    select: () => {
      const rows = queues.shift() ?? [];
      return {
        from: () => query(rows),
      };
    },
  } as unknown as Db;
}

function brokenDb(error: unknown): Db {
  return {
    select: () => {
      throw error;
    },
  } as unknown as Db;
}

// First select resolves the tier (empty subscription + community price id),
// then the count query throws to exercise error propagation in limit checks.
function dbWithRowsThenBrokenCount(error: unknown): Db {
  const rows = [[], [{ stripePriceId: "price_starter" }]];
  return {
    select: () => {
      const next = rows.shift();
      if (!next) throw error;
      return {
        from: () => query(next),
      };
    },
  } as unknown as Db;
}

describe("access policy helpers", () => {
  it("prefers active subscription tier over legacy community price id", async () => {
    const db = dbWithRows(
      [{ status: "active", tier: "growth" }],
      [{ stripePriceId: "price_starter" }],
    );

    await expect(getCommunityTier(db, "community-1")).resolves.toBe("growth");
  });

  it("treats trialing communities as the full self-serve Scale tier", async () => {
    const db = dbWithRows(
      [{ status: "trialing", tier: "starter" }],
      [{ stripePriceId: "price_starter" }],
    );

    await expect(getCommunityTier(db, "community-1")).resolves.toBe("scale");
  });

  it("denies full-tier access when a local trial has lapsed but the DB still says trialing", async () => {
    // A local (non-Stripe) trial only flips to "expired" via a once-daily cron
    // sweep. The entitlement gate must not trust the raw status column — a
    // lapsed trial whose sweep has not run (or failed) must not retain access.
    const pastTrialEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const db = dbWithRows(
      [
        {
          status: "trialing",
          tier: "starter",
          stripeSubscriptionId: null,
          trialEndsAt: pastTrialEnd,
        },
      ],
      [{ stripePriceId: null }],
    );

    await expect(getCommunityTierResult(db, "community-1")).resolves.toEqual({
      found: true,
      tier: null,
    });
  });

  it("still grants the full trial tier while a local trial is active", async () => {
    const futureTrialEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const db = dbWithRows(
      [
        {
          status: "trialing",
          tier: "starter",
          stripeSubscriptionId: null,
          trialEndsAt: futureTrialEnd,
        },
      ],
      [{ stripePriceId: "price_starter" }],
    );

    await expect(getCommunityTier(db, "community-1")).resolves.toBe("scale");
  });

  it("keeps the full trial tier for a Stripe-backed trial even past trialEndsAt (Stripe manages expiry)", async () => {
    const pastTrialEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const db = dbWithRows(
      [
        {
          status: "trialing",
          tier: "starter",
          stripeSubscriptionId: "sub_live",
          trialEndsAt: pastTrialEnd,
        },
      ],
      [{ stripePriceId: "price_starter" }],
    );

    await expect(getCommunityTier(db, "community-1")).resolves.toBe("scale");
  });

  it("falls back to legacy community price id when subscription is inactive", async () => {
    const db = dbWithRows(
      [{ status: "pending_trial", tier: "growth" }],
      [{ stripePriceId: "price_scale" }],
    );

    await expect(getCommunityTier(db, "community-1")).resolves.toBe("scale");
  });

  it("returns the community price id tier when the first select yields a price id", async () => {
    const db = dbWithRows([{ stripePriceId: "price_growth" }]);

    await expect(getCommunityTierResult(db, "community-1")).resolves.toEqual({
      found: true,
      tier: "growth",
    });
  });

  it("reports missing communities separately from communities without a tier", async () => {
    await expect(
      getCommunityTierResult(dbWithRows([], []), "missing"),
    ).resolves.toEqual({
      found: false,
      tier: null,
    });
    await expect(
      getCommunityTierResult(dbWithRows([], [{ stripePriceId: null }]), "free"),
    ).resolves.toEqual({
      found: true,
      tier: null,
    });
  });

  it("treats existing community rows without a selected stripePriceId as the full self-serve Scale tier", async () => {
    await expect(
      getCommunityTier(dbWithRows([], [{ id: "community-1" }]), "id"),
    ).resolves.toBe("scale");
  });

  it("propagates tier lookup errors instead of swallowing them", async () => {
    await expect(
      getCommunityTierResult(brokenDb(new Error("boom")), "community-1"),
    ).rejects.toThrow("boom");
    await expect(
      getCommunityTierResult(
        brokenDb(new TypeError("db.select(...).from is not a function")),
        "community-1",
      ),
    ).rejects.toThrow("db.select(...).from is not a function");
  });

  it("reads memberships from limit-capable and promise-like query mocks", async () => {
    await expect(
      getCommunityMembership(dbWithRows([{ role: "owner" }]), "c1", "u1"),
    ).resolves.toEqual({ role: "owner" });

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ role: "viewer" }]),
        }),
      }),
    } as unknown as Db;
    await expect(getCommunityMembership(db, "c1", "u1")).resolves.toEqual({
      role: "viewer",
    });
  });

  it("requires named role capabilities", async () => {
    await expect(
      requireCapability(
        dbWithRows([{ role: "owner" }]),
        "c1",
        "u1",
        "member:invite",
      ),
    ).resolves.toEqual({ role: "owner" });
    await expect(
      requireCapability(
        dbWithRows([{ role: "viewer" }]),
        "c1",
        "u1",
        "member:invite",
      ),
    ).rejects.toThrow("forbidden");
    await expect(
      requireCapability(dbWithRows([]), "c1", "u1", "member:invite"),
    ).rejects.toThrow("forbidden");
  });

  it("enforces feature tiers with API response shape", async () => {
    const denied = await enforceFeatureTier(
      dbWithRows([], [{ stripePriceId: "price_starter" }]),
      "c1",
      "owner-operations",
    );
    expect(denied?.status).toBe(403);
    await expect(denied?.json()).resolves.toEqual({
      error: "upgrade_required",
      minimum: "growth",
    });

    await expect(
      enforceFeatureTier(
        dbWithRows([], [{ stripePriceId: "price_growth" }]),
        "c1",
        "owner-operations",
      ),
    ).resolves.toBeNull();
  });

  it("assert helpers throw Hono responses for denied policies", async () => {
    await expect(
      assertFeatureTier(
        dbWithRows([], [{ stripePriceId: "price_starter" }]),
        "c1",
        "audit-pack",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertHomeLimit(
        dbWithRows([], [{ stripePriceId: "price_starter" }], [{ value: 50 }]),
        "c1",
        1,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertBoardUserLimit(
        dbWithRows(
          [],
          [{ stripePriceId: "price_starter" }],
          [{ value: 3 }],
          [{ value: 0 }],
        ),
        "c1",
        1,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("enforces home limits against active homes", async () => {
    await expect(
      enforceHomeLimit(
        dbWithRows([], [{ stripePriceId: "price_portfolio" }]),
        "c1",
        1000,
      ),
    ).resolves.toBeNull();
    await expect(
      enforceHomeLimit(
        dbWithRows([], [{ stripePriceId: "price_starter" }], [{ value: 49 }]),
        "c1",
        1,
      ),
    ).resolves.toBeNull();
    await expect(
      enforceHomeLimit(
        dbWithRows([], [{ stripePriceId: "price_starter" }], []),
        "c1",
        1,
      ),
    ).resolves.toBeNull();

    const denied = await enforceHomeLimit(
      dbWithRows([], [{ stripePriceId: "price_starter" }], [{ value: 50 }]),
      "c1",
      1,
    );
    expect(denied?.status).toBe(403);
    await expect(denied?.json()).resolves.toEqual({
      error: "limit_exceeded",
      limit: "homes",
      maximum: 50,
    });
  });

  it("propagates home-limit count errors", async () => {
    await expect(
      enforceHomeLimit(
        dbWithRowsThenBrokenCount(
          new TypeError("db.select(...).from is not a function"),
        ),
        "c1",
        1,
      ),
    ).rejects.toThrow("db.select(...).from is not a function");
    await expect(
      enforceHomeLimit(
        dbWithRowsThenBrokenCount(new Error("home count")),
        "c1",
        1,
      ),
    ).rejects.toThrow("home count");
  });

  it("enforces board-user limits including pending invites", async () => {
    await expect(
      enforceBoardUserLimit(
        dbWithRows([], [{ stripePriceId: "price_scale" }]),
        "c1",
        100,
      ),
    ).resolves.toBeNull();
    await expect(
      enforceBoardUserLimit(
        dbWithRows(
          [],
          [{ stripePriceId: "price_starter" }],
          [{ value: 2 }],
          [{ value: 0 }],
        ),
        "c1",
        1,
      ),
    ).resolves.toBeNull();
    await expect(
      enforceBoardUserLimit(
        dbWithRows([], [{ stripePriceId: "price_starter" }], [], []),
        "c1",
        1,
      ),
    ).resolves.toBeNull();

    const denied = await enforceBoardUserLimit(
      dbWithRows(
        [],
        [{ stripePriceId: "price_starter" }],
        [{ value: 2 }],
        [{ value: 1 }],
      ),
      "c1",
      1,
    );
    expect(denied?.status).toBe(403);
    await expect(denied?.json()).resolves.toEqual({
      error: "limit_exceeded",
      limit: "board_users",
      maximum: 3,
    });
  });

  it("propagates board-user count errors", async () => {
    await expect(
      enforceBoardUserLimit(
        dbWithRowsThenBrokenCount(
          new TypeError("db.select(...).from is not a function"),
        ),
        "c1",
        1,
      ),
    ).rejects.toThrow("db.select(...).from is not a function");
    await expect(
      enforceBoardUserLimit(
        dbWithRowsThenBrokenCount(new Error("member count")),
        "c1",
        1,
      ),
    ).rejects.toThrow("member count");
  });

  it("uses growth, scale, and portfolio minimums in feature middleware", async () => {
    const app = new Hono();
    app.use(
      "/growth",
      requireFeatureTier(
        () => dbWithRows([], [{ stripePriceId: "price_starter" }]),
        "governance-workflows",
      ),
    );
    app.get("/growth", (c) => c.json({ ok: true }));
    app.use(
      "/scale",
      requireFeatureTier(
        () => dbWithRows([], [{ stripePriceId: "price_growth" }]),
        "reports",
      ),
    );
    app.get("/scale", (c) => c.json({ ok: true }));
    app.use(
      "/portfolio",
      requireFeatureTier(
        () => dbWithRows([], [{ stripePriceId: "price_scale" }]),
        "portfolio-rollups",
      ),
    );
    app.get("/portfolio", (c) => c.json({ ok: true }));
    app.use(
      "/allowed",
      requireFeatureTier(
        () => dbWithRows([], [{ stripePriceId: "price_scale" }]),
        "audit-pack",
      ),
    );
    app.get("/allowed", (c) => c.json({ ok: true }));

    await expect(
      (await app.request("/growth?communityId=c1")).json(),
    ).resolves.toEqual({ error: "upgrade_required", minimum: "growth" });
    await expect(
      (await app.request("/scale?communityId=c1")).json(),
    ).resolves.toEqual({ error: "upgrade_required", minimum: "scale" });
    await expect(
      (await app.request("/portfolio?communityId=c1")).json(),
    ).resolves.toEqual({
      error: "upgrade_required",
      minimum: "portfolio",
    });
    expect((await app.request("/allowed?communityId=c1")).status).toBe(200);
  });

  it("reads feature middleware communityId from body and handles missing ids", async () => {
    const app = new Hono();
    app.use(
      "/body",
      requireFeatureTier(
        () => dbWithRows([], [{ stripePriceId: "price_growth" }]),
        "owner-operations",
      ),
    );
    app.post("/body", (c) => c.json({ ok: true }));

    expect((await app.request("/body")).status).toBe(400);
    expect(
      (
        await app.request("/body", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: "c1" }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request("/body", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: 123 }),
        })
      ).status,
    ).toBe(400);
  });
});
