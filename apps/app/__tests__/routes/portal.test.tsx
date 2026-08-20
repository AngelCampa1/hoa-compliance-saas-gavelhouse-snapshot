import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";

const mockUseSearch = vi.fn(() => ({ token: undefined as string | undefined }));
const mockGetMe = vi.fn();
const mockGetArchRequests = vi.fn();
const mockPayDues = vi.fn();
const mockCreateArchRequest = vi.fn();
const mockTrackDashboardEvent = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) => {
      const route = component as React.ComponentType & {
        useSearch: typeof mockUseSearch;
      };
      route.useSearch = mockUseSearch;
      return route;
    },
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  ownerPortalApi: {
    getMe: (token: string) => mockGetMe(token),
    getArchRequests: (token: string) => mockGetArchRequests(token),
    payDues: (token: string, data: unknown) => mockPayDues(token, data),
    createArchRequest: (token: string, data: unknown) =>
      mockCreateArchRequest(token, data),
  },
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

async function renderPortalPage() {
  const mod = await import("@/routes/portal");
  const PortalPage = mod.Route as unknown as React.ComponentType;
  const config: QueryClientConfig = {
    defaultOptions: { queries: { retry: false } },
  };
  const client = new QueryClient(config);
  render(
    <QueryClientProvider client={client}>
      <PortalPage />
    </QueryClientProvider>,
  );
}

describe("Owner portal help", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockUseSearch.mockReturnValue({ token: undefined });
    mockGetArchRequests.mockResolvedValue({ archRequests: [] });
    mockPayDues.mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.test/session_owner",
      paymentIntentId: null,
    });
    mockCreateArchRequest.mockResolvedValue({
      archRequest: {
        id: "arch-1",
        requestType: "Patio cover",
        description: "Install a cedar patio cover.",
        status: "pending",
        createdAt: "2026-05-19T12:00:00.000Z",
      },
    });
  });

  it("explains what to do when a portal link is missing", async () => {
    await renderPortalPage();

    expect(screen.getByText("Owner portal help")).toBeInTheDocument();
    expect(screen.getByText("This portal link is missing")).toBeInTheDocument();
    expect(
      screen.getByText(/ask your board to send a new one/i),
    ).toBeInTheDocument();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "owner_portal_viewed",
      {
        state: "missing_token",
      },
    );
  });

  it("shows friendly empty states for a valid owner portal", async () => {
    mockUseSearch.mockReturnValue({ token: "owner-token" });
    mockGetMe.mockResolvedValue({
      homeowner: {
        id: "homeowner-1",
        firstName: "Pat",
        lastName: "Rivera",
        unitNumber: "12",
        email: "pat@example.com",
      },
      assessments: [],
    });

    await renderPortalPage();

    await waitFor(() => {
      expect(screen.getByText("Pat Rivera")).toBeInTheDocument();
    });
    expect(screen.getByText(/No assessments yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No requests yet/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "owner_portal_viewed",
        {
          arch_request_count: 0,
          arch_requests_available: true,
          assessment_count: 0,
          payable_assessment_count: 0,
          state: "loaded",
        },
      );
    });
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("owner-token");
    expect(calls).not.toContain("Pat");
    expect(calls).not.toContain("Rivera");
    expect(calls).not.toContain("pat@example.com");
  });

  it("tracks loaded portal once even when arch requests fail or queries rerender", async () => {
    mockUseSearch.mockReturnValue({ token: "owner-token" });
    mockGetMe.mockResolvedValue({
      homeowner: {
        id: "homeowner-1",
        firstName: "Pat",
        lastName: "Rivera",
        unitNumber: "12",
        email: "pat@example.com",
      },
      assessments: [
        {
          id: "assessment-1",
          description: "April dues",
          amountCents: 12500,
          dueDate: "2026-04-30",
          status: "past_due",
        },
      ],
    });
    mockGetArchRequests.mockRejectedValue(new Error("arch unavailable"));

    await renderPortalPage();

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "owner_portal_viewed",
        {
          arch_request_count: 0,
          arch_requests_available: false,
          assessment_count: 1,
          payable_assessment_count: 1,
          state: "loaded",
        },
      );
    });
    await waitFor(() => {
      const loadedCalls = mockTrackDashboardEvent.mock.calls.filter(
        ([event]) => event === "owner_portal_viewed",
      );
      expect(loadedCalls).toHaveLength(1);
    });
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("owner-token");
    expect(calls).not.toContain("Pat");
    expect(calls).not.toContain("pat@example.com");
    expect(calls).not.toContain("April dues");
    expect(calls).not.toContain("arch unavailable");
  });

  it("removes the owner token from the browser URL after reading it", async () => {
    window.history.replaceState(
      {},
      "",
      "/portal?token=owner-token&checkout=success",
    );
    const replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);
    mockUseSearch.mockReturnValue({ token: "owner-token" });
    mockGetMe.mockResolvedValue({
      homeowner: {
        id: "homeowner-1",
        firstName: "Pat",
        lastName: "Rivera",
        unitNumber: "12",
        email: "pat@example.com",
      },
      assessments: [],
    });

    await renderPortalPage();

    await waitFor(() => {
      expect(replaceState).toHaveBeenCalledWith(
        null,
        "",
        "/portal?checkout=success",
      );
    });
  });

  it("renders assessments with responsive list labels", async () => {
    mockUseSearch.mockReturnValue({ token: "owner-token" });
    mockGetMe.mockResolvedValue({
      homeowner: {
        id: "homeowner-1",
        firstName: "Pat",
        lastName: "Rivera",
        unitNumber: "12",
        email: "pat@example.com",
      },
      assessments: [
        {
          id: "assessment-1",
          description: "April dues",
          amountCents: 12500,
          dueDate: "2026-04-30",
          status: "open",
        },
      ],
    });

    await renderPortalPage();

    await waitFor(() => {
      expect(screen.getAllByText("April dues")).toHaveLength(2);
    });
    expect(
      screen.getByRole("table", { name: "Owner portal assessments" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("$125.00")).toHaveLength(2);
  });

  it("lets owners start payment for payable assessments", async () => {
    mockUseSearch.mockReturnValue({ token: "owner-token" });
    mockGetMe.mockResolvedValue({
      homeowner: {
        id: "homeowner-1",
        firstName: "Pat",
        lastName: "Rivera",
        unitNumber: "12",
        email: "pat@example.com",
      },
      assessments: [
        {
          id: "assessment-1",
          description: "April dues",
          amountCents: 12500,
          dueDate: "2026-04-30",
          status: "past_due",
        },
      ],
    });

    await renderPortalPage();

    const button = await screen.findByRole("button", {
      name: /pay april dues/i,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockPayDues).toHaveBeenCalledWith("owner-token", {
        assessmentId: "assessment-1",
        amountCents: 12500,
        method: "card",
      });
    });
    expect(
      await screen.findByRole("link", { name: /go to checkout/i }),
    ).toHaveAttribute("href", "https://checkout.stripe.test/session_owner");
    expect(mockTrackDashboardEvent).not.toHaveBeenCalledWith(
      "owner_portal_payment_started",
      expect.anything(),
    );
    expect(mockTrackDashboardEvent).not.toHaveBeenCalledWith(
      "owner_portal_checkout_ready",
      expect.anything(),
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("owner-token");
    expect(calls).not.toContain("April dues");
    expect(calls).not.toContain("https://checkout.stripe.test");
  });

  it("tracks owner portal payment failures without leaking token or description", async () => {
    mockUseSearch.mockReturnValue({ token: "owner-token" });
    mockGetMe.mockResolvedValue({
      homeowner: {
        id: "homeowner-1",
        firstName: "Pat",
        lastName: "Rivera",
        unitNumber: "12",
        email: "pat@example.com",
      },
      assessments: [
        {
          id: "assessment-1",
          description: "April dues",
          amountCents: 12500,
          dueDate: "2026-04-30",
          status: "past_due",
        },
      ],
    });
    mockPayDues.mockRejectedValueOnce(new Error("Stripe says no"));

    await renderPortalPage();

    const button = await screen.findByRole("button", {
      name: /pay april dues/i,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "owner_portal_payment_failed",
        {
          assessment_id: "assessment-1",
          failure_type: "api_error",
          method: "card",
          status: "past_due",
        },
      );
    });
    await waitFor(() => {
      expect(
        screen.getByText("We could not start your payment. Please try again."),
      ).toBeInTheDocument();
    });
    // The raw server error must never reach a homeowner.
    expect(screen.queryByText("Stripe says no")).not.toBeInTheDocument();
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("owner-token");
    expect(calls).not.toContain("April dues");
    expect(calls).not.toContain("Stripe says no");
  });

  it("lets owners submit architectural requests from the portal", async () => {
    mockUseSearch.mockReturnValue({ token: "owner-token" });
    mockGetMe.mockResolvedValue({
      homeowner: {
        id: "homeowner-1",
        firstName: "Pat",
        lastName: "Rivera",
        unitNumber: "12",
        email: "pat@example.com",
      },
      assessments: [],
    });
    mockGetArchRequests
      .mockResolvedValueOnce({ archRequests: [] })
      .mockResolvedValueOnce({
        archRequests: [
          {
            id: "arch-1",
            requestType: "Patio cover",
            description: "Install a cedar patio cover.",
            status: "pending",
            createdAt: "2026-05-19T12:00:00.000Z",
          },
        ],
      });

    await renderPortalPage();

    const requestTypeInput = await screen.findByLabelText(/request type/i);
    const projectDetailsInput = screen.getByLabelText(/project details/i);
    fireEvent.change(requestTypeInput, {
      target: { value: "Patio cover" },
    });
    fireEvent.change(projectDetailsInput, {
      target: { value: "Install a cedar patio cover." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /submit architectural request/i }),
    );

    await waitFor(() => {
      expect(mockCreateArchRequest).toHaveBeenCalledWith("owner-token", {
        requestType: "Patio cover",
        description: "Install a cedar patio cover.",
      });
    });
    expect(
      await screen.findByText(/architectural request submitted/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /architectural request submitted/i,
    );
    expect(requestTypeInput).toHaveValue("");
    expect(projectDetailsInput).toHaveValue("");
    await waitFor(() => {
      expect(mockGetArchRequests).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("Patio cover")).toBeInTheDocument();
    expect(mockTrackDashboardEvent).not.toHaveBeenCalledWith(
      "owner_portal_arch_request_submitted",
      expect.anything(),
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("owner-token");
    expect(calls).not.toContain("Patio cover");
    expect(calls).not.toContain("Install a cedar patio cover.");
  });

  it("tracks owner portal architectural request failures without raw form text", async () => {
    mockUseSearch.mockReturnValue({ token: "owner-token" });
    mockGetMe.mockResolvedValue({
      homeowner: {
        id: "homeowner-1",
        firstName: "Pat",
        lastName: "Rivera",
        unitNumber: "12",
        email: "pat@example.com",
      },
      assessments: [],
    });
    mockCreateArchRequest.mockRejectedValueOnce(new Error("Bad description"));

    await renderPortalPage();

    const requestTypeInput = await screen.findByLabelText(/request type/i);
    const projectDetailsInput = screen.getByLabelText(/project details/i);
    fireEvent.change(requestTypeInput, {
      target: { value: "Patio cover" },
    });
    fireEvent.change(projectDetailsInput, {
      target: { value: "Install a cedar patio cover." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /submit architectural request/i }),
    );

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "owner_portal_arch_request_failed",
        {
          failure_type: "api_error",
          field_count: 2,
          request_type_length: 11,
        },
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not submit your request. Please try again.",
    );
    // The raw server error must never reach a homeowner.
    expect(screen.queryByText("Bad description")).not.toBeInTheDocument();
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("owner-token");
    expect(calls).not.toContain("Patio cover");
    expect(calls).not.toContain("Install a cedar patio cover.");
    expect(calls).not.toContain("Bad description");
  });
});
