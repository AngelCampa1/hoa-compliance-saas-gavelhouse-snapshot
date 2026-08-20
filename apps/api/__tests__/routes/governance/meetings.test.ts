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
    onConflictDoNothing: vi.fn().mockReturnThis(),
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

import router from "../../../src/routes/governance/meetings.js";

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

describe("meetings endpoints", () => {
  it("GET /governance/meetings returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings?communityId=c1"),
    );
    expect(res.status).toBe(401);
  });
  it("GET /governance/meetings returns 400 without communityId", async () => {
    setSession();
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings"),
    );
    expect(res.status).toBe(400);
  });
  it("GET /governance/meetings returns 403 for non-member", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings?communityId=c1"),
    );
    expect(res.status).toBe(403);
  });
  it("GET /governance/meetings returns 200 for members", async () => {
    setSession();
    setupWhereResults(
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockOrderBy.mockResolvedValueOnce([{ id: "m1", communityId: "c1" }]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings?communityId=c1"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meetings: unknown[] };
    expect(Array.isArray(body.meetings)).toBe(true);
  });
  it("POST /governance/meetings returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Annual",
          meetingType: "annual",
          scheduledAt: "2026-06-01T18:00:00Z",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("POST /governance/meetings returns 403 for non-write member", async () => {
    setSession();
    setupWhereResults([{ role: "member", communityId: "c1", userId: "u1" }]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Annual",
          meetingType: "annual",
          scheduledAt: "2026-06-01T18:00:00Z",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("POST /governance/meetings creates meeting with auth+write role", async () => {
    setSession();
    setupWhereResults(
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "m1", communityId: "c1", title: "Annual" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Annual",
          meetingType: "annual",
          scheduledAt: "2026-06-01T18:00:00Z",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { meeting: { id: string } };
    expect(body.meeting.id).toBe("m1");
  });
  it("captures meeting creation analytics without title or minutes text", async () => {
    setSession();
    setupWhereResults(
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "m1",
        communityId: "c1",
        title: "Annual Budget Review",
        meetingType: "annual",
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Annual Budget Review",
          meetingType: "annual",
          scheduledAt: "2026-06-01T18:00:00Z",
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
        item_id: "m1",
        item_type: "meeting",
        meeting_type: "annual",
        scheduled_month: "2026-06",
        role: "secretary",
      },
      "u1",
      {},
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("Annual Budget Review");
    expect(calls).not.toContain("Minutes");
  });
  it("still returns 201 when meeting analytics capture fails", async () => {
    setSession();
    setupWhereResults(
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "m1", communityId: "c1", title: "Annual" },
    ]);
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await router.fetch(
      new Request("http://localhost/governance/meetings", {
        method: "POST",
        body: JSON.stringify({
          communityId: "c1",
          title: "Annual",
          meetingType: "annual",
          scheduledAt: "2026-06-01T18:00:00Z",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(201);
  });
  it("PATCH /governance/meetings/:id/minutes returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/minutes", {
        method: "PATCH",
        body: JSON.stringify({ minutesText: "Minutes text" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("PATCH /governance/meetings/:id/minutes returns 404 when not found", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/nonexist/minutes", {
        method: "PATCH",
        body: JSON.stringify({ minutesText: "Minutes text" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
  });
  it("PATCH /governance/meetings/:id/minutes returns 403 for non-write member", async () => {
    setSession();
    setupWhereResults(
      [{ id: "m1", communityId: "c1", minutesFinalizedAt: null }],
      [{ role: "member", communityId: "c1", userId: "u1" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/minutes", {
        method: "PATCH",
        body: JSON.stringify({ minutesText: "Minutes text" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("PATCH /governance/meetings/:id/minutes updates and finalizes minutes", async () => {
    setSession();
    setupWhereResults(
      [{ id: "m1", communityId: "c1", minutesFinalizedAt: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "m1",
        communityId: "c1",
        minutesText: "Minutes",
        minutesFinalizedAt: new Date(),
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/minutes", {
        method: "PATCH",
        body: JSON.stringify({ minutesText: "Minutes", finalize: true }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meeting: { minutesText: string } };
    expect(body.meeting.minutesText).toBe("Minutes");
  });
  it("captures minutes update and finalization analytics without minutes text", async () => {
    setSession();
    setupWhereResults(
      [{ id: "m1", communityId: "c1", minutesFinalizedAt: null }],
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "m1",
        communityId: "c1",
        minutesText: "Private minutes text",
        minutesFinalizedAt: new Date(),
      },
    ]);

    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/minutes", {
        method: "PATCH",
        body: JSON.stringify({
          minutesText: "Private minutes text",
          finalize: true,
        }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(200);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_minutes_updated",
      {
        community_id: "c1",
        finalized: true,
        meeting_id: "m1",
        role: "secretary",
      },
      "u1",
      {},
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_minutes_finalized",
      {
        community_id: "c1",
        meeting_id: "m1",
        role: "secretary",
      },
      "u1",
      {},
    );
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain(
      "Private minutes text",
    );
  });
  it("PATCH /governance/meetings/:id/minutes updates without finalize (false branch)", async () => {
    setSession();
    setupWhereResults(
      [{ id: "m1", communityId: "c1", minutesFinalizedAt: null }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "m1", communityId: "c1", minutesText: "Draft minutes" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/minutes", {
        method: "PATCH",
        body: JSON.stringify({ minutesText: "Draft minutes", finalize: false }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
  });
  it("PATCH /governance/meetings/:id/minutes returns 409 when minutes already finalized", async () => {
    setSession();
    setupWhereResults(
      [
        {
          id: "m1",
          communityId: "c1",
          minutesText: "Official finalized minutes",
          minutesFinalizedAt: new Date("2026-01-15T00:00:00.000Z"),
        },
      ],
      [{ role: "secretary", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/minutes", {
        method: "PATCH",
        body: JSON.stringify({
          minutesText: "Amended after the fact",
          finalize: false,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(409);
    // The official record must not be silently overwritten.
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Minutes already finalized");
  });
});

describe("motions endpoints", () => {
  it("GET /governance/meetings/:id/motions returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/motions"),
    );
    expect(res.status).toBe(401);
  });
  it("GET /governance/meetings/:id/motions returns 404 when meeting not found", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/nonexist/motions"),
    );
    expect(res.status).toBe(404);
  });
  it("GET /governance/meetings/:id/motions returns 403 for non-member", async () => {
    setSession();
    setupWhereResults([{ id: "m1", communityId: "c1" }], []);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/motions"),
    );
    expect(res.status).toBe(403);
  });
  it("GET /governance/meetings/:id/motions returns 200 with motions", async () => {
    setSession();
    setupWhereResults(
      [{ id: "m1", communityId: "c1" }],
      [{ role: "admin" }],
      [{ tier: "portfolio", status: "active" }],
      [{ id: "mo1", text: "Approve budget" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/motions"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { motions: unknown[] };
    expect(Array.isArray(body.motions)).toBe(true);
  });
  it("POST /governance/meetings/:id/motions returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/motions", {
        method: "POST",
        body: JSON.stringify({ text: "Approve budget" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("POST /governance/meetings/:id/motions returns 404 when meeting not found", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/nonexist/motions", {
        method: "POST",
        body: JSON.stringify({ text: "Approve budget" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
  });
  it("POST /governance/meetings/:id/motions returns 403 for non-write member", async () => {
    setSession();
    setupWhereResults(
      [{ id: "m1", communityId: "c1" }],
      [{ role: "member", communityId: "c1", userId: "u1" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/motions", {
        method: "POST",
        body: JSON.stringify({ text: "Approve budget" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("POST /governance/meetings/:id/motions creates motion", async () => {
    setSession();
    setupWhereResults(
      [{ id: "m1", communityId: "c1" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "mo1",
        communityId: "c1",
        text: "Approve budget",
        status: "pending",
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/motions", {
        method: "POST",
        body: JSON.stringify({
          text: "Approve budget",
          movedByUserId: "u1",
          secondedByUserId: "u2",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { motion: { status: string } };
    expect(body.motion.status).toBe("pending");
  });
  it("captures motion creation analytics without motion text or member ids", async () => {
    setSession();
    setupWhereResults(
      [{ id: "m1", communityId: "c1" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "mo1",
        communityId: "c1",
        meetingId: "m1",
        text: "Approve private settlement terms",
        status: "pending",
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/motions", {
        method: "POST",
        body: JSON.stringify({
          text: "Approve private settlement terms",
          movedByUserId: "u1",
          secondedByUserId: "u2",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_motion_created",
      {
        community_id: "c1",
        meeting_id: "m1",
        motion_id: "mo1",
        role: "admin",
      },
      "u1",
      {},
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("Approve private settlement terms");
    expect(calls).not.toContain("u2");
  });
  it("still creates motion when motion analytics capture fails", async () => {
    setSession();
    setupWhereResults(
      [{ id: "m1", communityId: "c1" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "mo1", communityId: "c1", meetingId: "m1", status: "pending" },
    ]);
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/motions", {
        method: "POST",
        body: JSON.stringify({ text: "Approve budget" }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(201);
  });
  it("POST /governance/meetings/:id/motions creates motion without movedBy/secondedBy (null branches)", async () => {
    setSession();
    setupWhereResults(
      [{ id: "m1", communityId: "c1" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "mo1",
        communityId: "c1",
        text: "Approve budget",
        status: "pending",
        movedByUserId: null,
        secondedByUserId: null,
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/meetings/m1/motions", {
        method: "POST",
        body: JSON.stringify({ text: "Approve budget" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
  });
  it("PATCH /governance/motions/:id/resolve returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/resolve", {
        method: "PATCH",
        body: JSON.stringify({ status: "passed" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("PATCH /governance/motions/:id/resolve returns 404 when not found", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/nonexist/resolve", {
        method: "PATCH",
        body: JSON.stringify({ status: "passed" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
  });
  it("PATCH /governance/motions/:id/resolve returns 403 for non-write member", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "pending" }],
      [{ role: "member" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/resolve", {
        method: "PATCH",
        body: JSON.stringify({ status: "passed" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("resolving already-resolved motion returns 409", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "passed" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/resolve", {
        method: "PATCH",
        body: JSON.stringify({ status: "failed" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(409);
  });
  it("resolves pending motion successfully", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "mo1", communityId: "c1", status: "passed" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/resolve", {
        method: "PATCH",
        body: JSON.stringify({ status: "passed" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { motion: { status: string } };
    expect(body.motion.status).toBe("passed");
  });
  it("returns 409 and emits no event when a concurrent resolve already resolved the motion (atomic re-check loses)", async () => {
    setSession();
    // Pre-check reads the motion as still pending (the racing winner has not
    // yet committed), so the status guard above passes...
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", meetingId: "m1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    // ...but the status-guarded UPDATE matches zero rows because the winner
    // already flipped status away from "pending".
    mockUpdateReturning.mockResolvedValueOnce([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/resolve", {
        method: "PATCH",
        body: JSON.stringify({ status: "passed" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(409);
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "governance_motion_resolved",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
  it("captures motion resolution analytics without motion text", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", meetingId: "m1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      {
        id: "mo1",
        communityId: "c1",
        meetingId: "m1",
        text: "Private motion text",
        status: "failed",
      },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/resolve", {
        method: "PATCH",
        body: JSON.stringify({ status: "failed" }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(200);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_motion_resolved",
      {
        community_id: "c1",
        meeting_id: "m1",
        motion_id: "mo1",
        role: "admin",
        status: "failed",
      },
      "u1",
      {},
    );
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain(
      "Private motion text",
    );
  });
});

describe("votes endpoints", () => {
  it("POST /governance/motions/:id/votes returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "yes" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
  it("POST /governance/motions/:id/votes returns 404 when motion not found", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/nonexist/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "yes" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
  });
  it("POST /governance/motions/:id/votes returns 403 for non-member", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "pending" }],
      [],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "yes" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("POST /governance/motions/:id/votes returns 403 for read-only member", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "pending" }],
      [{ role: "viewer", communityId: "c1", userId: "u1" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "yes" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
  it("voting twice on same motion returns 409", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [{ id: "vote1", choice: "yes" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "no" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(409);
  });
  it("voting on resolved motion returns 409", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "passed" }],
      [{ role: "admin" }],
      [{ tier: "portfolio", status: "active" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "yes" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(409);
  });
  it("casts vote and returns 201", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "v1", motionId: "mo1", choice: "yes" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "yes", notes: "Agree" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { vote: { choice: string } };
    expect(body.vote.choice).toBe("yes");
  });
  it("captures vote analytics without vote notes", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", meetingId: "m1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "v1", motionId: "mo1", choice: "no", notes: "Private note" },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "no", notes: "Private note" }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(201);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "governance_vote_cast",
      {
        choice: "no",
        community_id: "c1",
        meeting_id: "m1",
        motion_id: "mo1",
        role: "admin",
        vote_id: "v1",
      },
      "u1",
      {},
    );
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain(
      "Private note",
    );
  });
  it("still casts vote when vote analytics capture fails", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", meetingId: "m1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "v1", motionId: "mo1", choice: "abstain" },
    ]);
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "abstain" }),
        headers: { "Content-Type": "application/json" },
      }),
      {},
    );

    expect(res.status).toBe(201);
  });
  it("casts vote without notes (null branch)", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [],
    );
    mockUpdateReturning.mockResolvedValueOnce([
      { id: "v1", motionId: "mo1", choice: "abstain", notes: null },
    ]);
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "abstain" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
  });
  it("concurrent double-vote race loser returns 409, not 500", async () => {
    // The pre-check passes (no existing vote at SELECT time), but the
    // unique index votes_motion_voter_unique catches the race; the
    // onConflictDoNothing insert returns no row, which must surface as 409.
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "pending" }],
      [{ role: "admin", communityId: "c1", userId: "u1" }],
      [{ tier: "portfolio", status: "active" }],
      [],
    );
    mockUpdateReturning.mockResolvedValueOnce([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes", {
        method: "POST",
        body: JSON.stringify({ choice: "yes" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(409);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });
  it("GET /governance/motions/:id/votes returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes"),
    );
    expect(res.status).toBe(401);
  });
  it("GET /governance/motions/:id/votes returns 404 when motion not found", async () => {
    setSession();
    setupWhereResults([]);
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/nonexist/votes"),
    );
    expect(res.status).toBe(404);
  });
  it("GET /governance/motions/:id/votes returns 403 for non-member", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "pending" }],
      [],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes"),
    );
    expect(res.status).toBe(403);
  });
  it("GET /governance/motions/:id/votes returns tally", async () => {
    setSession();
    setupWhereResults(
      [{ id: "mo1", communityId: "c1", status: "passed" }],
      [{ role: "viewer" }],
      [{ tier: "portfolio", status: "active" }],
      [{ choice: "yes" }, { choice: "yes" }, { choice: "no" }],
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/motions/mo1/votes"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tally: Record<string, number> };
    expect(body.tally.yes).toBe(2);
    expect(body.tally.no).toBe(1);
  });
});
