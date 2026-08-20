import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../../src/types/env.js";

const mockEnv: Env = {
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:8060",
  APP_URL: "http://localhost:3060",
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
  STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual",
  STRIPE_PRICE_GROWTH_MONTHLY: "price_growth_monthly",
  STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_annual",
  STRIPE_PRICE_SCALE_MONTHLY: "price_scale_monthly",
  STRIPE_PRICE_SCALE_ANNUAL: "price_scale_annual",
  STRIPE_PRICE_PORTFOLIO_MONTHLY: "price_portfolio_monthly",
  STRIPE_PRICE_PORTFOLIO_ANNUAL: "price_portfolio_annual",
  RESEND_API_KEY: "resend_test",
  DATABASE_URL: "postgres://localhost/test",
  AUDIT_PACK_BUCKET: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(),
    list: vi.fn(),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket,
};

const mockGetSession = vi.fn();

vi.mock("../../../src/lib/auth.js", () => ({
  createAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
    handler: vi.fn(),
  })),
  getAuth: vi.fn(() => ({
    api: { getSession: mockGetSession },
    handler: vi.fn(),
  })),
}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../../../src/db/client.js", () => ({
  createDb: vi.fn(() => ({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    transaction: mockTransaction,
  })),
}));

vi.mock("../../../src/lib/nanoid.js", () => ({
  nanoid: vi.fn(() => "generated-id"),
}));

const mockBuildAuditPack = vi.fn();

vi.mock("../../../src/domain/reporting/auditPack.js", () => ({
  buildAuditPack: mockBuildAuditPack,
}));

const mockBuildChecklistItems = vi.fn();
const mockAllCompleted = vi.fn();

vi.mock("../../../src/domain/monthEndClose/checklist.js", () => ({
  buildChecklistItems: mockBuildChecklistItems,
  allCompleted: mockAllCompleted,
}));

const mockCaptureEvent = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/observability.js", () => ({
  captureEvent: mockCaptureEvent,
}));

const { default: closeRouter } =
  await import("../../../src/routes/monthEndClose/closes.js");

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", closeRouter);
  app.onError((err, c) => {
    const response = (err as { res?: Response }).res;
    return response ?? c.json({ error: err.message }, 500);
  });
  return app;
}

function makeRequest(path: string, options: RequestInit, env: Env = mockEnv) {
  const req = new Request(`http://localhost${path}`, options);
  return makeApp().fetch(req, env);
}

const sampleClose = {
  id: "close-1",
  communityId: "comm-1",
  periodYear: 2024,
  periodMonth: 1,
  status: "open",
  startedAt: new Date().toISOString(),
  completedAt: null,
  auditPackKey: null,
};

const sampleChecklistItems = [
  {
    id: "item-1",
    closeId: "close-1",
    communityId: "comm-1",
    step: "reconcile_bank",
    completed: true,
    completedAt: new Date().toISOString(),
    completedByUserId: "user-1",
  },
  {
    id: "item-2",
    closeId: "close-1",
    communityId: "comm-1",
    step: "review_tb",
    completed: true,
    completedAt: new Date().toISOString(),
    completedByUserId: "user-1",
  },
  {
    id: "item-3",
    closeId: "close-1",
    communityId: "comm-1",
    step: "post_adjustments",
    completed: true,
    completedAt: new Date().toISOString(),
    completedByUserId: "user-1",
  },
  {
    id: "item-4",
    closeId: "close-1",
    communityId: "comm-1",
    step: "finalize_minutes",
    completed: true,
    completedAt: new Date().toISOString(),
    completedByUserId: "user-1",
  },
  {
    id: "item-5",
    closeId: "close-1",
    communityId: "comm-1",
    step: "generate_pack",
    completed: true,
    completedAt: new Date().toISOString(),
    completedByUserId: "user-1",
  },
];

function mockMembershipQuery(role: string) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi
          .fn()
          .mockResolvedValue([
            { communityId: "comm-1", userId: "user-1", role },
          ]),
      })),
    })),
  });
}

function mockNoMembership() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  });
}

function mockActiveTier(tier: string) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([{ tier, status: "active" }]),
      })),
    })),
  });
}

describe("POST /close/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/close/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        periodYear: 2024,
        periodMonth: 1,
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();

    const res = await makeRequest("/close/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        periodYear: 2024,
        periodMonth: 1,
      }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 403 when user has viewer role", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("viewer");

    const res = await makeRequest("/close/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        periodYear: 2024,
        periodMonth: 1,
      }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 400 when body is invalid", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/close/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }), // missing periodYear + periodMonth
    });

    expect(res.status).toBe(400);
  });

  it("returns 200 with new close when none exists for that period", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("treasurer");
    mockActiveTier("portfolio");

    // Check existing close — none found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    // buildChecklistItems mock
    const fakeItems = [{ id: "item-1", step: "reconcile_bank" }];
    mockBuildChecklistItems.mockReturnValueOnce(fakeItems);

    // Transaction mock — calls the callback with a tx that has insert
    const txInsert = vi.fn();
    txInsert
      .mockReturnValueOnce({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([sampleClose]),
        })),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockResolvedValue(undefined),
      });
    mockTransaction.mockImplementationOnce(
      async (cb: (tx: { insert: typeof txInsert }) => Promise<unknown>) =>
        cb({ insert: txInsert }),
    );
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest("/close/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        periodYear: 2024,
        periodMonth: 1,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      closeId: string;
      steps: string[];
    };
    expect(body.closeId).toBe("close-1");
    expect(Array.isArray(body.steps)).toBe(true);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "close_started",
      {
        close_id: "close-1",
        community_id: "comm-1",
        period_month: 1,
        period_year: 2024,
        role: "treasurer",
      },
      "user-1",
      mockEnv,
    );
  });

  it("returns 200 idempotently when close already exists for that period", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    // Check existing close — found existing
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([sampleClose]),
        })),
      })),
    });

    // Fetch checklist items for existing close
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(sampleChecklistItems),
      })),
    });

    const res = await makeRequest("/close/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        periodYear: 2024,
        periodMonth: 1,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { closeId: string; steps: unknown[] };
    expect(body.closeId).toBe("close-1");
    // Does not call insert when idempotent
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("PATCH /close/:id/steps/:step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/close/close-1/steps/reconcile_bank", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        closeId: "close-1",
        step: "reconcile_bank",
        completed: true,
      }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();

    const res = await makeRequest("/close/close-1/steps/reconcile_bank", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        closeId: "close-1",
        step: "reconcile_bank",
        completed: true,
      }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 400 when step is invalid", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    // No membership mock needed — route validates step before checking membership

    const res = await makeRequest("/close/close-1/steps/invalid_step", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/close/close-1/steps/reconcile_bank", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when checklist item does not exist for the step", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("treasurer");
    mockActiveTier("portfolio");

    mockUpdate.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]), // no item found
        })),
      })),
    });

    const res = await makeRequest("/close/close-1/steps/reconcile_bank", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        closeId: "close-1",
        step: "reconcile_bank",
        completed: true,
      }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not found");
  });

  it("returns 200 when step is valid and marks it complete", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("treasurer");
    mockActiveTier("portfolio");

    const updatedItem = {
      id: "item-1",
      step: "reconcile_bank",
      completed: true,
      completedAt: new Date().toISOString(),
    };

    mockUpdate.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([updatedItem]),
        })),
      })),
    });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest("/close/close-1/steps/reconcile_bank", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        closeId: "close-1",
        step: "reconcile_bank",
        completed: true,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      step: string;
      completed: boolean;
      ok: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.step).toBe("reconcile_bank");
    expect(body.completed).toBe(true);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "close_step_updated",
      {
        close_id: "close-1",
        community_id: "comm-1",
        completed: true,
        role: "treasurer",
        step: "reconcile_bank",
      },
      "user-1",
      mockEnv,
    );
  });

  it("returns 400 when body closeId disagrees with the path", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/close/close-1/steps/reconcile_bank", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        closeId: "other-close",
        step: "reconcile_bank",
        completed: true,
      }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "closeId must match path",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("honors completed:false when reopening a checklist step", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("treasurer");
    mockActiveTier("portfolio");

    const set = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          {
            id: "item-1",
            step: "reconcile_bank",
            completed: false,
            completedAt: null,
          },
        ]),
      })),
    }));
    mockUpdate.mockReturnValueOnce({ set });

    const res = await makeRequest("/close/close-1/steps/reconcile_bank", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        communityId: "comm-1",
        closeId: "close-1",
        step: "reconcile_bank",
        completed: false,
      }),
    });

    expect(res.status).toBe(200);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: false,
        completedAt: null,
        completedByUserId: null,
      }),
    );
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      step: "reconcile_bank",
      completed: false,
    });
  });
});

describe("POST /close/:id/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/close/close-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/close/close-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();

    const res = await makeRequest("/close/close-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when close does not exist", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    // Close not found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const res = await makeRequest("/close/close-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 409 when the close is already complete (no re-run of audit pack / events)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    // Close already complete — completing again must short-circuit BEFORE
    // rebuilding the audit pack, uploading a fresh R2 object (which would
    // orphan the previous auditPackKey), overwriting completedAt, or
    // re-emitting close_completed.
    const alreadyComplete = {
      ...sampleClose,
      status: "complete",
      completedAt: new Date("2024-02-01T00:00:00.000Z"),
      auditPackKey: "comm-1/2024-01/audit-pack-original.zip",
    };
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([alreadyComplete]),
        })),
      })),
    });

    const res = await makeRequest("/close/close-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });

    expect(res.status).toBe(409);
    expect(
      (mockEnv.AUDIT_PACK_BUCKET as unknown as { put: ReturnType<typeof vi.fn> })
        .put,
    ).not.toHaveBeenCalled();
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "close_completed",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns 422 when not all checklist items are completed", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("treasurer");
    mockActiveTier("portfolio");

    // Close found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([sampleClose]),
        })),
      })),
    });

    // Checklist items — some incomplete
    const incompleteItems = sampleChecklistItems.map((i, idx) => ({
      ...i,
      completed: idx < 3,
    }));
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(incompleteItems),
      })),
    });

    mockAllCompleted.mockReturnValueOnce(false);

    const res = await makeRequest("/close/close-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: "comm-1" }),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not all steps");
  });

  it("returns 200 when all steps are complete and writes audit pack to R2", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    // Close found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([sampleClose]),
        })),
      })),
    });

    // Checklist items — all complete
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(sampleChecklistItems),
      })),
    });

    mockAllCompleted.mockReturnValueOnce(true);

    // Status re-read inside the advisory-locked transaction — still open.
    const txExecute = vi.fn().mockResolvedValue(undefined);
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ status: "open" }]),
        })),
      })),
    });
    mockTransaction.mockImplementationOnce(
      async (cb: (tx: unknown) => unknown) =>
        cb({
          execute: txExecute,
          select: mockSelect,
          update: mockUpdate,
          insert: mockInsert,
        }),
    );

    // buildAuditPack returns a ReadableStream
    const fakeBytes = new Uint8Array([1, 2, 3]);
    const fakeStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(fakeBytes);
        controller.close();
      },
    });
    mockBuildAuditPack.mockResolvedValueOnce(fakeStream);

    // R2 put mock
    const mockR2Put = vi.fn().mockResolvedValue(undefined);
    const envWithR2: Env = {
      ...mockEnv,
      AUDIT_PACK_BUCKET: {
        put: mockR2Put,
        get: vi.fn(),
        delete: vi.fn(),
        head: vi.fn(),
        list: vi.fn(),
        createMultipartUpload: vi.fn(),
        resumeMultipartUpload: vi.fn(),
      } as unknown as R2Bucket,
    };

    // Update close record mock
    mockUpdate.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              ...sampleClose,
              status: "complete",
              completedAt: new Date().toISOString(),
              auditPackKey: "comm-1/2024-01/audit-pack.zip",
            },
          ]),
        })),
      })),
    });
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest(
      "/close/close-1/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: "comm-1" }),
      },
      envWithR2,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      closeId: string;
      status: string;
      auditPackKey: string;
    };
    expect(body.closeId).toBe("close-1");
    expect(body.status).toBe("complete");
    expect(typeof body.auditPackKey).toBe("string");
    expect(mockR2Put).toHaveBeenCalledOnce();
    // The per-close advisory lock must be acquired inside the transaction
    // before any audit-pack build / upload happens.
    expect(txExecute).toHaveBeenCalledOnce();
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "close_completed",
      {
        audit_pack_bytes: 3,
        checklist_count: 5,
        close_id: "close-1",
        community_id: "comm-1",
        period_month: 1,
        period_year: 2024,
        role: "owner",
      },
      "user-1",
      envWithR2,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("audit-pack.zip");
  });

  it("returns 409 without building or uploading when a concurrent request already completed the close inside the lock", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    // Fast-path fetch sees the close still open (the racing winner has not yet
    // committed), so the pre-check passes...
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([sampleClose]),
        })),
      })),
    });
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(sampleChecklistItems),
      })),
    });
    mockAllCompleted.mockReturnValueOnce(true);

    // ...but the status re-read INSIDE the advisory lock observes that the
    // winner has since marked the close complete. The loser must bail out
    // before building or uploading anything.
    const txExecute = vi.fn().mockResolvedValue(undefined);
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ status: "complete" }]),
        })),
      })),
    });
    mockTransaction.mockImplementationOnce(
      async (cb: (tx: unknown) => unknown) =>
        cb({
          execute: txExecute,
          select: mockSelect,
          update: mockUpdate,
          insert: mockInsert,
        }),
    );

    const mockR2Put = vi.fn().mockResolvedValue(undefined);
    const envWithR2: Env = {
      ...mockEnv,
      AUDIT_PACK_BUCKET: {
        put: mockR2Put,
        get: vi.fn(),
        delete: vi.fn(),
        head: vi.fn(),
        list: vi.fn(),
        createMultipartUpload: vi.fn(),
        resumeMultipartUpload: vi.fn(),
      } as unknown as R2Bucket,
    };

    const res = await makeRequest(
      "/close/close-1/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: "comm-1" }),
      },
      envWithR2,
    );

    expect(res.status).toBe(409);
    expect(txExecute).toHaveBeenCalledOnce();
    expect(mockBuildAuditPack).not.toHaveBeenCalled();
    expect(mockR2Put).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCaptureEvent).not.toHaveBeenCalledWith(
      "close_completed",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns 500 when AUDIT_PACK_BUCKET binding is absent and does not write DB", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    // Close found
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([sampleClose]),
        })),
      })),
    });

    // Checklist items — all complete
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(sampleChecklistItems),
      })),
    });

    mockAllCompleted.mockReturnValueOnce(true);

    const fakeBytes = new Uint8Array([1, 2, 3]);
    const fakeStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(fakeBytes);
        controller.close();
      },
    });
    mockBuildAuditPack.mockResolvedValueOnce(fakeStream);

    // Env WITHOUT AUDIT_PACK_BUCKET binding
    const envWithoutR2: Env = { ...mockEnv, AUDIT_PACK_BUCKET: undefined };

    const res = await makeRequest(
      "/close/close-1/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: "comm-1" }),
      },
      envWithoutR2,
    );

    expect(res.status).toBe(500);
    // DB update must NOT have been called (no dead auditPackKey written)
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns user-friendly error message when AUDIT_PACK_BUCKET binding is absent", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([sampleClose]),
        })),
      })),
    });

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(sampleChecklistItems),
      })),
    });

    mockAllCompleted.mockReturnValueOnce(true);

    const fakeStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    mockBuildAuditPack.mockResolvedValueOnce(fakeStream);

    const envWithoutR2: Env = { ...mockEnv, AUDIT_PACK_BUCKET: undefined };

    const res = await makeRequest(
      "/close/close-1/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: "comm-1" }),
      },
      envWithoutR2,
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    // Must not leak internal binding name to the client
    expect(body.error).not.toContain("AUDIT_PACK_BUCKET");
    expect(body.error.toLowerCase()).toContain("audit pack");
  });
});

describe("GET /close/:id/pack-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest(
      "/close/close-1/pack-url?communityId=comm-1",
      { method: "GET" },
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 when communityId query param is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/close/close-1/pack-url", { method: "GET" });

    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();

    const res = await makeRequest(
      "/close/close-1/pack-url?communityId=comm-1",
      { method: "GET" },
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 when a viewer requests the audit pack URL", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("viewer");

    const res = await makeRequest(
      "/close/close-1/pack-url?communityId=comm-1",
      { method: "GET" },
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when close does not have an audit pack key", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    // Close found with no audit pack key
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([{ ...sampleClose, auditPackKey: null }]),
        })),
      })),
    });

    const res = await makeRequest(
      "/close/close-1/pack-url?communityId=comm-1",
      { method: "GET" },
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when close does not exist", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const res = await makeRequest(
      "/close/close-1/pack-url?communityId=comm-1",
      { method: "GET" },
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when R2 object is not found", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    // Close found with an audit pack key
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { ...sampleClose, auditPackKey: "comm-1/2024-01/audit-pack.zip" },
            ]),
        })),
      })),
    });

    const envWithR2: Env = {
      ...mockEnv,
      AUDIT_PACK_BUCKET: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue(null), // R2 object missing
        delete: vi.fn(),
        head: vi.fn(),
        list: vi.fn(),
        createMultipartUpload: vi.fn(),
        resumeMultipartUpload: vi.fn(),
      } as unknown as R2Bucket,
    };

    const res = await makeRequest(
      "/close/close-1/pack-url?communityId=comm-1",
      { method: "GET" },
      envWithR2,
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 and streams the zip from R2 when pack exists", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("owner");
    mockActiveTier("portfolio");

    // Close found with audit pack key
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { ...sampleClose, auditPackKey: "comm-1/2024-01/audit-pack.zip" },
            ]),
        })),
      })),
    });

    const fakeBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0x50, 0x4b])); // PK magic bytes
        controller.close();
      },
    });

    const envWithR2: Env = {
      ...mockEnv,
      AUDIT_PACK_BUCKET: {
        put: vi.fn(),
        get: vi.fn().mockResolvedValue({ body: fakeBody }),
        delete: vi.fn(),
        head: vi.fn(),
        list: vi.fn(),
        createMultipartUpload: vi.fn(),
        resumeMultipartUpload: vi.fn(),
      } as unknown as R2Bucket,
    };
    mockCaptureEvent.mockRejectedValueOnce(new Error("posthog down"));

    const res = await makeRequest(
      "/close/close-1/pack-url?communityId=comm-1",
      { method: "GET" },
      envWithR2,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      "audit_pack_downloaded",
      {
        close_id: "close-1",
        community_id: "comm-1",
        period_month: 1,
        period_year: 2024,
        role: "owner",
      },
      "user-1",
      envWithR2,
    );
    const calls = JSON.stringify(mockCaptureEvent.mock.calls);
    expect(calls).not.toContain("audit-pack.zip");
  });
});

describe("GET /close", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest("/close?communityId=comm-1", {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 when communityId is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/close", { method: "GET" });

    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();

    const res = await makeRequest("/close?communityId=comm-1", {
      method: "GET",
    });

    expect(res.status).toBe(403);
  });

  it("returns 200 with a list of closes for the community", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("viewer");
    mockActiveTier("portfolio");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn().mockResolvedValue([sampleClose]),
        })),
      })),
    });

    const res = await makeRequest("/close?communityId=comm-1", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { closes: unknown[] };
    expect(Array.isArray(body.closes)).toBe(true);
    expect(body.closes).toHaveLength(1);
  });

  it("returns 403 for close list reads below Scale", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("viewer");
    mockActiveTier("growth");

    const res = await makeRequest("/close?communityId=comm-1", {
      method: "GET",
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "upgrade_required",
      minimum: "scale",
    });
  });
});

describe("GET /close/:id/checklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await makeRequest(
      "/close/close-1/checklist?communityId=comm-1",
      { method: "GET" },
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 when communityId is missing", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await makeRequest("/close/close-1/checklist", {
      method: "GET",
    });

    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockNoMembership();

    const res = await makeRequest(
      "/close/close-1/checklist?communityId=comm-1",
      { method: "GET" },
    );

    expect(res.status).toBe(403);
  });

  it("returns 200 with checklist items for an authenticated member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockMembershipQuery("treasurer");
    mockActiveTier("portfolio");

    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(sampleChecklistItems.slice(0, 2))),
      })),
    });

    const res = await makeRequest(
      "/close/close-1/checklist?communityId=comm-1",
      { method: "GET" },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: string; step: string; completed: boolean }>;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      step: "reconcile_bank",
      completed: true,
    });
  });
});
