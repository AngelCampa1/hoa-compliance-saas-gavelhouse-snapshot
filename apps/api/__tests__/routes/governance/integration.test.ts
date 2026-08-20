import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([]),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  })),
}));
vi.mock("../../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({
    api: { getSession: vi.fn().mockResolvedValue(null) },
  })),
}));

import app from "../../../src/index.js";

describe("governance routes mounted on app", () => {
  it("GET /governance/homeowners is reachable (returns 401 not 404)", async () => {
    const res = await app.fetch(
      new Request("http://localhost/governance/homeowners?communityId=c1"),
    );
    expect(res.status).toBe(401);
  });
  it("GET /governance/violations is reachable", async () => {
    const res = await app.fetch(
      new Request("http://localhost/governance/violations?communityId=c1"),
    );
    expect(res.status).toBe(401);
  });
  it("GET /governance/arch-requests is reachable", async () => {
    const res = await app.fetch(
      new Request("http://localhost/governance/arch-requests?communityId=c1"),
    );
    expect(res.status).toBe(401);
  });
  it("GET /governance/meetings is reachable", async () => {
    const res = await app.fetch(
      new Request("http://localhost/governance/meetings?communityId=c1"),
    );
    expect(res.status).toBe(401);
  });
  it("GET /governance/transitions is reachable", async () => {
    const res = await app.fetch(
      new Request("http://localhost/governance/transitions?communityId=c1"),
    );
    expect(res.status).toBe(401);
  });
  it("POST /owner/sessions is reachable", async () => {
    const res = await app.fetch(
      new Request("http://localhost/owner/sessions", {
        method: "POST",
        body: JSON.stringify({ homeownerId: "h1", communityId: "c1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
