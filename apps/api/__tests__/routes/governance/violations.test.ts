import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn().mockResolvedValue(null);
const mockAccess = vi.hoisted(() => ({
  assertFeatureTier: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
  })),
}));

vi.mock("../../../src/domain/policy/access.js", () => ({
  assertFeatureTier: mockAccess.assertFeatureTier,
}));

// Track sequential where() calls across the request
const whereResults: unknown[][] = [];
let whereCallIndex = 0;

const mockOrderBy = vi.fn().mockResolvedValue([]);
const mockUpdateReturning = vi.fn().mockResolvedValue([]);
const mockSet = vi.fn().mockReturnThis();

const mockTx = {
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi
    .fn()
    .mockResolvedValue([{ id: "v1", status: "notified", communityId: "c1" }]),
};

// Each call to where() returns a thenable chainable with .orderBy() and .returning()
function createWhereMock() {
  return vi.fn().mockImplementation(() => {
    const result = whereResults[whereCallIndex] ?? [];
    whereCallIndex++;
    const chainable = {
      // Thenable — so await where() resolves to result
      then(
        onFulfilled: (v: unknown[]) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
      // Chainable for .orderBy(...)
      orderBy: mockOrderBy,
      // Chainable for .returning() in update chains
      returning: mockUpdateReturning,
    };
    return chainable;
  });
}

const mockWhere = createWhereMock();

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: mockWhere,
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: mockSet,
    returning: mockUpdateReturning,
    transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx),
    ),
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "test-id"),
}));

const mockCaptureEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
}));

import router from "../../../src/routes/governance/violations.js";

function setSession(userId = "u1") {
  mockGetSession.mockResolvedValue({ user: { id: userId } });
}

/** Set up sequential where() call results for the next request */
function setupWhereResults(...results: unknown[][]) {
  whereResults.length = 0;
  whereCallIndex = 0;
  results.forEach((r) => whereResults.push(r));
}

beforeEach(() => {
  mockGetSession.mockResolvedValue(null);
  mockAccess.assertFeatureTier.mockClear();
  mockAccess.assertFeatureTier.mockResolvedValue(undefined);
  mockOrderBy.mockClear();
  mockOrderBy.mockResolvedValue([]);
  mockUpdateReturning.mockResolvedValue([]);
  mockSet.mockClear();
  mockSet.mockReturnThis();
  mockTx.update.mockReturnThis();
  mockTx.set.mockReturnThis();
  mockTx.where.mockReturnThis();
  mockTx.insert.mockReturnThis();
  mockTx.values.mockReturnThis();
  mockTx.returning.mockResolvedValue([
    { id: "v1", status: "notified", communityId: "c1" },
  ]);
  mockCaptureEvent.mockReset();
  mockCaptureEvent.mockResolvedValue(undefined);
  setupWhereResults(); // empty by default → []
});

describe("GET /governance/violations", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/violations?communityId=c1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 without communityId", async () => {
    setSession();
    const res = await router.fetch(
      new Request("http://localhost/governance/violations"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when not a member", async () => {
    setSession();
    setupWhereResults([]); // membership check → not found
    const res = await router.fetch(
      new Request("http://localhost/governance/violations?communityId=c1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with violations list for members", async () => {
    setSession();
    setupWhereResults([{ role: "admin", communityId: "c1", userId: "u1" }]);
    mockOrderBy.mockResolvedValueOnce([
      { id: "v1", communityId: "c1", title: "Trash", status: "open" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations?communityId=c1"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { violations: unknown[] };
    expect(Array.isArray(body.violations)).toBe(true);
  });
});

describe("POST /governance/violations", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Trash",
          description: "Bins left out",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for member without write role", async () => {
    setSession();
    setupWhereResults([{ role: "member", communityId: "c1", userId: "u1" }]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Trash",
          description: "Bins left out",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-member", async () => {
    setSession();
    setupWhereResults([]); // no membership row
    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Trash",
          description: "Bins left out",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("creates violation and returns 201", async () => {
    setSession();
    setupWhereResults([{ role: "secretary", communityId: "c1", userId: "u1" }]);
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "v1", communityId: "c1", title: "Trash", status: "open" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Trash",
          description: "Bins left out",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { violation: { id: string } };
    expect(body.violation.id).toBe("v1");
  });

  it("captures violation creation analytics without title, description, or owner ids", async () => {
    setSession();
    setupWhereResults(
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
      [{ id: "unit-1", communityId: "c1" }],
      [{ id: "homeowner-1", communityId: "c1" }],
      [{ id: "ownership-1" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "v1", communityId: "c1", title: "Trash", status: "open" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          unitId: "unit-1",
          homeownerId: "homeowner-1",
          title: "Trash cans visible",
          description: "Bins left out by the driveway",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_item_created",
      {
        community_id: "c1",
        item_id: "v1",
        item_type: "violation",
        status: "open",
        has_unit: true,
        has_homeowner: true,
        role: "secretary",
      },
      "u1",
      {},
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("Trash cans visible");
    expect(calls).not.toContain("Bins left out");
    expect(calls).not.toContain("unit-1");
    expect(calls).not.toContain("homeowner-1");
  });

  it("still returns 201 when violation analytics capture fails", async () => {
    setSession();
    setupWhereResults([{ role: "secretary", communityId: "c1", userId: "u1" }]);
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "v1", communityId: "c1", title: "Trash", status: "open" },
    ]);
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Trash",
          description: "Bins left out",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(201);
  });

  it("returns 404 when supplied unit does not belong to the community", async () => {
    setSession();
    setupWhereResults(
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
      [],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          unitId: "unit-other",
          title: "Trash",
          description: "Bins left out",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Unit not found" });
  });

  it("returns 404 when supplied homeowner does not belong to the community", async () => {
    setSession();
    setupWhereResults(
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
      [{ id: "unit-1", communityId: "c1" }],
      [],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          unitId: "unit-1",
          homeownerId: "homeowner-other",
          title: "Trash",
          description: "Bins left out",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Homeowner not found" });
  });

  it("returns 400 when supplied homeowner does not own supplied unit", async () => {
    setSession();
    setupWhereResults(
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
      [{ id: "unit-1", communityId: "c1" }],
      [{ id: "homeowner-1", communityId: "c1" }],
      [],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          unitId: "unit-1",
          homeownerId: "homeowner-1",
          title: "Trash",
          description: "Bins left out",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Homeowner does not own unit",
    });
  });

  it("returns 400 for invalid json schema (missing required fields)", async () => {
    setSession();
    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({ communityId: "c1" }), // missing title/description
        headers: { "Content-Type": "application/json" },
      }),
    );
    // zValidator returns 400 by default
    expect(res.status).toBe(400);
  });
  it("rejects request body with unknown fields (e.g. status override attempt)", async () => {
    setSession();
    // No membership needed — schema validation rejects before DB is reached
    const res = await router.fetch(
      new Request("http://localhost/governance/violations", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Trash",
          description: "Bins left out",
          status: "closed", // attacker attempts to override server-set status
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /governance/violations/:id/status", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "notified" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when violation not found", async () => {
    setSession();
    setupWhereResults([]); // no violation found
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v99/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "notified" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when not a write member", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "member", communityId: "c1", userId: "u1" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "notified" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid transition (closed → open)", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "closed", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "open" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(422);
  });

  it("transitions status and returns 200", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    mockTx.returning.mockResolvedValueOnce([
      { id: "v1", status: "notified", communityId: "c1" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "notified" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { violation: { status: string } };
    expect(body.violation.status).toBe("notified");
  });

  it("transitions with note", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "owner", communityId: "c1", userId: "u1" }],
    );
    mockTx.returning.mockResolvedValueOnce([
      { id: "v1", status: "cured", communityId: "c1" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/status", {
        method: "PATCH",
        body: JSON.stringify({
          status: "cured",
          note: "Owner fixed the issue",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
  });
  it("returns 409 without inserting an event when a concurrent transition already changed the status (atomic re-check loses)", async () => {
    setSession();
    // Pre-check reads the violation as "open", so isValidTransition(open →
    // notified) passes...
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    // ...but the status-guarded UPDATE inside the transaction matches zero
    // rows because a concurrent transition already moved it off "open". The
    // loser must NOT insert a violationEvents row or emit an analytics event.
    mockTx.returning.mockResolvedValueOnce([]);
    // The shared insert mock is only re-bound (not cleared) between tests, so
    // measure the delta across this request rather than absolute call count.
    const insertCallsBefore = mockTx.insert.mock.calls.length;
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "notified" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(409);
    expect(mockTx.insert.mock.calls.length).toBe(insertCallsBefore);
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "governance_violation_status_updated",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
  it("captures violation status analytics without note, title, or description", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "v1",
          communityId: "c1",
          status: "open",
          title: "Private violation title",
          description: "Private violation description",
          photoKeys: null,
        },
      ],
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
    );
    mockTx.returning.mockResolvedValueOnce([
      { id: "v1", status: "notified", communityId: "c1" },
    ]);

    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/status", {
        method: "PATCH",
        body: JSON.stringify({
          status: "notified",
          note: "Private status note",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(200);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_violation_status_updated",
      {
        community_id: "c1",
        from_status: "open",
        role: "secretary",
        to_status: "notified",
        violation_id: "v1",
      },
      "u1",
      {},
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("Private status note");
    expect(calls).not.toContain("Private violation title");
    expect(calls).not.toContain("Private violation description");
  });
});

describe("GET /governance/violations/:id/events", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/events"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when violation not found", async () => {
    setSession();
    setupWhereResults([]); // no violation
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/events"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when not a member", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [], // no membership
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/events"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with events list", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ id: "e1", violationId: "v1", toStatus: "open" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/events"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[] };
    expect(Array.isArray(body.events)).toBe(true);
  });

  it("orders events by occurrence so the history is deterministic", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ id: "e1", violationId: "v1", toStatus: "open" }],
    );

    await router.fetch(
      new Request("http://localhost/governance/violations/v1/events"),
    );

    expect(mockOrderBy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryChunks: expect.arrayContaining([
          expect.objectContaining({ name: "occurred_at" }),
        ]),
      }),
      expect.objectContaining({
        queryChunks: expect.arrayContaining([
          expect.objectContaining({ name: "id" }),
        ]),
      }),
    );
  });
});

describe("POST /governance/violations/:id/photos", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: new ArrayBuffer(8),
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when violation not found", async () => {
    setSession();
    setupWhereResults([]); // no violation
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v99/photos", {
        method: "POST",
        body: new ArrayBuffer(8),
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-write member", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "member", communityId: "c1", userId: "u1" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: new ArrayBuffer(8),
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 415 for disallowed content type", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: "<script>alert(1)</script>",
        headers: { "Content-Type": "text/html" },
      }),
    );
    expect(res.status).toBe(415);
  });

  it("returns 409 when adding a photo to a closed (terminal) violation", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "closed", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    // Valid JPEG magic bytes so only the terminal-state guard can reject this.
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: jpegMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(res.status).toBe(409);
    // A closed violation is an immutable audit record — nothing is stored.
    expect(mockBucket.put).not.toHaveBeenCalled();
  });

  it("checks governance workflow tier before accepting photo uploads", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    const mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
    };

    await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: new ArrayBuffer(8),
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );

    expect(mockAccess.assertFeatureTier).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      "governance-workflows",
    );
  });

  it("returns 503 when GOVERNANCE_BUCKET is not configured", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    // Pass no env bindings — GOVERNANCE_BUCKET will be undefined
    // Use JPEG magic bytes so the body passes validation before the bucket check
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: jpegMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      {}, // no GOVERNANCE_BUCKET
    );
    expect(res.status).toBe(503);
  });

  it("returns 415 when content-type header is missing", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    // No Content-Type header → content-type is null → ?? "" → validateUploadContentType("") = false
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: new ArrayBuffer(8),
      }),
    );
    expect(res.status).toBe(415);
  });

  it("uploads photo and returns 201 with key", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "v1",
        communityId: "c1",
        status: "open",
        photoKeys: ["c1/violations/v1/test-id.jpeg"],
      },
    ]);
    const mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
    };
    // Use JPEG magic bytes so sniffUploadType validates the body
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: jpegMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      key: string;
      violation: { photoKeys: string[] };
    };
    expect(typeof body.key).toBe("string");
    expect(mockBucket.put).toHaveBeenCalledOnce();
  });
  it("captures violation photo uploads without file key", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "v1",
        communityId: "c1",
        status: "open",
        photoKeys: ["c1/violations/v1/test-id.jpeg"],
      },
    ]);
    const mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
    };
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);

    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: jpegMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );

    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_photo_uploaded",
      {
        community_id: "c1",
        file_type: "image/jpeg",
        role: "admin",
        size_bucket: "small",
        violation_id: "v1",
      },
      "u1",
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain(
      "c1/violations/v1/test-id.jpeg",
    );
  });

  it("returns 413 when Content-Length exceeds MAX_UPLOAD_BYTES (10 MB)", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: new ArrayBuffer(8),
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(11 * 1024 * 1024), // 11 MB
        },
      }),
      { GOVERNANCE_BUCKET: { put: vi.fn().mockResolvedValue(undefined) } },
    );
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/too large/i);
  });

  it("returns 413 when the uploaded body exceeds MAX_UPLOAD_BYTES without a large content length", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    const tooLargeJpeg = new Uint8Array(11 * 1024 * 1024);
    tooLargeJpeg.set([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: tooLargeJpeg.buffer,
        headers: { "Content-Type": "image/jpeg", "Content-Length": "0" },
      }),
      { GOVERNANCE_BUCKET: { put: vi.fn().mockResolvedValue(undefined) } },
    );

    expect(res.status).toBe(413);
  });

  it("captures medium-sized photo uploads with a medium size bucket", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "v1",
        communityId: "c1",
        status: "open",
        photoKeys: ["c1/violations/v1/test-id.jpeg"],
      },
    ]);
    const mediumJpeg = new Uint8Array(2 * 1024 * 1024);
    mediumJpeg.set([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: mediumJpeg.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );

    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_photo_uploaded",
      expect.objectContaining({ size_bucket: "medium" }),
      "u1",
      { GOVERNANCE_BUCKET: mockBucket },
    );
  });

  it("rejects files whose magic bytes don't match allowed image types — returns 415", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    // Send a body that starts with ELF header (executable) but claims image/jpeg
    const elfHeader = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x00]);
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: elfHeader.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: { put: vi.fn().mockResolvedValue(undefined) } },
    );
    expect(res.status).toBe(415);
  });

  it("rejects a PDF content-type header — violation photos are image-only (415)", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: pdfMagic.buffer,
        headers: { "Content-Type": "application/pdf" },
      }),
      { GOVERNANCE_BUCKET: { put: vi.fn().mockResolvedValue(undefined) } },
    );
    expect(res.status).toBe(415);
  });

  it("rejects a %PDF body even when content-type claims an image — image-only sniff (415)", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    // Body is a real PDF (magic bytes %PDF) but header claims image/jpeg to slip
    // past the header gate; the image-only sniff must still reject it.
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: pdfMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: { put: vi.fn().mockResolvedValue(undefined) } },
    );
    expect(res.status).toBe(415);
  });

  it("accepts a valid JPEG (magic bytes FF D8 FF) despite correct content-type", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "v1",
        communityId: "c1",
        status: "open",
        photoKeys: ["c1/violations/v1/test-id.jpeg"],
      },
    ]);
    // JPEG magic bytes: FF D8 FF
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: jpegMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(res.status).toBe(201);
  });

  it("derives extension from magic bytes not content-type header — PNG magic with image/jpeg header uses .png", async () => {
    setSession();
    setupWhereResults(
      [{ id: "v1", communityId: "c1", status: "open", photoKeys: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "v1",
        communityId: "c1",
        status: "open",
        photoKeys: ["c1/violations/v1/test-id.png"],
      },
    ]);
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    const pngMagic = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    const res = await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: pngMagic.buffer,
        // Deliberately mismatched Content-Type — handler should use magic bytes
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string };
    expect(body.key).toMatch(/\.png$/);
  });

  it("appends photo keys atomically instead of rewriting a stale array", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "v1",
          communityId: "c1",
          status: "open",
          photoKeys: ["existing.jpg"],
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "v1",
        communityId: "c1",
        status: "open",
        photoKeys: ["existing.jpg", "c1/violations/v1/test-id.jpeg"],
      },
    ]);

    // Use JPEG magic bytes so sniffUploadType passes
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    await router.fetch(
      new Request("http://localhost/governance/violations/v1/photos", {
        method: "POST",
        body: jpegMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: { put: vi.fn().mockResolvedValue(undefined) } },
    );

    const setArg = mockSet.mock.calls[0]?.[0] as {
      photoKeys?: { queryChunks?: Array<string | { value?: string[] }> };
    };
    const sqlText = setArg.photoKeys?.queryChunks
      ?.map((chunk) =>
        typeof chunk === "string" ? chunk : (chunk.value?.join("") ?? ""),
      )
      .join("");
    expect(sqlText).toContain("coalesce(");
    expect(sqlText).toContain("|| ARRAY[");
  });
});
