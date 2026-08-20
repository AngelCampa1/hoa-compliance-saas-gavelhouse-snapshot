import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError, api, ownerPortalApi, getApiBase } from "@/lib/api";

vi.mock("@/lib/sentry", () => ({
  captureUnexpectedError: vi.fn(),
  shouldCaptureError: vi.fn(() => false),
}));

import { captureUnexpectedError } from "@/lib/sentry";

type MockFetch = ReturnType<typeof vi.fn>;

function makeMockFetch(ok: boolean, body: unknown): MockFetch {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: vi.fn().mockResolvedValue(body),
  });
}

describe("api", () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = makeMockFetch(true, {});
    vi.stubGlobal("fetch", mockFetch);
    vi.mocked(captureUnexpectedError).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("api.auth.providers", () => {
    it("calls /api/auth/providers", async () => {
      mockFetch = makeMockFetch(true, { google: true });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.auth.providers();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/providers"),
        expect.any(Object),
      );
      expect(result).toEqual({ google: true });
    });
  });

  describe("apiFetch internals", () => {
    it("sends credentials: include", async () => {
      mockFetch = makeMockFetch(true, { communities: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.communities.list();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/communities/me"),
        expect.objectContaining({ credentials: "include" }),
      );
    });

    it("sends Content-Type: application/json header", async () => {
      mockFetch = makeMockFetch(true, { communities: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.communities.list();
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(
        (callArgs[1].headers as Record<string, string>)["Content-Type"],
      ).toBe("application/json");
    });

    it("throws with error message from body on non-ok response", async () => {
      mockFetch = makeMockFetch(false, { error: "Unauthorized" });
      vi.stubGlobal("fetch", mockFetch);
      await expect(api.communities.list()).rejects.toMatchObject({
        message: "Unauthorized",
        status: 400,
      });
    });

    it("throws with HTTP status message when body has no error field", async () => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({}),
      });
      vi.stubGlobal("fetch", mockFetch);
      await expect(api.communities.list()).rejects.toMatchObject({
        message: "HTTP 500",
        status: 500,
        path: "/communities/me",
      });
    });

    it('throws "Unknown error" when body is not parseable JSON', async () => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: vi.fn().mockRejectedValue(new Error("not json")),
      });
      vi.stubGlobal("fetch", mockFetch);
      await expect(api.communities.list()).rejects.toBeInstanceOf(ApiError);
      await expect(api.communities.list()).rejects.toThrow("Unknown error");
    });

    it("Sentry-captures non-JSON error bodies with response text as breadcrumb", async () => {
      const rawText = "<html>Bad Gateway</html>";
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: vi.fn().mockResolvedValue(rawText),
        json: vi.fn().mockRejectedValue(new Error("not json")),
      });
      vi.stubGlobal("fetch", mockFetch);
      await expect(api.communities.list()).rejects.toBeInstanceOf(ApiError);
      expect(captureUnexpectedError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.objectContaining({ source: "parse-error-body" }),
          extra: expect.objectContaining({ responseText: rawText }),
        }),
      );
    });

    it("does not Sentry-capture when response body is valid JSON", async () => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: "bad request" }),
      });
      vi.stubGlobal("fetch", mockFetch);
      vi.mocked(captureUnexpectedError).mockClear();
      await expect(api.communities.list()).rejects.toThrow("bad request");
      expect(captureUnexpectedError).not.toHaveBeenCalled();
    });

    it("includes server tracking IDs in 5xx user-facing messages", async () => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({
          error: "Something went wrong. Please try again.",
          trackingId: "event-api-123",
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(api.communities.list()).rejects.toMatchObject({
        message:
          "Something went wrong. Please try again. Tracking ID: event-api-123",
        status: 500,
        trackingId: "event-api-123",
      });
    });
  });

  describe("api.communities.list", () => {
    it("calls /communities/me", async () => {
      const data = {
        communities: [
          {
            community: {
              id: "1",
              name: "Test",
              slug: "test",
              state: "CA",
              ownerUserId: "u1",
              createdAt: "",
              updatedAt: "",
            },
            role: "owner",
          },
        ],
      };
      mockFetch = makeMockFetch(true, data);
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.communities.list();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/communities/me"),
        expect.any(Object),
      );
      expect(result).toEqual(data);
    });
  });

  describe("api.communities.create", () => {
    it("calls /communities with POST and body", async () => {
      mockFetch = makeMockFetch(true, { communityId: "new-id" });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.communities.create({
        name: "Test HOA",
        slug: "test-hoa",
        state: "TX",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/communities"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Test HOA",
            slug: "test-hoa",
            state: "TX",
          }),
        }),
      );
      expect(result).toEqual({ communityId: "new-id" });
    });
  });

  describe("api.communities.setup", () => {
    it("calls /communities/setup with PATCH and body", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.communities.setup({
        communityId: "community-1",
        name: "Sunset HOA",
        state: "TX",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/communities/setup"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            communityId: "community-1",
            name: "Sunset HOA",
            state: "TX",
          }),
        }),
      );
      expect(result).toEqual({ ok: true });
    });

    it("includes communityId when updating a specific community", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      await api.communities.setup({
        communityId: "community-2",
        state: "CA",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/communities/setup"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ communityId: "community-2", state: "CA" }),
        }),
      );
    });

    it("calls /communities/setup with only state when name is omitted", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      await api.communities.setup({ state: "CA" });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/communities/setup"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ state: "CA" }),
        }),
      );
    });
  });

  describe("api.communities.invite", () => {
    it("calls /communities/:id/invitations with POST and correct body", async () => {
      mockFetch = makeMockFetch(true, { token: "abc123" });
      vi.stubGlobal("fetch", mockFetch);
      await api.communities.invite("comm-1", "user@example.com", "treasurer");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/communities/comm-1/invitations"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            email: "user@example.com",
            role: "treasurer",
          }),
        }),
      );
    });
  });

  describe("api.communities.acceptInvitation", () => {
    it("calls /invitations/:token/accept with POST", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      await api.communities.acceptInvitation("tok-abc");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/invitations/tok-abc/accept"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("apiFetch branch fallbacks", () => {
    it("falls back to application/octet-stream when photo file.type is empty", async () => {
      mockFetch = makeMockFetch(true, { key: "k", violation: {} });
      vi.stubGlobal("fetch", mockFetch);
      const file = new File([new Uint8Array([1, 2, 3])], "p.bin", { type: "" });
      await api.governance.violations.uploadPhoto("v-1", file);
      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/octet-stream");
    });
  });

  describe("api.communities.usage", () => {
    it("calls /communities/:id/usage with encoded ID", async () => {
      mockFetch = makeMockFetch(true, {
        communityId: "c 1",
        homeownerCount: 3,
        tier: { id: "starter", name: "Starter", maxHomes: 50 },
        nextTier: null,
      });
      vi.stubGlobal("fetch", mockFetch);
      const res = await api.communities.usage("c 1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/communities/c%201/usage"),
        expect.any(Object),
      );
      expect(res.homeownerCount).toBe(3);
    });
  });

  describe("ownerPortalApi.payDues", () => {
    it("posts to /owner/dues/pay with the token and body", async () => {
      mockFetch = makeMockFetch(true, {
        checkoutUrl: "https://stripe.example/cs_test",
        paymentIntentId: "pi_123",
      });
      vi.stubGlobal("fetch", mockFetch);
      const res = await ownerPortalApi.payDues("token-xyz", {
        assessmentId: "a-1",
        amountCents: 12500,
        method: "card",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/owner/dues/pay"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            assessmentId: "a-1",
            amountCents: 12500,
            method: "card",
          }),
        }),
      );
      expect(res.paymentIntentId).toBe("pi_123");
    });
  });

  describe("api.activation.get", () => {
    it("calls /activation?communityId=... with encoded ID", async () => {
      const activationData = {
        activation: {
          communityId: "test id",
          rosterImported: false,
          reservePopulated: false,
          complianceAcknowledged: false,
          dueBatchConfigured: false,
        },
      };
      mockFetch = makeMockFetch(true, activationData);
      vi.stubGlobal("fetch", mockFetch);
      await api.activation.get("test id");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/activation?communityId=test%20id"),
        expect.any(Object),
      );
    });
  });

  describe("api.activation.patch", () => {
    it("calls /activation/:step with PATCH and body", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      await api.activation.patch("roster_imported", "comm-1", true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/activation/roster_imported"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ communityId: "comm-1", completed: true }),
        }),
      );
    });
  });

  describe("api.billing.checkout", () => {
    it("calls /billing/checkout with POST and body", async () => {
      mockFetch = makeMockFetch(true, {
        url: "https://checkout.stripe.com/abc",
      });
      vi.stubGlobal("fetch", mockFetch);
      const data = {
        communityId: "c-1",
        tier: "starter",
        cycle: "monthly",
        successUrl: "https://app.gavelhouse.app/dashboard",
        cancelUrl: "https://app.gavelhouse.app/billing",
      };
      const result = await api.billing.checkout(data);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/billing/checkout"),
        expect.objectContaining({ method: "POST", body: JSON.stringify(data) }),
      );
      expect(result).toEqual({ url: "https://checkout.stripe.com/abc" });
    });
  });

  describe("api.finance.accounts.list", () => {
    it("calls /finance/accounts?communityId=... with encoded ID", async () => {
      const accountsData = { accounts: [] };
      mockFetch = makeMockFetch(true, accountsData);
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.accounts.list("community id");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/finance/accounts?communityId=community%20id"),
        expect.any(Object),
      );
      expect(result).toEqual(accountsData);
    });
  });

  describe("api.finance.accounts.create", () => {
    it("calls /finance/accounts with POST and body", async () => {
      mockFetch = makeMockFetch(true, { accountId: "new-acc-id" });
      vi.stubGlobal("fetch", mockFetch);
      const data = {
        communityId: "comm-1",
        code: "9999",
        name: "Test Account",
        accountType: "asset",
        fundType: "operating",
      };
      const result = await api.finance.accounts.create(data);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/finance/accounts"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(data),
        }),
      );
      expect(result).toEqual({ accountId: "new-acc-id" });
    });
  });

  describe("api.finance.accounts.update", () => {
    it("calls /finance/accounts/:id with PATCH and body", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.accounts.update("acc-1", {
        communityId: "comm-1",
        name: "Updated Account",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/finance/accounts/acc-1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            communityId: "comm-1",
            name: "Updated Account",
          }),
        }),
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe("api.finance.journal.list", () => {
    it("calls /finance/journal?communityId=... without optional params", async () => {
      const data = { entries: [], limit: 50, offset: 0 };
      mockFetch = makeMockFetch(true, data);
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.journal.list("comm-1");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/finance/journal?communityId=comm-1");
      expect(result).toEqual(data);
    });

    it("includes limit and offset params when provided", async () => {
      const data = { entries: [], limit: 10, offset: 20 };
      mockFetch = makeMockFetch(true, data);
      vi.stubGlobal("fetch", mockFetch);
      await api.finance.journal.list("comm-1", { limit: 10, offset: 20 });
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=20");
    });
  });

  describe("api.finance.journal.get", () => {
    it("calls /finance/journal/:entryId?communityId=...", async () => {
      const data = { entry: { id: "e1" }, lines: [] };
      mockFetch = makeMockFetch(true, data);
      vi.stubGlobal("fetch", mockFetch);
      await api.finance.journal.get("e1", "comm-1");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/finance/journal/e1");
      expect(url).toContain("communityId=comm-1");
    });
  });

  describe("api.finance.journal.create", () => {
    it("calls /finance/journal with POST and body", async () => {
      const responseData = { entryId: "entry-1", lineCount: 2 };
      mockFetch = makeMockFetch(true, responseData);
      vi.stubGlobal("fetch", mockFetch);
      const body = {
        communityId: "comm-1",
        entryDate: "2024-01-15",
        memo: "Test entry",
        lines: [
          { accountId: "acc-1", debitCents: 1000, creditCents: 0 },
          { accountId: "acc-2", debitCents: 0, creditCents: 1000 },
        ],
      };
      const result = await api.finance.journal.create(body);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/finance/journal"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
      expect(result).toEqual(responseData);
    });
  });

  describe("api.finance.reserves.getSummary", () => {
    it("calls /finance/reserves/summary?communityId=... with encoded ID", async () => {
      const summaryData = {
        studyId: null,
        effectiveDate: null,
        components: [],
        totalReserveBalance: 0,
        totalProjectedNeed: 0,
        percentFunded: null,
        annualBudgetCents: null,
        annualReserveContributionCents: null,
        allocationPercent: null,
        fannieMaeCompliant: null,
        fannieMaeComplianceBasis: "annual_budget_allocation_unavailable",
        stateRequirements: null,
      };
      mockFetch = makeMockFetch(true, summaryData);
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.reserves.getSummary("comm id");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/finance/reserves/summary?communityId=comm%20id");
      expect(result).toEqual(summaryData);
    });
  });

  describe("api.finance.reserves.upsertStudy", () => {
    it("calls /finance/reserves/study with PUT and body", async () => {
      const responseData = {
        studyId: "study-1",
        effectiveDate: "2025-01-01",
        components: [],
        totalReserveBalance: 0,
        totalProjectedNeed: 0,
        percentFunded: null,
        annualBudgetCents: null,
        annualReserveContributionCents: null,
        allocationPercent: null,
        fannieMaeCompliant: null,
        fannieMaeComplianceBasis: "annual_budget_allocation_unavailable",
        stateRequirements: null,
      };
      mockFetch = makeMockFetch(true, responseData);
      vi.stubGlobal("fetch", mockFetch);
      const body = {
        communityId: "comm-1",
        effectiveDate: "2025-01-01",
        methodology: "Full Funding",
        components: [
          {
            name: "Roof",
            usefulLifeYears: 20,
            remainingLifeYears: 10,
            replacementCostCents: 5000000,
            currentReserveCents: 2500000,
          },
        ],
      };
      const result = await api.finance.reserves.upsertStudy(body);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/finance/reserves/study"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(body),
        }),
      );
      expect(result).toEqual(responseData);
    });
  });

  describe("api.finance.reserves.updateAllocation", () => {
    it("calls /finance/reserves/allocation with PATCH and body", async () => {
      const responseData = {
        studyId: "study-1",
        effectiveDate: "2025-01-01",
        components: [],
        totalReserveBalance: 0,
        totalProjectedNeed: 0,
        percentFunded: null,
        annualBudgetCents: 12000000,
        annualReserveContributionCents: 1800000,
        allocationPercent: 15,
        fannieMaeCompliant: true,
        fannieMaeComplianceBasis: "annual_budget_allocation",
        stateRequirements: null,
      };
      mockFetch = makeMockFetch(true, responseData);
      vi.stubGlobal("fetch", mockFetch);
      const body = {
        communityId: "comm-1",
        annualBudgetCents: 12000000,
        annualReserveContributionCents: 1800000,
      };
      const result = await api.finance.reserves.updateAllocation(body);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/finance/reserves/allocation"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      );
      expect(result).toEqual(responseData);
    });
  });

  describe("api.finance.reserves.importStudy", () => {
    it("calls /finance/reserve-study/import with POST and file body (CSV)", async () => {
      mockFetch = makeMockFetch(true, { inserted: 2 });
      vi.stubGlobal("fetch", mockFetch);
      const file = new File(["name,useful life\nRoof,20"], "study.csv", {
        type: "text/csv",
      });
      await api.finance.reserves.importStudy("comm-1", file, "text/csv");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "/finance/reserve-study/import?communityId=comm-1",
        ),
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("calls /finance/reserve-study/import with application/json content type", async () => {
      mockFetch = makeMockFetch(true, { inserted: 1 });
      vi.stubGlobal("fetch", mockFetch);
      const file = new File(['[{"name":"Roof"}]'], "study.json", {
        type: "application/json",
      });
      await api.finance.reserves.importStudy(
        "comm-1",
        file,
        "application/json",
      );
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(
        (callArgs[1].headers as Record<string, string>)["Content-Type"],
      ).toBe("application/json");
    });
  });

  describe("api.finance.dues.listUnits", () => {
    it("calls /finance/units?communityId=... with encoded ID", async () => {
      const data = { units: [] };
      mockFetch = makeMockFetch(true, data);
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.dues.listUnits("comm-1");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/finance/units?communityId=comm-1");
      expect(result).toEqual(data);
    });
  });

  describe("api.finance.dues.createUnit", () => {
    it("calls /finance/units with POST and body", async () => {
      mockFetch = makeMockFetch(true, { unitId: "unit-1" });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.dues.createUnit({
        communityId: "comm-1",
        address: "123 Main St",
        unitNumber: "1A",
        sqft: 800,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/finance/units"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual({ unitId: "unit-1" });
    });
  });

  describe("api.finance.dues.listHomeowners", () => {
    it("calls /finance/homeowners?communityId=... with encoded ID", async () => {
      const data = { homeowners: [] };
      mockFetch = makeMockFetch(true, data);
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.dues.listHomeowners("comm-1");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/finance/homeowners?communityId=comm-1");
      expect(result).toEqual(data);
    });
  });

  describe("api.finance.dues.createHomeowner", () => {
    it("calls /finance/homeowners with POST and body", async () => {
      mockFetch = makeMockFetch(true, { homeownerId: "ho-1" });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.dues.createHomeowner({
        communityId: "comm-1",
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/finance/homeowners"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual({ homeownerId: "ho-1" });
    });
  });

  describe("api.finance.dues.listAssessments", () => {
    it("calls /finance/assessments?communityId=... without period", async () => {
      const data = {
        assessments: [],
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockFetch = makeMockFetch(true, data);
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.dues.listAssessments("comm-1");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/finance/assessments?communityId=comm-1");
      expect(result).toEqual(data);
    });

    it("includes period param when provided", async () => {
      const data = {
        assessments: [],
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockFetch = makeMockFetch(true, data);
      vi.stubGlobal("fetch", mockFetch);
      await api.finance.dues.listAssessments("comm-1", "2026-01");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("period=2026-01");
    });

    it("includes pagination params when provided", async () => {
      const data = {
        assessments: [],
        total: 73,
        limit: 50,
        offset: 50,
        hasMore: false,
      };
      mockFetch = makeMockFetch(true, data);
      vi.stubGlobal("fetch", mockFetch);
      await api.finance.dues.listAssessments("comm-1", undefined, {
        limit: 50,
        offset: 50,
      });
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("limit=50");
      expect(url).toContain("offset=50");
    });
  });

  describe("api.finance.dues.createAssessment", () => {
    it("calls /finance/assessments with POST and body", async () => {
      mockFetch = makeMockFetch(true, { assessmentId: "assess-1" });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.dues.createAssessment({
        communityId: "comm-1",
        unitId: "unit-1",
        period: "2026-01",
        amountCents: 15000,
        fundType: "operating",
        dueDate: "2026-01-15",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/finance/assessments"),
        expect.objectContaining({ method: "POST" }),
      );
      const requestInit = mockFetch.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(String(requestInit.body))).toEqual(
        expect.objectContaining({ unitId: "unit-1" }),
      );
      expect(result).toEqual({ assessmentId: "assess-1" });
    });
  });

  describe("api.finance.dues.pay", () => {
    it("calls /finance/dues/pay with POST and body for check method", async () => {
      mockFetch = makeMockFetch(true, { paymentId: "pay-1" });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.dues.pay({
        communityId: "comm-1",
        assessmentId: "assess-1",
        homeownerId: "ho-1",
        amountCents: 15000,
        method: "check",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/finance/dues/pay"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual({ paymentId: "pay-1" });
    });

    it("calls /finance/dues/pay with card method and optional URLs", async () => {
      mockFetch = makeMockFetch(true, {
        clientSecret: "pi_secret",
        paymentIntentId: "pi_123",
      });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.finance.dues.pay({
        communityId: "comm-1",
        assessmentId: "assess-1",
        homeownerId: "ho-1",
        amountCents: 15000,
        method: "card",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });
      expect(result).toEqual({
        clientSecret: "pi_secret",
        paymentIntentId: "pi_123",
      });
    });
  });

  describe("path construction", () => {
    it("prepends the base URL to the path", async () => {
      mockFetch = makeMockFetch(true, { communities: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.communities.list();
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toMatch(/^https?:\/\//);
      expect(url).toContain("/communities/me");
    });

    it("uses VITE_API_URL when defined", async () => {
      vi.stubEnv("VITE_API_URL", "http://custom-api.test");
      mockFetch = makeMockFetch(true, { communities: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.communities.list();
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("http://custom-api.test");
      vi.unstubAllEnvs();
    });
  });

  describe("api.reports.trialBalance", () => {
    it("calls /reports/trial-balance with communityId and asOf", async () => {
      mockFetch = makeMockFetch(true, { rows: [] });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.reports.trialBalance("comm-1", "2026-01-31");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/reports/trial-balance");
      expect(url).toContain("communityId=comm-1");
      expect(url).toContain("asOf=2026-01-31");
      expect(result).toEqual({ rows: [] });
    });
  });

  describe("api.reports.balanceSheet", () => {
    it("calls /reports/balance-sheet with communityId and asOf", async () => {
      mockFetch = makeMockFetch(true, { rows: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.reports.balanceSheet("comm-1", "2026-01-31");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/reports/balance-sheet");
      expect(url).toContain("communityId=comm-1");
      expect(url).toContain("asOf=2026-01-31");
    });
  });

  describe("api.reports.incomeStatement", () => {
    it("calls /reports/income-statement with communityId, from, to", async () => {
      mockFetch = makeMockFetch(true, { rows: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.reports.incomeStatement("comm-1", "2026-01-01", "2026-01-31");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/reports/income-statement");
      expect(url).toContain("from=2026-01-01");
      expect(url).toContain("to=2026-01-31");
    });
  });

  describe("api.reports.generalLedger", () => {
    it("calls /reports/general-ledger without optional params", async () => {
      mockFetch = makeMockFetch(true, { rows: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.reports.generalLedger("comm-1", "2026-01-01", "2026-01-31");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/reports/general-ledger");
      expect(url).toContain("communityId=comm-1");
      expect(url).not.toContain("accountId");
      expect(url).not.toContain("fundType");
    });

    it("includes accountId and fundType when provided", async () => {
      mockFetch = makeMockFetch(true, { rows: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.reports.generalLedger(
        "comm-1",
        "2026-01-01",
        "2026-01-31",
        "acc-1",
        "operating",
      );
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("accountId=acc-1");
      expect(url).toContain("fundType=operating");
    });
  });

  describe("api.reports.downloadAuditPack", () => {
    it("fetches blob and triggers download with correct filename", async () => {
      const blobMock = new Blob(["zip content"], { type: "application/zip" });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(blobMock),
      });
      vi.stubGlobal("fetch", fetchMock);
      const objectUrl = "blob:http://localhost/123";
      vi.stubGlobal("URL", {
        createObjectURL: vi.fn().mockReturnValue(objectUrl),
        revokeObjectURL: vi.fn(),
      });
      const anchorMock = document.createElement("a");
      const clickSpy = vi
        .spyOn(anchorMock, "click")
        .mockImplementation(() => {});
      vi.spyOn(document, "createElement").mockReturnValueOnce(
        anchorMock as unknown as HTMLAnchorElement,
      );

      await api.reports.downloadAuditPack("comm-1", "2026-01-01", "2026-01-31");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/reports/audit-pack"),
        expect.objectContaining({ credentials: "include" }),
      );
      expect(anchorMock.download).toBe("audit-pack-2026-01-31.zip");
      expect(clickSpy).toHaveBeenCalled();
    });

    it("throws on non-ok response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        api.reports.downloadAuditPack("comm-1", "2026-01-01", "2026-01-31"),
      ).rejects.toThrow("HTTP 403");
    });
  });

  describe("api.reports.downloadRoleHandoff", () => {
    it("fetches blob and triggers download with correct filename", async () => {
      const blobMock = new Blob(["pdf content"], { type: "application/pdf" });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(blobMock),
      });
      vi.stubGlobal("fetch", fetchMock);
      const objectUrl = "blob:http://localhost/456";
      vi.stubGlobal("URL", {
        createObjectURL: vi.fn().mockReturnValue(objectUrl),
        revokeObjectURL: vi.fn(),
      });
      const anchorMock = document.createElement("a");
      const clickSpy = vi
        .spyOn(anchorMock, "click")
        .mockImplementation(() => {});
      vi.spyOn(document, "createElement").mockReturnValueOnce(
        anchorMock as unknown as HTMLAnchorElement,
      );

      await api.reports.downloadRoleHandoff("comm-1", "trans-abc");

      expect(anchorMock.download).toBe("role-handoff-trans-abc.pdf");
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe("api.bank.listStatements", () => {
    it("calls /bank/statements?communityId=...", async () => {
      mockFetch = makeMockFetch(true, { statements: [] });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.bank.listStatements("comm-1");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/bank/statements?communityId=comm-1");
      expect(result).toEqual({ statements: [] });
    });
  });

  describe("api.bank.importStatement", () => {
    it("calls /bank/statements with POST and body", async () => {
      mockFetch = makeMockFetch(true, { statementId: "stmt-1" });
      vi.stubGlobal("fetch", mockFetch);
      const data = {
        communityId: "comm-1",
        accountId: "acc-1",
        beginningBalanceCents: 100000,
        endingBalanceCents: 120000,
        statementDate: "2026-01-31",
        csv: "date,desc,amount\n2026-01-15,Dues,20000",
      };
      const result = await api.bank.importStatement(data);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/bank/statements"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(data),
        }),
      );
      expect(result).toEqual({ statementId: "stmt-1" });
    });
  });

  describe("api.bank.getReconciliation", () => {
    it("calls /bank/reconciliations/:id?communityId=...", async () => {
      const data = {
        reconciliation: { id: "rec-1", status: "open", statementId: "stmt-1" },
        lines: [],
      };
      mockFetch = makeMockFetch(true, data);
      vi.stubGlobal("fetch", mockFetch);
      await api.bank.getReconciliation("rec-1", "comm-1");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/bank/reconciliations/rec-1");
      expect(url).toContain("communityId=comm-1");
    });
  });

  describe("api.bank.addMatch", () => {
    it("calls /bank/reconciliations/:id/matches with POST", async () => {
      mockFetch = makeMockFetch(true, {
        match: { id: "match-1", statementLineId: "line-1" },
      });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.bank.addMatch("rec-1", {
        communityId: "comm-1",
        statementLineId: "line-1",
        paymentId: "pay-1",
        journalLineId: null,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/bank/reconciliations/rec-1/matches"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual({
        match: { id: "match-1", statementLineId: "line-1" },
      });
    });
  });

  describe("api.bank.deleteMatch", () => {
    it("calls /bank/reconciliations/:id/matches/:matchId with DELETE", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.bank.deleteMatch("rec-1", "match-1", "comm-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "/bank/reconciliations/rec-1/matches/match-1?communityId=comm-1",
        ),
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe("api.bank.finalizeReconciliation", () => {
    it("calls /bank/reconciliations/:id/finalize with POST", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      await api.bank.finalizeReconciliation("rec-1", "comm-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/bank/reconciliations/rec-1/finalize"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("api.portfolio.list", () => {
    it("calls /portfolio", async () => {
      mockFetch = makeMockFetch(true, { portfolios: [] });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.portfolio.list();
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/portfolio");
      expect(result).toEqual({ portfolios: [] });
    });
  });

  describe("api.portfolio.create", () => {
    it("calls /portfolio with POST and name", async () => {
      mockFetch = makeMockFetch(true, { portfolioId: "port-1" });
      vi.stubGlobal("fetch", mockFetch);
      await api.portfolio.create("My Portfolio");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/portfolio"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "My Portfolio" }),
        }),
      );
    });
  });

  describe("api.portfolio.linkCommunity", () => {
    it("calls /portfolio/:id/communities with POST", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      await api.portfolio.linkCommunity("port-1", "comm-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/portfolio/port-1/communities"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            portfolioId: "port-1",
            communityId: "comm-1",
          }),
        }),
      );
    });
  });

  describe("api.portfolio.unlinkCommunity", () => {
    it("calls /portfolio/:id/communities/:commId with DELETE", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      await api.portfolio.unlinkCommunity("port-1", "comm-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/portfolio/port-1/communities/comm-1"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("api.portfolio.rename", () => {
    it("calls /portfolio/:id with PATCH and name body", async () => {
      mockFetch = makeMockFetch(true, {
        portfolio: { id: "port-1", name: "New Name" },
      });
      vi.stubGlobal("fetch", mockFetch);
      await api.portfolio.rename("port-1", "New Name");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/portfolio/port-1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "New Name" }),
        }),
      );
    });
  });

  describe("api.portfolio.delete", () => {
    it("calls /portfolio/:id with DELETE", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      await api.portfolio.delete("port-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/portfolio/port-1"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("api.portfolio.getRollup", () => {
    it("calls /portfolio/:id/rollup", async () => {
      mockFetch = makeMockFetch(true, { rollup: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.portfolio.getRollup("port-1");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/portfolio/port-1/rollup");
    });
  });

  describe("api.close.list", () => {
    it("calls /close?communityId=...", async () => {
      mockFetch = makeMockFetch(true, { closes: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.close.list("comm-1");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/close?communityId=comm-1");
    });
  });

  describe("api.close.start", () => {
    it("calls /close/start with POST and body", async () => {
      mockFetch = makeMockFetch(true, { closeId: "close-1" });
      vi.stubGlobal("fetch", mockFetch);
      await api.close.start("comm-1", 2026, 1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/close/start"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            communityId: "comm-1",
            periodYear: 2026,
            periodMonth: 1,
          }),
        }),
      );
    });
  });

  describe("api.close.advanceStep", () => {
    it("calls /close/:id/steps/:step with PATCH", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      await api.close.advanceStep("close-1", "comm-1", "bank_rec", true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/close/close-1/steps/bank_rec"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  describe("api.close.complete", () => {
    it("calls /close/:id/complete with POST", async () => {
      mockFetch = makeMockFetch(true, {
        closeId: "close-1",
        status: "complete",
        auditPackKey: "comm-1/2026-01/audit-pack.zip",
      });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.close.complete("close-1", "comm-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/close/close-1/complete"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual({
        closeId: "close-1",
        status: "complete",
        auditPackKey: "comm-1/2026-01/audit-pack.zip",
      });
    });
  });

  describe("api.close.auditPackUrl", () => {
    it("builds an encoded close pack URL without fetching", () => {
      const url = api.close.auditPackUrl("close/1", "comm 1");
      expect(url).toContain("/close/close%2F1/pack-url");
      expect(url).toContain("communityId=comm%201");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("api.close.getChecklist", () => {
    it("calls /close/:id/checklist?communityId=...", async () => {
      mockFetch = makeMockFetch(true, { items: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.close.getChecklist("close-1", "comm-1");
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain("/close/close-1/checklist");
      expect(url).toContain("communityId=comm-1");
    });
  });

  describe("api.billing.cancel", () => {
    it("calls /billing/cancel with POST, reason and note", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.billing.cancel(
        "comm-1",
        "too_expensive",
        "Just too pricey",
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/billing/cancel"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            communityId: "comm-1",
            reason: "too_expensive",
            note: "Just too pricey",
          }),
        }),
      );
      expect(result).toEqual({ ok: true });
    });

    it("calls /billing/cancel without note when omitted", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      await api.billing.cancel("comm-1", "other");
      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string) as {
        communityId: string;
        reason: string;
        note?: string;
      };
      expect(body.note).toBeUndefined();
    });
  });

  describe("api.billing.portal", () => {
    it("calls /billing/portal with POST, communityId, and returnUrl", async () => {
      mockFetch = makeMockFetch(true, {
        url: "https://billing.stripe.com/session_123",
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.billing.portal(
        "comm-1",
        "https://my.gavelhouse.app/billing",
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/billing/portal"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            communityId: "comm-1",
            returnUrl: "https://my.gavelhouse.app/billing",
          }),
        }),
      );
      expect(result).toEqual({
        url: "https://billing.stripe.com/session_123",
      });
    });
  });

  describe("api.billing.startTrial", () => {
    it("calls /billing/start-trial with POST and community data", async () => {
      const payload = {
        communityId: "comm-1",
      };
      mockFetch = makeMockFetch(true, { status: "trialing" });
      vi.stubGlobal("fetch", mockFetch);
      await api.billing.startTrial(payload);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/billing/start-trial"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
    });
  });

  describe("api.billing.getStatus", () => {
    it("calls /billing/status?communityId=... with encoded ID", async () => {
      const status = {
        status: "active",
        tier: "starter",
        trialStartedAt: "2025-12-01T00:00:00Z",
        trialEndsAt: "2026-01-01T00:00:00Z",
        currentPeriodEnd: "2026-02-01T00:00:00Z",
        cancelAtPeriodEnd: false,
      };
      mockFetch = makeMockFetch(true, status);
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.billing.getStatus("comm-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/billing/status?communityId=comm-1"),
        expect.any(Object),
      );
      expect(result).toEqual(status);
    });
  });

  describe("api.governance.homeowners", () => {
    it("list calls /governance/homeowners?communityId=...", async () => {
      mockFetch = makeMockFetch(true, { homeowners: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.homeowners.list("comm-1");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain("/governance/homeowners?communityId=comm-1");
    });

    it("list appends search param when provided", async () => {
      mockFetch = makeMockFetch(true, { homeowners: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.homeowners.list("comm-1", "smith");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain("search=smith");
    });

    it("import calls /governance/homeowners/import with POST and csv body", async () => {
      mockFetch = makeMockFetch(true, { created: 3, skipped: [] });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.governance.homeowners.import(
        "comm-1",
        "csv data",
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/homeowners/import"),
        expect.objectContaining({ method: "POST", body: "csv data" }),
      );
      expect(result).toEqual({ created: 3, skipped: [] });
    });

    it("import returns skipped rows from non-ok import responses", async () => {
      const response = {
        created: 0,
        skipped: [
          {
            row: 2,
            email: "jane@test.com",
            reason: "already-exists",
          },
        ],
      };
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue(response),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.governance.homeowners.import(
        "comm-1",
        "csv data",
      );

      expect(result).toEqual(response);
    });

    it("import throws normal API errors when non-ok response is not an import result", async () => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "upgrade_required" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        api.governance.homeowners.import("comm-1", "csv data"),
      ).rejects.toMatchObject({
        message: "upgrade_required",
        status: 403,
      });
    });

    it("import returns skipped rows from non-ok 422 body", async () => {
      const response = {
        created: 0,
        skipped: [
          {
            row: 1,
            email: "",
            reason: "invalid",
          },
        ],
      };
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: vi.fn().mockResolvedValue(response),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.governance.homeowners.import(
        "comm-1",
        "csv data",
      );

      expect(result).toEqual(response);
    });

    it("import falls back to an empty result when ok body omits fields", async () => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.governance.homeowners.import(
        "comm-1",
        "csv data",
      );

      expect(result).toEqual({ created: 0, skipped: [] });
    });

    it("add calls /governance/homeowners with POST and homeowner body", async () => {
      const payload = {
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        unitNumber: "101",
      };
      mockFetch = makeMockFetch(true, {
        homeowner: { id: "hw-1", ...payload, phone: null, moveInDate: null },
      });
      vi.stubGlobal("fetch", mockFetch);

      await api.governance.homeowners.add("comm-1", payload);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/communities/comm-1/homeowners"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
    });
  });

  describe("api.governance.meetings", () => {
    it("list calls /governance/meetings?communityId=...", async () => {
      mockFetch = makeMockFetch(true, { meetings: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.meetings.list("comm-1");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain("/governance/meetings?communityId=comm-1");
    });

    it("create calls /governance/meetings with POST", async () => {
      mockFetch = makeMockFetch(true, { meeting: {} });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.meetings.create({
        communityId: "comm-1",
        title: "Annual Meeting",
        meetingType: "annual",
        scheduledAt: "2026-06-01T10:00:00Z",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/meetings"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("recordMinutes calls PATCH /governance/meetings/:id/minutes with body", async () => {
      mockFetch = makeMockFetch(true, { meeting: {} });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.meetings.recordMinutes(
        "mtg-1",
        "Motion to adjourn.",
        true,
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/meetings/mtg-1/minutes"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            minutesText: "Motion to adjourn.",
            finalize: true,
          }),
        }),
      );
    });

    it("listMotions calls /governance/meetings/:id/motions", async () => {
      mockFetch = makeMockFetch(true, { motions: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.meetings.listMotions("mtg-1");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain("/governance/meetings/mtg-1/motions");
    });

    it("createMotion calls /governance/meetings/:id/motions with POST", async () => {
      mockFetch = makeMockFetch(true, { motion: {} });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.meetings.createMotion(
        "mtg-1",
        "Approve roof contract",
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/meetings/mtg-1/motions"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ text: "Approve roof contract" }),
        }),
      );
    });

    it("resolveMotion calls /governance/motions/:id/resolve with PATCH", async () => {
      mockFetch = makeMockFetch(true, { motion: {} });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.meetings.resolveMotion("motion-1", "passed");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/motions/motion-1/resolve"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "passed" }),
        }),
      );
    });

    it("listVotes calls /governance/motions/:id/votes", async () => {
      mockFetch = makeMockFetch(true, { votes: [], tally: {} });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.meetings.listVotes("motion-1");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain("/governance/motions/motion-1/votes");
    });

    it("castVote calls /governance/motions/:id/votes with POST", async () => {
      mockFetch = makeMockFetch(true, { vote: {} });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.meetings.castVote(
        "motion-1",
        "abstain",
        "Need more bids",
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/motions/motion-1/votes"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            choice: "abstain",
            notes: "Need more bids",
          }),
        }),
      );
    });
  });

  describe("api.governance.violations", () => {
    it("list calls /governance/violations?communityId=...", async () => {
      mockFetch = makeMockFetch(true, { violations: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.violations.list("comm-1");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain("/governance/violations?communityId=comm-1");
    });

    it("create calls /governance/violations with POST", async () => {
      mockFetch = makeMockFetch(true, { violation: {} });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.violations.create({
        communityId: "comm-1",
        title: "Noise violation",
        description: "Loud music",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/violations"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("updateStatus calls /governance/violations/:id/status with PATCH and body", async () => {
      mockFetch = makeMockFetch(true, { violation: {} });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.violations.updateStatus("v-1", "cured");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/violations/v-1/status"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "cured" }),
        }),
      );
    });

    it("listEvents calls /governance/violations/:id/events", async () => {
      mockFetch = makeMockFetch(true, { events: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.violations.listEvents("v-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/violations/v-1/events"),
        expect.anything(),
      );
    });

    it("uploadPhoto posts a photo file to /governance/violations/:id/photos", async () => {
      mockFetch = makeMockFetch(true, { key: "photo.jpg", violation: {} });
      vi.stubGlobal("fetch", mockFetch);
      const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });

      await api.governance.violations.uploadPhoto("v-1", file);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/violations/v-1/photos"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: file,
        }),
      );
    });
  });

  describe("api.governance.archRequests", () => {
    it("list calls /governance/arch-requests?communityId=...", async () => {
      mockFetch = makeMockFetch(true, { archRequests: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.archRequests.list("comm-1");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain("/governance/arch-requests?communityId=comm-1");
    });

    it("create calls /governance/arch-requests with POST", async () => {
      mockFetch = makeMockFetch(true, { archRequest: {} });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.archRequests.create({
        communityId: "comm-1",
        requestType: "fence",
        description: "New fence",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/arch-requests"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("review calls /governance/arch-requests/:id/review with PATCH", async () => {
      mockFetch = makeMockFetch(true, { archRequest: {} });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.archRequests.review(
        "ar-1",
        "approved",
        "Looks good",
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/arch-requests/ar-1/review"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    it("uploadAttachment posts the file bytes without a JSON content type", async () => {
      mockFetch = makeMockFetch(true, {
        key: "comm-1/arch-requests/ar-1/site-plan.pdf",
        archRequest: {},
      });
      vi.stubGlobal("fetch", mockFetch);
      const file = new File(["site plan"], "site-plan.pdf", {
        type: "application/pdf",
      });

      await api.governance.archRequests.uploadAttachment("ar-1", file);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/arch-requests/ar-1/attachments"),
        expect.objectContaining({
          method: "POST",
          body: file,
          headers: { "Content-Type": "application/pdf" },
        }),
      );
    });

    it("uploadAttachment falls back to octet-stream when the file has no MIME type", async () => {
      mockFetch = makeMockFetch(true, {
        key: "comm-1/arch-requests/ar-1/site-plan",
        archRequest: {},
      });
      vi.stubGlobal("fetch", mockFetch);
      const file = new File(["site plan"], "site-plan");

      await api.governance.archRequests.uploadAttachment("ar-1", file);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/arch-requests/ar-1/attachments"),
        expect.objectContaining({
          headers: { "Content-Type": "application/octet-stream" },
        }),
      );
    });
  });

  describe("api.governance.transitions", () => {
    it("list calls /governance/transitions?communityId=...", async () => {
      mockFetch = makeMockFetch(true, { transitions: [] });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.transitions.list("comm-1");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain("/governance/transitions?communityId=comm-1");
    });

    it("acknowledge calls /governance/transitions/:id/acknowledge with PATCH", async () => {
      mockFetch = makeMockFetch(true, { transition: { id: "t-1" } });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.transitions.acknowledge("t-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/transitions/t-1/acknowledge"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    it("complete calls /governance/transitions/:id/complete with PATCH", async () => {
      mockFetch = makeMockFetch(true, { transition: { id: "t-1" } });
      vi.stubGlobal("fetch", mockFetch);
      await api.governance.transitions.complete("t-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/governance/transitions/t-1/complete"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  describe("api.governance.portal.createSession", () => {
    it("calls /owner/sessions with POST and communityId + homeownerId", async () => {
      mockFetch = makeMockFetch(true, {
        token: "tok-abc",
        expiresAt: "2026-06-18T12:00:00.000Z",
      });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.governance.portal.createSession(
        "comm-1",
        "hw-1",
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/owner/sessions"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ communityId: "comm-1", homeownerId: "hw-1" }),
        }),
      );
      expect(result).toEqual({
        token: "tok-abc",
        expiresAt: "2026-06-18T12:00:00.000Z",
      });
    });

    it("passes sendEmail when creating and sending an owner portal invite", async () => {
      mockFetch = makeMockFetch(true, {
        token: "tok-abc",
        expiresAt: "2026-06-18T12:00:00.000Z",
        sent: true,
      });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.governance.portal.createSession(
        "comm-1",
        "hw-1",
        { sendEmail: true },
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/owner/sessions"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            communityId: "comm-1",
            homeownerId: "hw-1",
            sendEmail: true,
          }),
        }),
      );
      expect(result).toEqual({
        token: "tok-abc",
        expiresAt: "2026-06-18T12:00:00.000Z",
        sent: true,
      });
    });
  });

  describe("api.feedback.submit", () => {
    it("calls POST /api/feedback with correct body", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);
      const result = await api.feedback.submit({
        category: "bug",
        message: "something broke",
        pageUrl: "https://my.gavelhouse.app/dashboard",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/feedback"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            category: "bug",
            message: "something broke",
            pageUrl: "https://my.gavelhouse.app/dashboard",
          }),
        }),
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe("api.aiCs", () => {
    it("starts a support session through the Gavelhouse API proxy", async () => {
      mockFetch = makeMockFetch(true, { sessionId: "cs_123" });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.aiCs.startSession({
        topic: "reserve study",
        pageUrl: "https://my.gavelhouse.app/dashboard",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/ai-cs/session"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            topic: "reserve study",
            pageUrl: "https://my.gavelhouse.app/dashboard",
          }),
        }),
      );
      expect(mockFetch.mock.calls[0][0]).not.toContain("ventora-ai-cs-worker");
      expect(result).toEqual({ sessionId: "cs_123" });
    });

    it("sends chat and escalation messages through the Gavelhouse API proxy", async () => {
      mockFetch = makeMockFetch(true, { ok: true });
      vi.stubGlobal("fetch", mockFetch);

      await api.aiCs.chat({
        sessionId: "cs_123",
        message: "How do I close the month?",
      });
      await api.aiCs.escalate({
        sessionId: "cs_123",
        reason: "needs human follow-up",
      });

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("/api/ai-cs/chat"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("/api/ai-cs/escalation"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

import { ownerPortalApi } from "@/lib/api";

describe("ownerPortalApi", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("ownerPortalApi.getMe", () => {
    it("calls /owner/me with x-owner-token header", async () => {
      const meData = {
        homeowner: {
          id: "hw-1",
          firstName: "Jane",
          lastName: "Smith",
          unitNumber: "101",
          email: "jane@example.com",
        },
        assessments: [],
      };
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(meData),
      });
      vi.stubGlobal("fetch", mockFetch);
      const result = await ownerPortalApi.getMe("tok-xyz");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/owner/me"),
        expect.objectContaining({
          headers: expect.objectContaining({ "x-owner-token": "tok-xyz" }),
        }),
      );
      expect(result).toEqual(meData);
    });

    it("throws on non-ok response", async () => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: "Unauthorized" }),
      });
      vi.stubGlobal("fetch", mockFetch);
      await expect(ownerPortalApi.getMe("bad-token")).rejects.toThrow(
        "Unauthorized",
      );
    });

    it("throws 'Unknown error' when body is not parseable JSON", async () => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error("parse error")),
      });
      vi.stubGlobal("fetch", mockFetch);
      await expect(ownerPortalApi.getMe("tok")).rejects.toThrow(
        "Unknown error",
      );
    });

    it("throws with HTTP status when response body has no error field", async () => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: vi.fn().mockResolvedValue({}),
      });
      vi.stubGlobal("fetch", mockFetch);
      await expect(ownerPortalApi.getMe("tok")).rejects.toThrow("HTTP 503");
    });
  });

  describe("ownerPortalApi.getArchRequests", () => {
    it("calls /owner/arch-requests with x-owner-token header", async () => {
      const archData = { archRequests: [] };
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(archData),
      });
      vi.stubGlobal("fetch", mockFetch);
      const result = await ownerPortalApi.getArchRequests("tok-abc");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/owner/arch-requests"),
        expect.objectContaining({
          headers: expect.objectContaining({ "x-owner-token": "tok-abc" }),
        }),
      );
      expect(result).toEqual(archData);
    });
  });

  describe("ownerPortalApi.createArchRequest", () => {
    it("posts owner-submitted architectural requests with the portal token", async () => {
      const archData = {
        archRequest: {
          id: "arch-1",
          requestType: "Patio cover",
          description: "Install a cedar patio cover.",
          status: "pending",
          createdAt: "2026-05-19T12:00:00.000Z",
        },
      };
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue(archData),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await ownerPortalApi.createArchRequest("tok-abc", {
        requestType: "Patio cover",
        description: "Install a cedar patio cover.",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/owner/arch-requests"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "x-owner-token": "tok-abc" }),
          body: JSON.stringify({
            requestType: "Patio cover",
            description: "Install a cedar patio cover.",
          }),
        }),
      );
      expect(result).toEqual(archData);
    });
  });
});

describe("getApiBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns localhost default when VITE_API_URL is not set in non-production", () => {
    vi.stubEnv("VITE_API_URL", "");
    // In test environment PROD is falsy, so no throw expected
    const base = getApiBase();
    expect(base).toBe("http://localhost:8060");
  });

  it("returns VITE_API_URL when it is set", () => {
    vi.stubEnv("VITE_API_URL", "https://api.gavelhouse.app");
    const base = getApiBase();
    expect(base).toBe("https://api.gavelhouse.app");
  });

  it("throws when VITE_API_URL is unset and PROD is truthy", () => {
    // Stub PROD to a truthy value so the production guard activates.
    // vi.stubEnv sets import.meta.env properties; a truthy string triggers the guard.
    vi.stubEnv("PROD", "true");
    vi.stubEnv("VITE_API_URL", "");
    expect(() => getApiBase()).toThrow(
      "VITE_API_URL must be set in production builds",
    );
  });
});
