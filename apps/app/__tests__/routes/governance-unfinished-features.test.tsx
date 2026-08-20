import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockArchList = vi.fn();
const mockArchReview = vi.fn();
const mockArchUploadAttachment = vi.fn();
const mockTransitionsList = vi.fn();
const mockAcknowledge = vi.fn();
const mockCompleteTransition = vi.fn();
const mockDownloadRoleHandoff = vi.fn();
const mockViolationsList = vi.fn();
const mockViolationsCreate = vi.fn();
const mockUpdateViolationStatus = vi.fn();
const mockViolationEventsList = vi.fn();
const mockViolationPhotoUpload = vi.fn();
const mockHomeownersList = vi.fn();
const mockHomeownersImport = vi.fn();
const mockCreatePortalSession = vi.fn();
const mockMeetingsList = vi.fn();
const mockMotionsList = vi.fn();
const mockCreateMotion = vi.fn();
const mockResolveMotion = vi.fn();
const mockVotesList = vi.fn();
const mockCastVote = vi.fn();
const mockCommunityContext = vi.hoisted(() => ({
  selectedCommunityRole: "owner",
  selectedCommunityTier: "scale",
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/lib/community-context", () => ({
  useCommunity: () => ({
    selectedCommunityId: "comm-1",
    selectedCommunityRole: mockCommunityContext.selectedCommunityRole,
    selectedCommunityTier: mockCommunityContext.selectedCommunityTier,
  }),
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "recipient-1" } } }),
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    reports: {
      downloadRoleHandoff: (communityId: string, transitionId: string) =>
        mockDownloadRoleHandoff(communityId, transitionId),
    },
    governance: {
      homeowners: {
        list: (communityId: string) => mockHomeownersList(communityId),
        import: (communityId: string, csv: string) =>
          mockHomeownersImport(communityId, csv),
      },
      portal: {
        createSession: (
          communityId: string,
          homeownerId: string,
          options?: { sendEmail?: boolean },
        ) => mockCreatePortalSession(communityId, homeownerId, options),
      },
      meetings: {
        list: (communityId: string) => mockMeetingsList(communityId),
        create: vi.fn(),
        recordMinutes: vi.fn(),
        listMotions: (meetingId: string) => mockMotionsList(meetingId),
        createMotion: (meetingId: string, text: string) =>
          mockCreateMotion(meetingId, text),
        resolveMotion: (motionId: string, status: string) =>
          mockResolveMotion(motionId, status),
        listVotes: (motionId: string) => mockVotesList(motionId),
        castVote: (motionId: string, choice: string, notes?: string) =>
          mockCastVote(motionId, choice, notes),
      },
      archRequests: {
        list: (communityId: string) => mockArchList(communityId),
        create: vi.fn(),
        review: (id: string, status: string, reviewNote?: string) =>
          mockArchReview(id, status, reviewNote),
        uploadAttachment: (id: string, file: File) =>
          mockArchUploadAttachment(id, file),
      },
      transitions: {
        list: (communityId: string) => mockTransitionsList(communityId),
        acknowledge: (id: string) => mockAcknowledge(id),
        complete: (id: string) => mockCompleteTransition(id),
      },
      violations: {
        list: (communityId: string) => mockViolationsList(communityId),
        create: (data: unknown) => mockViolationsCreate(data),
        updateStatus: (id: string, status: string, note?: string) =>
          mockUpdateViolationStatus(id, status, note),
        listEvents: (id: string) => mockViolationEventsList(id),
        uploadPhoto: (id: string, file: File) =>
          mockViolationPhotoUpload(id, file),
      },
    },
  },
}));

vi.mock("@boardstack/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@boardstack/shared")>();
  return {
    ...actual,
    FEATURE_MINIMUM_TIER: {
      "governance-workflows": "growth",
      reports: "scale",
    },
    HOMEOWNER_CSV_TEMPLATE: "firstName,lastName,email\n",
    getFieldHelp: () => undefined,
    getPageHelpForRoute: () => undefined,
    roleCan: (role: string | null | undefined, capability: string) => {
      if (capability === "governance:write") {
        return role === "owner" || role === "admin" || role === "secretary";
      }
      if (capability === "report:export") {
        return role !== null && role !== undefined && role !== "viewer";
      }
      return true;
    },
    tierAllowsFeature: (tier: string | null, feature: string) => {
      if (feature === "reports") {
        return tier === "scale" || tier === "portfolio";
      }
      return true;
    },
  };
});

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

async function renderRoute(importPath: string) {
  const mod = (await import(importPath)) as {
    Route: React.ComponentType;
  };
  renderWithClient(<mod.Route />);
}

async function chooseOption(triggerName: RegExp, optionName: RegExp) {
  const user = userEvent.setup();
  const triggers = await screen.findAllByRole("combobox", {
    name: triggerName,
  });
  await user.click(triggers[0]!);
  await user.click(await screen.findByRole("option", { name: optionName }));
  return user;
}

describe("governance unfinished feature fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArchList.mockResolvedValue({ archRequests: [] });
    mockArchReview.mockResolvedValue({ archRequest: {} });
    mockArchUploadAttachment.mockResolvedValue({ archRequest: {} });
    mockTransitionsList.mockResolvedValue({ transitions: [] });
    mockAcknowledge.mockResolvedValue({ transition: {} });
    mockCompleteTransition.mockResolvedValue({ transition: {} });
    mockDownloadRoleHandoff.mockResolvedValue(undefined);
    mockViolationsList.mockResolvedValue({ violations: [] });
    mockViolationsCreate.mockResolvedValue({ violation: {} });
    mockUpdateViolationStatus.mockResolvedValue({ violation: {} });
    mockViolationEventsList.mockResolvedValue({ events: [] });
    mockViolationPhotoUpload.mockResolvedValue({ violation: {} });
    mockHomeownersList.mockResolvedValue({ homeowners: [] });
    mockHomeownersImport.mockResolvedValue({ imported: 0, errors: [] });
    mockCreatePortalSession.mockResolvedValue({
      token: "portal-token",
      expiresAt: "2026-06-18T12:00:00.000Z",
      sent: false,
    });
    mockMeetingsList.mockResolvedValue({ meetings: [] });
    mockMotionsList.mockResolvedValue({ motions: [] });
    mockCreateMotion.mockResolvedValue({ motion: {} });
    mockResolveMotion.mockResolvedValue({ motion: {} });
    mockVotesList.mockResolvedValue({ votes: [], tally: {} });
    mockCastVote.mockResolvedValue({
      vote: {
        id: "vote-1",
        motionId: "motion-1",
        communityId: "comm-1",
        voterUserId: "recipient-1",
        choice: "yes",
        notes: null,
        recordedAt: "2026-05-20T19:35:00.000Z",
      },
    });
    mockCommunityContext.selectedCommunityRole = "owner";
    mockCommunityContext.selectedCommunityTier = "scale";
  });

  it("submits approved-with-conditions review notes and renders saved review metadata", async () => {
    mockArchList.mockResolvedValue({
      archRequests: [
        {
          id: "arch-1",
          communityId: "comm-1",
          unitId: null,
          homeownerId: null,
          requestType: "Fence",
          description: "Install cedar fence",
          status: "pending",
          reviewNote: null,
          reviewedByUserId: null,
          reviewedAt: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "arch-2",
          communityId: "comm-1",
          unitId: null,
          homeownerId: null,
          requestType: "Deck",
          description: "Replace deck",
          status: "approved_with_conditions",
          reviewNote: "Use the approved stain color.",
          reviewedByUserId: "board-1",
          reviewedAt: "2026-05-08T00:00:00.000Z",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-08T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.arch-requests");

    expect(
      await screen.findAllByText("Use the approved stain color."),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText(/reviewed .* by a board member/i),
    ).not.toHaveLength(0);

    const user = await chooseOption(
      /review fence request/i,
      /approve w\/ conditions/i,
    );
    await screen.findByRole("dialog", {
      name: /review architectural request/i,
    });
    await user.type(
      screen.getByLabelText(/review note/i),
      "Match the community trim color.",
    );
    await user.click(screen.getByRole("button", { name: /submit review/i }));

    await waitFor(() => {
      expect(mockArchReview).toHaveBeenCalledWith(
        "arch-1",
        "approved_with_conditions",
        "Match the community trim color.",
      );
    });
  });

  it("hides architectural request write controls for roles the API rejects", async () => {
    mockCommunityContext.selectedCommunityRole = "treasurer";
    mockArchList.mockResolvedValue({
      archRequests: [
        {
          id: "arch-1",
          communityId: "comm-1",
          unitId: null,
          homeownerId: null,
          requestType: "Fence",
          description: "Install cedar fence",
          status: "pending",
          reviewNote: null,
          reviewedByUserId: null,
          reviewedAt: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.arch-requests");

    expect(await screen.findAllByText("Fence")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: /new request/i })).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: /review fence request/i }),
    ).toBeNull();
    expect(screen.queryByLabelText(/upload attachment for fence/i)).toBeNull();
  });

  it("shows architectural request attachments and uploads evidence files", async () => {
    mockArchList.mockResolvedValue({
      archRequests: [
        {
          id: "arch-1",
          communityId: "comm-1",
          unitId: null,
          homeownerId: null,
          requestType: "Fence",
          description: "Install cedar fence",
          status: "pending",
          reviewNote: null,
          reviewedByUserId: null,
          reviewedAt: null,
          attachmentKeys: [
            "comm-1/arch-requests/arch-1/site-plan.pdf",
            "comm-1/arch-requests/arch-1/materials.jpg",
          ],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.arch-requests");

    expect(await screen.findAllByText("2 files")).not.toHaveLength(0);
    expect(screen.getAllByText("site-plan.pdf")).not.toHaveLength(0);
    expect(screen.getAllByText("materials.jpg")).not.toHaveLength(0);
    expect(
      screen.getAllByLabelText(/upload attachment for fence/i)[0],
    ).toHaveAttribute(
      "accept",
      "application/pdf,image/jpeg,image/png,image/gif,image/webp",
    );

    const file = new File(["site plan"], "updated-plan.pdf", {
      type: "application/pdf",
    });
    await userEvent.upload(
      screen.getAllByLabelText(/upload attachment for fence/i)[0]!,
      file,
    );

    await waitFor(() => {
      expect(mockArchUploadAttachment).toHaveBeenCalledWith("arch-1", file);
    });
    await waitFor(() => {
      expect(mockArchList).toHaveBeenCalledTimes(2);
    });
  });

  it("shows transition pending items and downloads a role handoff report without broadening acknowledge permissions", async () => {
    mockTransitionsList.mockResolvedValue({
      transitions: [
        {
          id: "transition-1",
          communityId: "comm-1",
          role: "treasurer",
          fromUserId: "outgoing-1",
          toUserId: "recipient-1",
          status: "pending",
          pendingItems: ["Transfer bank credentials", "Review reserve study"],
          completedAt: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "transition-2",
          communityId: "comm-1",
          role: "secretary",
          fromUserId: "recipient-1",
          toUserId: "other-user",
          status: "acknowledged",
          pendingItems: ["Share meeting minutes"],
          completedAt: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "transition-3",
          communityId: "comm-1",
          role: "owner",
          fromUserId: "outgoing-owner",
          toUserId: "recipient-1",
          status: "pending",
          pendingItems: ["Confirm transfer authority"],
          completedAt: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.transitions");

    expect(
      await screen.findAllByText("Transfer bank credentials"),
    ).not.toHaveLength(0);
    expect(screen.getAllByText("Review reserve study")).not.toHaveLength(0);
    expect(screen.getAllByText("Share meeting minutes")).not.toHaveLength(0);
    expect(screen.getAllByText("Confirm transfer authority")).not.toHaveLength(
      0,
    );
    expect(
      screen.getAllByRole("button", { name: /acknowledge/i }),
    ).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: /complete/i })).toHaveLength(
      2,
    );
    expect(
      screen.queryByRole("button", {
        name: /download owner handoff report/i,
      }),
    ).toBeNull();

    await userEvent.click(
      screen.getAllByRole("button", {
        name: /download treasurer handoff report/i,
      })[0]!,
    );

    expect(mockDownloadRoleHandoff).toHaveBeenCalledWith(
      "comm-1",
      "transition-1",
    );

    await userEvent.click(
      screen.getAllByRole("button", { name: /complete/i })[0]!,
    );

    await waitFor(() => {
      expect(mockCompleteTransition).toHaveBeenCalledWith("transition-2");
    });
  });

  it("hides role handoff reports when the community tier cannot export reports", async () => {
    mockCommunityContext.selectedCommunityTier = "growth";
    mockTransitionsList.mockResolvedValue({
      transitions: [
        {
          id: "transition-1",
          communityId: "comm-1",
          role: "treasurer",
          fromUserId: "outgoing-1",
          toUserId: "recipient-1",
          status: "pending",
          pendingItems: ["Transfer bank credentials"],
          completedAt: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.transitions");

    expect(
      await screen.findAllByText("Transfer bank credentials"),
    ).not.toHaveLength(0);
    expect(
      screen.queryAllByRole("button", {
        name: /download treasurer handoff report/i,
      }),
    ).toHaveLength(0);
  });

  it("labels owner portal session creation as a generated link", async () => {
    mockHomeownersList.mockResolvedValue({
      homeowners: [
        {
          id: "homeowner-1",
          communityId: "comm-1",
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          phone: null,
          moveInDate: null,
          unitId: "unit-1",
          unitNumber: "4B",
          active: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "homeowner-2",
          communityId: "comm-1",
          firstName: "Blake",
          lastName: "Reed",
          email: "blake@example.com",
          phone: null,
          moveInDate: null,
          unitId: null,
          unitNumber: null,
          active: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.homeowners");

    expect(
      await screen.findAllByRole("button", { name: /generate portal link/i }),
    ).not.toHaveLength(0);
    expect(
      screen.queryAllByRole("button", { name: /send portal link/i }),
    ).toHaveLength(0);
    expect(screen.getAllByText("4B")).not.toHaveLength(0);

    const table = screen.getByRole("table", {
      name: /homeowner directory/i,
    });
    const blakeRow = within(table)
      .getAllByRole("row")
      .find((row) => within(row).queryByText("Blake Reed"));
    expect(blakeRow).toBeDefined();
    expect(within(blakeRow!).getAllByText("-")).not.toHaveLength(0);
  });

  it("shows portal link expiration and a homeowner share action after generating a portal link", async () => {
    mockHomeownersList.mockResolvedValue({
      homeowners: [
        {
          id: "homeowner-1",
          communityId: "comm-1",
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          phone: null,
          moveInDate: null,
          unitId: "unit-1",
          unitNumber: "4B",
          active: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.homeowners");

    const user = userEvent.setup();
    const generateButtons = await screen.findAllByRole("button", {
      name: /generate portal link/i,
    });
    await user.click(generateButtons[0]!);

    await waitFor(() => {
      expect(
        screen.getAllByDisplayValue(
          "http://localhost:3000/portal?token=portal-token",
        ),
      ).not.toHaveLength(0);
    });
    expect(screen.getAllByText("Expires 2026-06-18")).not.toHaveLength(0);
    const shareLink = screen.getAllByRole("link", {
      name: /share portal link with avery stone/i,
    })[0]!;
    expect(shareLink).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:avery%40example.com"),
    );
    expect(shareLink).toHaveAttribute(
      "href",
      expect.stringContaining("portal%3Ftoken%3Dportal-token"),
    );
  });

  it("sends a portal invite email from the homeowner row", async () => {
    mockCreatePortalSession.mockResolvedValue({
      token: "sent-token",
      expiresAt: "2026-06-18T12:00:00.000Z",
      sent: true,
    });
    mockHomeownersList.mockResolvedValue({
      homeowners: [
        {
          id: "homeowner-1",
          communityId: "comm-1",
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          phone: null,
          moveInDate: null,
          unitId: "unit-1",
          unitNumber: "4B",
          active: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.homeowners");

    const user = userEvent.setup();
    const sendButtons = await screen.findAllByRole("button", {
      name: /send portal email/i,
    });
    await user.click(sendButtons[0]!);

    await waitFor(() => {
      expect(mockCreatePortalSession).toHaveBeenCalledWith(
        "comm-1",
        "homeowner-1",
        { sendEmail: true },
      );
    });
    expect(screen.getAllByText("Email sent")).not.toHaveLength(0);
    expect(screen.getAllByText("Expires 2026-06-18")).not.toHaveLength(0);
  });

  it("shows a fallback link when portal invite email delivery fails", async () => {
    mockCreatePortalSession.mockResolvedValue({
      token: "fallback-token",
      expiresAt: "2026-06-18T12:00:00.000Z",
      sent: false,
    });
    mockHomeownersList.mockResolvedValue({
      homeowners: [
        {
          id: "homeowner-1",
          communityId: "comm-1",
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          phone: null,
          moveInDate: null,
          unitId: "unit-1",
          unitNumber: "4B",
          active: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.homeowners");

    const user = userEvent.setup();
    const sendButtons = await screen.findAllByRole("button", {
      name: /send portal email/i,
    });
    await user.click(sendButtons[0]!);

    expect(
      await screen.findByText(
        "Portal email could not be sent. A link was generated; copy or share it manually.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByDisplayValue(
        "http://localhost:3000/portal?token=fallback-token",
      ),
    ).not.toHaveLength(0);
    expect(screen.queryByText("Email sent")).toBeNull();
  });

  it("renders structured homeowner import skipped rows as readable messages", async () => {
    mockHomeownersImport.mockResolvedValue({
      created: 0,
      skipped: [
        {
          row: 3,
          email: "jane@test.com",
          reason: "already-exists",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.homeowners");

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /import roster csv/i }),
    );

    const file = new File(
      ["firstName,lastName,email,address\nJane,Smith,jane@test.com,123 Main"],
      "homeowners.csv",
      { type: "text/csv" },
    );
    fireEvent.drop(
      screen.getByRole("button", { name: /drop your roster csv/i }),
      {
        dataTransfer: { files: [file] },
      },
    );

    expect(await screen.findByText(/1 row skipped/i)).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).toBeNull();
  });

  it("collects homeowner references, exposes violation evidence and history, and sends transition notes", async () => {
    mockHomeownersList.mockResolvedValue({
      homeowners: [
        {
          id: "homeowner-1",
          communityId: "comm-1",
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          phone: null,
          moveInDate: null,
          active: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    mockViolationsList.mockResolvedValue({
      violations: [
        {
          id: "violation-1",
          communityId: "comm-1",
          unitId: "unit-1",
          homeownerId: "homeowner-1",
          title: "Trash bins",
          description: "Bins left out",
          status: "open",
          photoKeys: ["photo-a.jpg", "photo-b.jpg"],
          createdByUserId: "user-1",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    mockViolationEventsList.mockResolvedValue({
      events: [
        {
          id: "event-1",
          violationId: "violation-1",
          communityId: "comm-1",
          toStatus: "open",
          note: "Observed during inspection.",
          actorUserId: "user-1",
          occurredAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.violations");

    expect(
      await screen.findAllByText("Homeowner: Avery Stone"),
    ).not.toHaveLength(0);
    expect(screen.getAllByText("Unit: unit-1")).not.toHaveLength(0);
    expect(screen.getAllByText("2 photos")).not.toHaveLength(0);
    expect(screen.getAllByText("photo-a.jpg")).not.toHaveLength(0);
    expect(screen.getAllByText("photo-b.jpg")).not.toHaveLength(0);
    expect(
      await screen.findAllByText("Observed during inspection."),
    ).not.toHaveLength(0);
    expect(mockViolationEventsList).toHaveBeenCalledWith("violation-1");
    const historyFetchCount = mockViolationEventsList.mock.calls.length;

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /log violation/i }));
    await user.type(screen.getByLabelText(/title/i), "Parking");
    await user.type(screen.getByLabelText(/description/i), "Blocked lane");
    expect(screen.queryByLabelText(/unit reference/i)).toBeNull();
    await user.click(screen.getByRole("combobox", { name: /homeowner/i }));
    await user.click(screen.getByRole("option", { name: /avery stone/i }));
    await user.click(screen.getByRole("button", { name: /log violation/i }));

    await waitFor(() => {
      expect(mockViolationsCreate).toHaveBeenCalledWith({
        communityId: "comm-1",
        title: "Parking",
        description: "Blocked lane",
        homeownerId: "homeowner-1",
      });
    });

    const transitionUser = await chooseOption(
      /change status for trash bins/i,
      /mark notified/i,
    );
    await screen.findByRole("dialog", { name: /record status update/i });
    await transitionUser.type(
      screen.getByLabelText(/status note/i),
      "Courtesy call completed.",
    );
    await transitionUser.click(
      screen.getByRole("button", { name: /update status/i }),
    );

    await waitFor(() => {
      expect(mockUpdateViolationStatus).toHaveBeenCalledWith(
        "violation-1",
        "notified",
        "Courtesy call completed.",
      );
    });
    await waitFor(() => {
      expect(mockViolationEventsList.mock.calls.length).toBeGreaterThan(
        historyFetchCount,
      );
    });

    await user.upload(
      screen.getAllByLabelText(/upload photo for trash bins/i)[0]!,
      new File(["image"], "trash.jpg", { type: "image/jpeg" }),
    );

    await waitFor(() => {
      expect(mockViolationPhotoUpload).toHaveBeenCalledWith(
        "violation-1",
        expect.objectContaining({ name: "trash.jpg" }),
      );
    });
  });

  it("hides violation write controls for roles the API rejects", async () => {
    mockCommunityContext.selectedCommunityRole = "viewer";
    mockHomeownersList.mockResolvedValue({ homeowners: [] });
    mockViolationsList.mockResolvedValue({
      violations: [
        {
          id: "violation-1",
          communityId: "comm-1",
          unitId: null,
          homeownerId: null,
          title: "Trash bins",
          description: "Bins left out",
          status: "open",
          photoKeys: [],
          createdByUserId: "user-1",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    await renderRoute("@/routes/_app.governance.violations");

    expect(await screen.findAllByText("Trash bins")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: /log violation/i })).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: /change status for trash bins/i }),
    ).toBeNull();
  });

  it("exposes meeting motions, vote tallies, voting, and resolution controls", async () => {
    mockMeetingsList.mockResolvedValue({
      meetings: [
        {
          id: "meeting-1",
          communityId: "comm-1",
          title: "May Board Meeting",
          meetingType: "board",
          scheduledAt: "2026-05-20T19:00:00.000Z",
          location: "Clubhouse",
          minutesText: null,
          minutesFinalizedAt: null,
          createdByUserId: "user-1",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    mockMotionsList.mockResolvedValue({
      motions: [
        {
          id: "motion-1",
          meetingId: "meeting-1",
          communityId: "comm-1",
          text: "Approve roof contract",
          movedByUserId: null,
          secondedByUserId: null,
          status: "pending",
          resolvedAt: null,
          createdAt: "2026-05-20T19:30:00.000Z",
        },
      ],
    });
    mockVotesList.mockResolvedValue({
      votes: [],
      tally: { yes: 2, no: 1, abstain: 0 },
    });

    await renderRoute("@/routes/_app.governance.meetings");

    await userEvent.click(
      (
        await screen.findAllByRole("button", {
          name: /motions and votes/i,
        })
      )[0]!,
    );

    expect(
      await screen.findByRole("dialog", {
        name: /motions and votes - may board meeting/i,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Approve roof contract"),
    ).toBeInTheDocument();
    expect(screen.getByText("Yes 2")).toBeInTheDocument();
    expect(screen.getByText("No 1")).toBeInTheDocument();
    expect(screen.getByText("Abstain 0")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/new motion/i), "Approve pool rules");
    await user.click(screen.getByRole("button", { name: /add motion/i }));

    await waitFor(() => {
      expect(mockCreateMotion).toHaveBeenCalledWith(
        "meeting-1",
        "Approve pool rules",
      );
    });

    await user.click(
      screen.getByRole("button", {
        name: /vote yes on approve roof contract/i,
      }),
    );
    await waitFor(() => {
      expect(mockCastVote).toHaveBeenCalledWith("motion-1", "yes", undefined);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: /vote yes on approve roof contract/i,
        }),
      ).toBeNull();
    });

    await user.click(
      screen.getByRole("button", {
        name: /mark approve roof contract passed/i,
      }),
    );
    await waitFor(() => {
      expect(mockResolveMotion).toHaveBeenCalledWith("motion-1", "passed");
    });
  });

  it("shows a recorded meeting vote instead of allowing duplicate voting", async () => {
    mockMeetingsList.mockResolvedValue({
      meetings: [
        {
          id: "meeting-1",
          communityId: "comm-1",
          title: "May Board Meeting",
          meetingType: "board",
          scheduledAt: "2026-05-20T19:00:00.000Z",
          location: "Clubhouse",
          minutesText: null,
          minutesFinalizedAt: null,
          createdByUserId: "user-1",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    mockMotionsList.mockResolvedValue({
      motions: [
        {
          id: "motion-1",
          meetingId: "meeting-1",
          communityId: "comm-1",
          text: "Approve roof contract",
          movedByUserId: null,
          secondedByUserId: null,
          status: "pending",
          resolvedAt: null,
          createdAt: "2026-05-20T19:30:00.000Z",
        },
      ],
    });
    mockVotesList.mockResolvedValue({
      votes: [
        {
          id: "vote-1",
          motionId: "motion-1",
          communityId: "comm-1",
          voterUserId: "recipient-1",
          choice: "yes",
          notes: null,
          recordedAt: "2026-05-20T19:35:00.000Z",
        },
      ],
      tally: { yes: 1, no: 0, abstain: 0 },
    });

    await renderRoute("@/routes/_app.governance.meetings");

    await userEvent.click(
      (
        await screen.findAllByRole("button", {
          name: /motions and votes/i,
        })
      )[0]!,
    );

    expect(await screen.findByText("Your vote: yes")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /vote yes on approve roof contract/i,
      }),
    ).toBeNull();
  });

  it("hides meeting vote and motion write controls for read-only roles", async () => {
    mockCommunityContext.selectedCommunityRole = "viewer";
    mockMeetingsList.mockResolvedValue({
      meetings: [
        {
          id: "meeting-1",
          communityId: "comm-1",
          title: "May Board Meeting",
          meetingType: "board",
          scheduledAt: "2026-05-20T19:00:00.000Z",
          location: "Clubhouse",
          minutesText: null,
          minutesFinalizedAt: null,
          createdByUserId: "user-1",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    mockMotionsList.mockResolvedValue({
      motions: [
        {
          id: "motion-1",
          meetingId: "meeting-1",
          communityId: "comm-1",
          text: "Approve roof contract",
          movedByUserId: null,
          secondedByUserId: null,
          status: "pending",
          resolvedAt: null,
          createdAt: "2026-05-20T19:30:00.000Z",
        },
      ],
    });
    mockVotesList.mockResolvedValue({
      votes: [],
      tally: { yes: 0, no: 0, abstain: 0 },
    });

    await renderRoute("@/routes/_app.governance.meetings");

    await userEvent.click(
      (
        await screen.findAllByRole("button", {
          name: /motions and votes/i,
        })
      )[0]!,
    );

    expect(
      await screen.findByText("Approve roof contract"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /vote yes on approve roof contract/i,
      }),
    ).toBeNull();
    expect(screen.queryByLabelText(/new motion/i)).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /mark approve roof contract passed/i,
      }),
    ).toBeNull();
  });
});
