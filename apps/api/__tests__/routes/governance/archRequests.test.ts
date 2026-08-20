import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn().mockResolvedValue(null);

vi.mock("../../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({ api: { getSession: mockGetSession } })),
}));

const whereResults: unknown[][] = [];
let whereCallIndex = 0;
const mockOrderBy = vi.fn().mockResolvedValue([]);
const mockUpdateReturning = vi.fn().mockResolvedValue([]);

function createWhereMock() {
  return vi.fn().mockImplementation(() => {
    const result = whereResults[whereCallIndex] ?? [];
    whereCallIndex++;
    const chainable = {
      then(
        onFulfilled: (v: unknown[]) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
      limit: vi.fn().mockImplementation(() => Promise.resolve(result)),
      orderBy: mockOrderBy,
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
    returning: mockUpdateReturning,
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "test-id"),
}));

const mockCaptureEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
}));

import router from "../../../src/routes/governance/archRequests.js";

function collectSqlParamValues(
  value: unknown,
  seen = new Set<unknown>(),
): unknown[] {
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  if (value.constructor.name === "Param") {
    return [(value as { value: unknown }).value];
  }

  return Object.values(value).flatMap((nestedValue) =>
    collectSqlParamValues(nestedValue, seen),
  );
}

function setSession(userId = "u1") {
  mockGetSession.mockResolvedValue({ user: { id: userId } });
}

function setupWhereResults(...results: unknown[][]) {
  whereResults.length = 0;
  whereCallIndex = 0;
  results.forEach((r) => whereResults.push(r));
}

beforeEach(() => {
  mockGetSession.mockResolvedValue(null);
  mockOrderBy.mockResolvedValue([]);
  mockUpdateReturning.mockResolvedValue([]);
  mockCaptureEvent.mockReset();
  mockCaptureEvent.mockResolvedValue(undefined);
  setupWhereResults();
});

describe("GET /governance/arch-requests", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests?communityId=c1"),
    );
    expect(res.status).toBe(401);
  });
  it("returns 400 without communityId", async () => {
    setSession();
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests"),
    );
    expect(res.status).toBe(400);
  });
  it("returns 403 when not a member", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests?communityId=c1"),
    );
    expect(res.status).toBe(403);
  });
  it("returns 200 with list for members", async () => {
    setSession();
    setupWhereResults(
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockOrderBy.mockResolvedValueOnce([{ id: "ar1", status: "pending" }]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests?communityId=c1"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { archRequests: unknown[] };
    expect(Array.isArray(body.archRequests)).toBe(true);
  });
});

describe("POST /governance/arch-requests", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          requestType: "Fence",
          description: "6ft fence",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("returns 403 for non-member", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          requestType: "Fence",
          description: "desc",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 403 for member without write role", async () => {
    setSession();
    setupWhereResults([{ role: "member", communityId: "c1", userId: "u1" }]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          requestType: "Fence",
          description: "desc",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("creates arch request and returns 201", async () => {
    setSession();
    setupWhereResults(
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "ar1", status: "pending", requestType: "Fence" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          requestType: "Fence",
          description: "6ft wood fence",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { archRequest: { status: string } };
    expect(body.archRequest.status).toBe("pending");
  });
  it("captures arch request creation analytics without request text or owner ids", async () => {
    setSession();
    setupWhereResults(
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [{ id: "unit-1", communityId: "c1" }],
      [{ id: "homeowner-1", communityId: "c1" }],
      [{ id: "ownership-1" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "ar1", status: "pending", requestType: "Fence" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          unitId: "unit-1",
          homeownerId: "homeowner-1",
          requestType: "Fence",
          description: "6ft wood fence by the pool",
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
        item_id: "ar1",
        item_type: "arch_request",
        status: "pending",
        has_unit: true,
        has_homeowner: true,
        role: "admin",
      },
      "u1",
      {},
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("6ft wood fence");
    expect(calls).not.toContain("unit-1");
    expect(calls).not.toContain("homeowner-1");
  });
  it("still returns 201 when arch request analytics capture fails", async () => {
    setSession();
    setupWhereResults(
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "ar1", status: "pending", requestType: "Fence" },
    ]);
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          requestType: "Fence",
          description: "6ft wood fence",
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
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          unitId: "unit-other",
          requestType: "Fence",
          description: "6ft wood fence",
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
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [{ id: "unit-1", communityId: "c1" }],
      [],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          unitId: "unit-1",
          homeownerId: "homeowner-other",
          requestType: "Fence",
          description: "6ft wood fence",
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
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [{ id: "unit-1", communityId: "c1" }],
      [{ id: "homeowner-1", communityId: "c1" }],
      [],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          unitId: "unit-1",
          homeownerId: "homeowner-1",
          requestType: "Fence",
          description: "6ft wood fence",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Homeowner does not own unit",
    });
  });
  it("checks supplied ownership against the current active date window", async () => {
    setSession();
    setupWhereResults(
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [{ id: "unit-1", communityId: "c1" }],
      [{ id: "homeowner-1", communityId: "c1" }],
      [],
    );
    const today = new Date().toISOString().slice(0, 10);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          unitId: "unit-1",
          homeownerId: "homeowner-1",
          requestType: "Fence",
          description: "6ft wood fence",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    const unitCondition = mockWhere.mock.calls.at(-3)?.[0];
    expect(collectSqlParamValues(unitCondition)).toEqual(
      expect.arrayContaining(["unit-1", "c1", true]),
    );
    const homeownerCondition = mockWhere.mock.calls.at(-2)?.[0];
    expect(collectSqlParamValues(homeownerCondition)).toEqual(
      expect.arrayContaining(["homeowner-1", "c1", true]),
    );
    const ownershipCondition = mockWhere.mock.calls.at(-1)?.[0];
    const values = collectSqlParamValues(ownershipCondition);
    expect(values).toEqual(
      expect.arrayContaining(["unit-1", "homeowner-1", today, today]),
    );
  });
  it("rejects request body with unknown fields (e.g. status override attempt)", async () => {
    setSession();
    // No membership needed — schema validation rejects before DB is reached
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          requestType: "Fence",
          description: "6ft wood fence",
          status: "approved", // attacker attempts to override server-set status
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /governance/arch-requests/:id/review", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/review", {
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("returns 404 when request not found", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/nonexist/review", {
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
  });
  it("returns 403 when not a write member", async () => {
    setSession();
    setupWhereResults(
      [{ id: "ar1", communityId: "c1", status: "pending" }],
      [{ role: "member", communityId: "c1", userId: "u1" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/review", {
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 409 when already reviewed", async () => {
    setSession();
    setupWhereResults(
      [{ id: "ar1", communityId: "c1", status: "approved" }],
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/review", {
        method: "PATCH",
        body: JSON.stringify({ status: "denied" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(409);
  });
  it("approves request and returns 200", async () => {
    setSession();
    setupWhereResults(
      [{ id: "ar1", communityId: "c1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "ar1", communityId: "c1", status: "approved" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/review", {
        method: "PATCH",
        body: JSON.stringify({ status: "approved", reviewNote: "Looks good" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { archRequest: { status: string } };
    expect(body.archRequest.status).toBe("approved");
  });
  it("returns 409 and emits no event when a concurrent review already reviewed the request (atomic re-check loses)", async () => {
    setSession();
    // Pre-check reads the request as still pending, so the guard passes...
    setupWhereResults(
      [{ id: "ar1", communityId: "c1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    // ...but the status-guarded UPDATE matches zero rows (winner already
    // moved it off "pending").
    mockUpdateReturning.mockResolvedValueOnce([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/review", {
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(409);
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "governance_item_reviewed",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
  it("captures arch request review analytics without review note", async () => {
    setSession();
    setupWhereResults(
      [{ id: "ar1", communityId: "c1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "ar1", communityId: "c1", status: "denied" },
    ]);

    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/review", {
        method: "PATCH",
        body: JSON.stringify({
          status: "denied",
          reviewNote: "Private legal review note",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(200);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_item_reviewed",
      {
        community_id: "c1",
        item_id: "ar1",
        item_type: "arch_request",
        previous_status: "pending",
        role: "admin",
        status: "denied",
      },
      "u1",
      {},
    );
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain(
      "Private legal review note",
    );
  });
});

describe("POST /governance/arch-requests/:id/attachments", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: new ArrayBuffer(8),
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("returns 404 when request not found", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request(
        "http://localhost/governance/arch-requests/nonexist/attachments",
        {
          method: "POST",
          body: new ArrayBuffer(8),
          headers: { "Content-Type": "image/jpeg" },
        },
      ),
    );
    expect(res.status).toBe(404);
  });
  it("returns 403 for non-member", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: new ArrayBuffer(8),
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 409 when adding an attachment to an already-reviewed request", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "approved",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    // Valid JPEG magic bytes so only the reviewed-state guard can reject this.
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: jpegMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(res.status).toBe(409);
    // A reviewed decision is final — no evidence is stored after the fact.
    expect(mockBucket.put).not.toHaveBeenCalled();
  });

  it("returns 403 for a read-only member (viewer role)", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "viewer", communityId: "c1", userId: "u1" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: new ArrayBuffer(8),
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 415 for unsupported content type", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: "<html>bad</html>",
        headers: { "Content-Type": "text/html" },
      }),
    );
    expect(res.status).toBe(415);
  });
  it("returns 415 when content-type header is missing", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: new ArrayBuffer(8),
      }),
    );
    expect(res.status).toBe(415);
  });
  it("returns 503 when GOVERNANCE_BUCKET is not configured", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    // Use JPEG magic bytes so sniffUploadType passes before the bucket check
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: jpegMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      {},
    );
    expect(res.status).toBe(503);
  });
  it("uploads attachment and returns 201", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: ["existing-key"],
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "ar1",
        communityId: "c1",
        status: "pending",
        attachmentKeys: ["existing-key", "c1/arch-requests/ar1/test-id.jpeg"],
      },
    ]);
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    // Use JPEG magic bytes so sniffUploadType validates the body
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: jpegMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string; archRequest: unknown };
    expect(typeof body.key).toBe("string");
    expect(mockBucket.put).toHaveBeenCalledOnce();
  });
  it("captures arch request attachment uploads without file key", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "ar1",
        communityId: "c1",
        status: "pending",
        attachmentKeys: ["c1/arch-requests/ar1/test-id.pdf"],
      },
    ]);
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: pdfMagic.buffer,
        headers: { "Content-Type": "application/pdf" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );

    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_attachment_uploaded",
      {
        attachment_type: "arch_request",
        community_id: "c1",
        file_type: "application/pdf",
        item_id: "ar1",
        role: "admin",
        size_bucket: "small",
      },
      "u1",
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain(
      "c1/arch-requests/ar1/test-id.pdf",
    );
  });
  it("uploads attachment when attachmentKeys is null (PDF magic bytes — coalesce branch)", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "ar1",
        communityId: "c1",
        status: "pending",
        attachmentKeys: ["c1/arch-requests/ar1/test-id.pdf"],
      },
    ]);
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    // Use PDF magic bytes (%PDF) so sniffUploadType correctly identifies PDF
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: pdfMagic.buffer,
        headers: { "Content-Type": "application/pdf" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(res.status).toBe(201);
  });
});

describe("POST /governance/arch-requests/:id/attachments — size and magic-byte guards", () => {
  it("returns 413 when Content-Length exceeds MAX_UPLOAD_BYTES (10 MB)", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: new ArrayBuffer(8),
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(11 * 1024 * 1024),
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
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    const tooLargePdf = new Uint8Array(11 * 1024 * 1024);
    tooLargePdf.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: tooLargePdf.buffer,
        headers: { "Content-Type": "application/pdf", "Content-Length": "0" },
      }),
      { GOVERNANCE_BUCKET: { put: vi.fn().mockResolvedValue(undefined) } },
    );

    expect(res.status).toBe(413);
  });

  it("captures medium-sized attachment uploads with a medium size bucket", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "ar1",
        communityId: "c1",
        status: "pending",
        attachmentKeys: ["c1/arch-requests/ar1/test-id.pdf"],
      },
    ]);
    const mediumPdf = new Uint8Array(2 * 1024 * 1024);
    mediumPdf.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: mediumPdf.buffer,
        headers: { "Content-Type": "application/pdf" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );

    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_attachment_uploaded",
      expect.objectContaining({ size_bucket: "medium" }),
      "u1",
      { GOVERNANCE_BUCKET: mockBucket },
    );
  });

  it("returns 415 when magic bytes don't match any allowed type (image or PDF)", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    // ELF header claiming to be a PDF
    const elfHeader = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x00]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: elfHeader.buffer,
        headers: { "Content-Type": "application/pdf" },
      }),
      { GOVERNANCE_BUCKET: { put: vi.fn().mockResolvedValue(undefined) } },
    );
    expect(res.status).toBe(415);
  });

  it("accepts a valid PDF (magic bytes 25 50 44 46)", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: null,
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "ar1",
        communityId: "c1",
        status: "pending",
        attachmentKeys: ["c1/arch-requests/ar1/test-id.pdf"],
      },
    ]);
    // PDF magic bytes: %PDF → 0x25 0x50 0x44 0x46
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: pdfMagic.buffer,
        headers: { "Content-Type": "application/pdf" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string };
    expect(body.key).toMatch(/\.pdf$/);
  });

  it("uses atomic array_append SQL for attachmentKeys (no read-modify-write race)", async () => {
    setSession();
    const mockSetReturning = vi.fn().mockResolvedValueOnce([
      {
        id: "ar1",
        communityId: "c1",
        status: "pending",
        attachmentKeys: ["existing-key", "c1/arch-requests/ar1/test-id.jpeg"],
      },
    ]);

    // Override the db mock for this test to capture set() calls
    const { createDb } = await import("../../../src/db/client.js");
    const capturedSetCalls: unknown[] = [];
    (createDb as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        const data = whereResults[whereCallIndex] ?? [];
        whereCallIndex++;
        return {
          then(onFulfilled: (v: unknown[]) => unknown) {
            return Promise.resolve(data).then(onFulfilled);
          },
          limit: vi.fn().mockResolvedValue(data),
          orderBy: vi.fn().mockResolvedValue(data),
          returning: mockSetReturning,
        };
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: mockSetReturning,
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockImplementation((arg: unknown) => {
        capturedSetCalls.push(arg);
        return {
          where: vi.fn().mockReturnThis(),
          returning: mockSetReturning,
        };
      }),
    }));

    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: ["existing-key"],
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    const pngMagic = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: pngMagic.buffer,
        headers: { "Content-Type": "image/png" },
      }),
      { GOVERNANCE_BUCKET: { put: vi.fn().mockResolvedValue(undefined) } },
    );

    // The set() argument should contain a SQL expression (not a plain array),
    // verifying atomic array_append instead of read-modify-write.
    const setArg = capturedSetCalls[0] as {
      attachmentKeys?: unknown;
    };
    expect(setArg).toBeDefined();
    const attachmentKeysValue = setArg?.attachmentKeys;
    // Should be a SQL expression object, not a plain JS array
    expect(Array.isArray(attachmentKeysValue)).toBe(false);
    expect(typeof attachmentKeysValue).toBe("object");
  });

  it("returns 201 and includes the existing key when appending to a request that already has attachments", async () => {
    // Atomicity of the append is proven by the sibling "uses atomic array_append
    // SQL" test, which inspects the emitted set() expression. This test only
    // covers the 201 happy path when attachmentKeys is already populated — the
    // returned array shape is supplied by the mocked UPDATE ... RETURNING below.
    setSession();
    setupWhereResults(
      [
        {
          id: "ar1",
          communityId: "c1",
          status: "pending",
          attachmentKeys: ["key1"],
        },
      ],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "ar1",
        communityId: "c1",
        status: "pending",
        attachmentKeys: ["key1", "c1/arch-requests/ar1/test-id.jpeg"],
      },
    ]);
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/attachments", {
        method: "POST",
        body: jpegMagic.buffer,
        headers: { "Content-Type": "image/jpeg" },
      }),
      { GOVERNANCE_BUCKET: mockBucket },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      archRequest: { attachmentKeys: string[] };
    };
    // Both keys present in result
    expect(body.archRequest.attachmentKeys).toContain("key1");
  });
});

describe("PATCH /governance/arch-requests/:id/review (no reviewNote)", () => {
  it("approves without reviewNote (null branch)", async () => {
    setSession();
    setupWhereResults(
      [{ id: "ar1", communityId: "c1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "ar1", communityId: "c1", status: "approved", reviewNote: null },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/arch-requests/ar1/review", {
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
  });
});
