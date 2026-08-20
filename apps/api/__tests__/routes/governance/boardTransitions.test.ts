import { describe, it, expect, vi, beforeEach } from "vitest";

// Factory for a where result that supports both select and update chains
function makeWhereResult(data: unknown[]) {
  const returningFn = vi.fn().mockResolvedValue(data);
  return {
    returning: returningFn,
    then(
      onFulfilled: (v: unknown[]) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) {
      return Promise.resolve(data).then(onFulfilled, onRejected);
    },
    catch(onRejected: (e: unknown) => unknown) {
      return Promise.resolve(data).catch(onRejected);
    },
    finally(onFinally: () => void) {
      return Promise.resolve(data).finally(onFinally);
    },
  };
}

const whereQueue: unknown[][] = [];
let whereCallIdx = 0;

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockImplementation(() => {
    const data = whereQueue[whereCallIdx] ?? [];
    whereCallIdx++;
    return makeWhereResult(data);
  }),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

vi.mock("../../../src/db/client.js", () => ({ createDb: vi.fn(() => mockDb) }));
vi.mock("../../../src/lib/auth.js", () => ({
  getAuth: vi.fn(() => ({
    api: { getSession: vi.fn().mockResolvedValue(null) },
  })),
}));
vi.mock("../../../src/domain/policy/access.js", () => ({
  assertFeatureTier: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: vi.fn().mockResolvedValue(undefined),
}));

import router from "../../../src/routes/governance/boardTransitions.js";
import { getAuth } from "../../../src/lib/auth.js";
import { assertFeatureTier } from "../../../src/domain/policy/access.js";
import { captureEvent } from "../../../src/lib/observability.js";
import { HTTPException } from "hono/http-exception";

const mockGetAuth = vi.mocked(getAuth) as unknown as ReturnType<typeof vi.fn>;
const mockAssertFeatureTier = vi.mocked(
  assertFeatureTier,
) as unknown as ReturnType<typeof vi.fn>;
const mockCaptureEvent = vi.mocked(captureEvent) as unknown as ReturnType<
  typeof vi.fn
>;

function mockSession(userId: string | null) {
  mockGetAuth.mockReturnValueOnce({
    api: {
      getSession: vi
        .fn()
        .mockResolvedValue(userId ? { user: { id: userId } } : null),
    },
  } as unknown as ReturnType<typeof getAuth>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  whereQueue.length = 0;
  whereCallIdx = 0;
  mockDb.where.mockImplementation(() => {
    const data = whereQueue[whereCallIdx] ?? [];
    whereCallIdx++;
    return makeWhereResult(data);
  });
  mockAssertFeatureTier.mockResolvedValue(undefined);
  // Default: no auth
  mockGetAuth.mockReturnValue({
    api: { getSession: vi.fn().mockResolvedValue(null) },
  } as unknown as ReturnType<typeof getAuth>);
});

describe("GET /governance/transitions", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions?communityId=c1"),
    );
    expect(res.status).toBe(401);
  });
  it("returns 400 without communityId", async () => {
    mockSession("u1");
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions"),
    );
    expect(res.status).toBe(400);
  });
  it("returns 403 if not a community member", async () => {
    mockSession("u1");
    // whereQueue is empty → empty array for membership check
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions?communityId=c1"),
    );
    expect(res.status).toBe(403);
  });
  it("returns 200 with list of transitions", async () => {
    mockSession("u1");
    whereQueue.push([{ role: "owner", communityId: "c1" }]);
    whereQueue.push([{ id: "t1", role: "treasurer", status: "pending" }]);
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions?communityId=c1"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transitions: unknown[] };
    expect(body.transitions).toBeDefined();
    expect(mockAssertFeatureTier).toHaveBeenCalledWith(
      mockDb,
      "c1",
      "governance-workflows",
    );
  });
  it("returns 200 when analytics capture fails after acknowledgement", async () => {
    mockSession("u1");
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));
    whereQueue.push([
      {
        id: "t1",
        role: "treasurer",
        toUserId: "u1",
        fromUserId: "u99",
        communityId: "c1",
        status: "pending",
      },
    ]);
    whereQueue.push([{ role: "member", communityId: "c1", userId: "u1" }]);
    whereQueue.push([{ id: "t1", status: "acknowledged" }]);
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/acknowledge", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(200);
  });
  it("returns 403 when governance workflows are not available on the tier", async () => {
    mockSession("u1");
    whereQueue.push([{ role: "owner", communityId: "c1" }]);
    mockAssertFeatureTier.mockRejectedValueOnce(
      new HTTPException(403, {
        res: Response.json(
          { error: "upgrade_required", minimum: "growth" },
          { status: 403 },
        ),
      }),
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions?communityId=c1"),
    );
    expect(res.status).toBe(403);
  });
});

describe("PATCH /governance/transitions/:id/acknowledge", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/acknowledge", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(401);
  });
  it("returns 404 when transition not found", async () => {
    mockSession("u1");
    // whereQueue is empty → empty array for transition lookup
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/acknowledge", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(404);
  });
  it("returns 403 when user is not a community member", async () => {
    mockSession("u2");
    whereQueue.push([
      {
        id: "t1",
        role: "treasurer",
        toUserId: "u1",
        fromUserId: "u99",
        communityId: "c1",
        status: "pending",
      },
    ]); // transition found
    // whereQueue is empty for membership → no membership
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/acknowledge", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 403 if community member but not the incoming board member", async () => {
    mockSession("u2");
    whereQueue.push([
      {
        id: "t1",
        role: "treasurer",
        toUserId: "u1",
        fromUserId: "u99",
        communityId: "c1",
        status: "pending",
      },
    ]); // transition found
    whereQueue.push([{ role: "member", communityId: "c1", userId: "u2" }]); // membership exists
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/acknowledge", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 200 when incoming member acknowledges", async () => {
    mockSession("u1");
    whereQueue.push([
      {
        id: "t1",
        role: "treasurer",
        toUserId: "u1",
        fromUserId: "u99",
        communityId: "c1",
        status: "pending",
      },
    ]); // transition found
    whereQueue.push([{ role: "member", communityId: "c1", userId: "u1" }]); // membership exists
    whereQueue.push([{ id: "t1", status: "acknowledged" }]); // returning result
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/acknowledge", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockAssertFeatureTier).toHaveBeenCalledWith(
      mockDb,
      "c1",
      "governance-workflows",
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "board_transition_acknowledged",
      {
        community_id: "c1",
        transition_id: "t1",
        transition_role: "treasurer",
        previous_status: "pending",
        new_status: "acknowledged",
        actor_role: "member",
        actor_position: "incoming",
      },
      "u1",
      undefined,
    );
  });
  it("returns 403 when acknowledging is gated by tier", async () => {
    mockSession("u1");
    whereQueue.push([
      {
        id: "t1",
        toUserId: "u1",
        fromUserId: "u99",
        communityId: "c1",
        status: "pending",
      },
    ]);
    whereQueue.push([{ role: "member", communityId: "c1", userId: "u1" }]);
    mockAssertFeatureTier.mockRejectedValueOnce(
      new HTTPException(403, {
        res: Response.json(
          { error: "upgrade_required", minimum: "growth" },
          { status: 403 },
        ),
      }),
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/acknowledge", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 409 and does not regress a completed transition back to acknowledged", async () => {
    mockSession("u1");
    whereQueue.push([
      {
        id: "t1",
        role: "treasurer",
        toUserId: "u1",
        fromUserId: "u99",
        communityId: "c1",
        status: "complete",
      },
    ]); // transition already complete (terminal)
    whereQueue.push([{ role: "member", communityId: "c1", userId: "u1" }]); // membership
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/acknowledge", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(409);
    // A completed governance handoff must not be reopened or re-emit its event.
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "board_transition_acknowledged",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

describe("PATCH /governance/transitions/:id/complete", () => {
  it("returns 401 without auth", async () => {
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/complete", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(401);
  });
  it("returns 404 when not found", async () => {
    mockSession("u1");
    // whereQueue is empty → no transition
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/nonexist/complete", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(404);
  });
  it("returns 403 when user is not a community member", async () => {
    mockSession("u99");
    whereQueue.push([
      {
        id: "t1",
        role: "treasurer",
        fromUserId: "u1",
        toUserId: "u2",
        communityId: "c1",
        status: "pending",
      },
    ]); // transition found
    // whereQueue is empty for membership → no membership
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/complete", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 403 when community member but not from or to user", async () => {
    mockSession("u99");
    whereQueue.push([
      {
        id: "t1",
        role: "treasurer",
        fromUserId: "u1",
        toUserId: "u2",
        communityId: "c1",
        status: "pending",
      },
    ]); // transition found
    whereQueue.push([{ role: "member", communityId: "c1", userId: "u99" }]); // membership exists
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/complete", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(403);
  });
  it("returns 200 when fromUser completes", async () => {
    mockSession("u1");
    whereQueue.push([
      {
        id: "t1",
        role: "treasurer",
        fromUserId: "u1",
        toUserId: "u2",
        communityId: "c1",
        status: "acknowledged",
      },
    ]); // transition found
    whereQueue.push([{ role: "owner", communityId: "c1", userId: "u1" }]); // membership exists
    whereQueue.push([{ id: "t1", status: "complete" }]); // returning result
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/complete", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockAssertFeatureTier).toHaveBeenCalledWith(
      mockDb,
      "c1",
      "governance-workflows",
    );
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "board_transition_completed",
      {
        community_id: "c1",
        transition_id: "t1",
        transition_role: "treasurer",
        previous_status: "acknowledged",
        new_status: "complete",
        actor_role: "owner",
        actor_position: "outgoing",
      },
      "u1",
      undefined,
    );
  });
  it("returns 409 and emits no completion event when a concurrent request already completed the transition (atomic re-check loses)", async () => {
    mockSession("u1");
    // Both racers read the transition as still 'acknowledged' (pre-check passes)...
    whereQueue.push([
      {
        id: "t1",
        role: "treasurer",
        fromUserId: "u1",
        toUserId: "u2",
        communityId: "c1",
        status: "acknowledged",
      },
    ]);
    whereQueue.push([{ role: "owner", communityId: "c1", userId: "u1" }]);
    // ...but the status-guarded UPDATE matches zero rows because the winner
    // already flipped status to 'complete'. The loser must not emit a second
    // board_transition_completed event.
    whereQueue.push([]); // returning result: no row updated
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/complete", {
        method: "PATCH",
      }),
    );
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(409);
    expect(body.error).toBe(
      "Transition must be acknowledged before completion",
    );
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });
  it("returns 409 when completion would skip incoming member acknowledgement", async () => {
    mockSession("u1");
    whereQueue.push([
      {
        id: "t1",
        fromUserId: "u1",
        toUserId: "u2",
        communityId: "c1",
        status: "pending",
      },
    ]);
    whereQueue.push([{ role: "owner", communityId: "c1", userId: "u1" }]);
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/complete", {
        method: "PATCH",
      }),
    );
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(409);
    expect(body.error).toBe(
      "Transition must be acknowledged before completion",
    );
    expect(mockDb.update).not.toHaveBeenCalled();
  });
  it("returns 403 when completion is gated by tier", async () => {
    mockSession("u1");
    whereQueue.push([
      {
        id: "t1",
        fromUserId: "u1",
        toUserId: "u2",
        communityId: "c1",
        status: "acknowledged",
      },
    ]);
    whereQueue.push([{ role: "owner", communityId: "c1", userId: "u1" }]);
    mockAssertFeatureTier.mockRejectedValueOnce(
      new HTTPException(403, {
        res: Response.json(
          { error: "upgrade_required", minimum: "growth" },
          { status: 403 },
        ),
      }),
    );
    const res = await router.fetch(
      new Request("http://localhost/governance/transitions/t1/complete", {
        method: "PATCH",
      }),
    );
    expect(res.status).toBe(403);
  });
});
