import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockNavigate = vi.fn();
const mockUseSession = vi.fn(() => ({
  data: { user: { id: "user-1", email: "treasurer@example.com" } },
}));
const mockCommunitySetup = vi.fn();
const mockCommunityList = vi.fn();
const mockInvite = vi.fn();
const mockTrackDashboardEvent = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) =>
      component,
  redirect: (target: unknown) => target,
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    useSession: () => mockUseSession(),
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    communities: {
      setup: (data: unknown) => mockCommunitySetup(data),
      list: () => mockCommunityList(),
      invite: (communityId: string, email: string, role: string) =>
        mockInvite(communityId, email, role),
    },
    governance: {
      homeowners: {
        import: vi.fn(),
      },
    },
    finance: {
      reserves: {
        importStudy: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

vi.mock("@/components/help/PageHelpPanel", () => ({
  PageHelpPanel: () => null,
}));

vi.mock("@/components/ui/state-select", () => ({
  StateSelect: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select
      aria-label="State"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">Select a state</option>
      <option value="CA">California</option>
    </select>
  ),
}));

vi.mock("@/components/ui/file-drop-zone", () => ({
  FileDropZone: ({
    accept,
    onFile,
  }: {
    accept: string;
    onFile: (file: File) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onFile(
          new File(
            ["name"],
            accept.includes("json") ? "reserve.csv" : "roster.csv",
          ),
        )
      }
    >
      File drop zone
    </button>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

async function renderSetupPage() {
  const mod = await import("@/routes/setup");
  const SetupPage = mod.Route as unknown as React.ComponentType;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <SetupPage />
    </QueryClientProvider>,
  );
}

/** Advance through step 0 (community basics) */
async function completeStep0(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByLabelText(/community name/i),
    "Sunset Ridge",
  );
  await user.selectOptions(screen.getByLabelText("State"), "CA");
  await user.click(screen.getByRole("button", { name: /continue/i }));
  await screen.findByText("Invite board members");
}

describe("SetupPage analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    mockCommunitySetup.mockResolvedValue({ ok: true });
    mockCommunityList
      .mockResolvedValueOnce({ communities: [] })
      .mockResolvedValue({
        communities: [
          {
            community: {
              id: "community-1",
              name: "Sunset Ridge HOA",
              slug: "sunset-ridge-hoa",
              state: "CA",
              ownerUserId: "user-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            role: "owner",
          },
        ],
      });
    mockInvite.mockResolvedValue({ ok: true });
  });

  it("tracks setup step completion without email or community name", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    await user.type(
      await screen.findByLabelText(/community name/i),
      "Sunset Ridge",
    );
    await user.selectOptions(screen.getByLabelText("State"), "CA");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
        "setup_step_completed",
        {
          step: "community_basics",
          step_index: 0,
          skipped: false,
          source: "setup_wizard",
          community_id: "community-1",
        },
      );
    });

    const properties = mockTrackDashboardEvent.mock.calls[0]![1] as Record<
      string,
      unknown
    >;
    expect(properties).not.toHaveProperty("email");
    expect(properties).not.toHaveProperty("community_name");
  });

  it("tracks skipped setup steps and setup completion", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    await user.type(
      await screen.findByLabelText(/community name/i),
      "Sunset Ridge",
    );
    await user.selectOptions(screen.getByLabelText("State"), "CA");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText("Invite board members");
    await user.click(screen.getByRole("button", { name: /skip for now/i }));
    await screen.findByText("Import homeowner roster");
    await user.click(screen.getByRole("button", { name: /skip for now/i }));
    await screen.findByText("Set up your reserve fund");
    await user.click(screen.getByRole("button", { name: /skip for now/i }));

    await waitFor(() => {
      expect(mockTrackDashboardEvent).toHaveBeenCalledWith("setup_completed", {
        source: "setup_wizard",
        community_id: "community-1",
        completed_count: 1,
        skipped_count: 3,
        total_count: 4,
      });
    });

    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "setup_step_completed",
      {
        step: "board_member_invites",
        step_index: 1,
        skipped: true,
        source: "setup_wizard",
        community_id: "community-1",
      },
    );
  });

  it("does not duplicate step analytics on rapid skip clicks", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    await user.type(
      await screen.findByLabelText(/community name/i),
      "Sunset Ridge",
    );
    await user.selectOptions(screen.getByLabelText("State"), "CA");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const skipButton = await screen.findByRole("button", {
      name: /skip for now/i,
    });
    await user.dblClick(skipButton);

    await waitFor(() => {
      expect(screen.getByText("Import homeowner roster")).toBeInTheDocument();
    });

    const boardInviteSkipCalls = mockTrackDashboardEvent.mock.calls.filter(
      ([name, properties]) =>
        name === "setup_step_completed" &&
        (properties as Record<string, unknown>).step === "board_member_invites",
    );
    expect(boardInviteSkipCalls).toHaveLength(1);
  });

  it("masks selected setup filenames in session recordings", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    await user.type(
      await screen.findByLabelText(/community name/i),
      "Sunset Ridge",
    );
    await user.selectOptions(screen.getByLabelText("State"), "CA");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText("Invite board members");
    await user.click(screen.getByRole("button", { name: /skip for now/i }));
    await screen.findByText("Import homeowner roster");
    await user.click(screen.getByRole("button", { name: "File drop zone" }));

    expect(
      screen.getByText("roster.csv").closest("[data-ph-mask]"),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /skip for now/i }));
    await screen.findByText("Set up your reserve fund");
    await user.click(screen.getByRole("button", { name: "File drop zone" }));

    expect(
      screen.getByText("reserve.csv").closest("[data-ph-mask]"),
    ).not.toBeNull();
  });
});

describe("SetupPage community load failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
  });

  it("shows an error state instead of a permanent skeleton when the communities query fails", async () => {
    mockCommunityList.mockRejectedValue(new Error("network down"));

    await renderSetupPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "We could not load your setup. Refresh the page to try again.",
    );
    // The loading skeleton and the community form must both be gone.
    expect(screen.queryByText("Loading your setup")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/community name/i)).not.toBeInTheDocument();
  });
});

describe("SetupPage FIX 1 — progress bar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    mockCommunitySetup.mockResolvedValue({ ok: true });
    mockCommunityList
      .mockResolvedValueOnce({ communities: [] })
      .mockResolvedValue({
        communities: [
          {
            community: {
              id: "community-1",
              name: "Sunset Ridge HOA",
              slug: "sunset-ridge-hoa",
              state: "CA",
              ownerUserId: "user-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            role: "owner",
          },
        ],
      });
    mockInvite.mockResolvedValue({ ok: true });
  });

  it("shows 25% on step 1 (step index 0)", async () => {
    await renderSetupPage();
    await screen.findByLabelText(/community name/i);

    // The percentage label must read 25% on the first step
    expect(screen.getByText("25%")).toBeInTheDocument();
    // The progressbar element exists
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});

describe("SetupPage FIX 2 — communityId null toast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    mockCommunitySetup.mockResolvedValue({ ok: true });
    // communities list returns empty on both calls so communityId stays null
    mockCommunityList.mockResolvedValue({ communities: [] });
    mockInvite.mockResolvedValue({ ok: true });
  });

  it("toasts error on step 2 import when communityId is null", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    // Step 0 form appears; submit it — communityList has no communities so newId=null
    await user.type(
      await screen.findByLabelText(/community name/i),
      "Sunset Ridge",
    );
    await user.selectOptions(screen.getByLabelText("State"), "CA");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Should land on step 1 (Invite board members); skip it
    await screen.findByText("Invite board members");
    await user.click(screen.getByRole("button", { name: /skip for now/i }));

    // Should land on step 2 (Import homeowner roster)
    await screen.findByText("Import homeowner roster");

    // Select a file then click Import
    await user.click(screen.getByRole("button", { name: "File drop zone" }));
    await user.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "No community found. Please refresh and try again.",
      );
    });
  });

  it("toasts error on step 3 import when communityId is null", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    await user.type(
      await screen.findByLabelText(/community name/i),
      "Sunset Ridge",
    );
    await user.selectOptions(screen.getByLabelText("State"), "CA");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText("Invite board members");
    await user.click(screen.getByRole("button", { name: /skip for now/i }));
    await screen.findByText("Import homeowner roster");
    await user.click(screen.getByRole("button", { name: /skip for now/i }));

    await screen.findByText("Set up your reserve fund");
    await user.click(screen.getByRole("button", { name: "File drop zone" }));
    await user.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "No community found. Please refresh and try again.",
      );
    });
  });
});

describe("SetupPage FIX 3 — disabled import button hint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    mockCommunitySetup.mockResolvedValue({ ok: true });
    mockCommunityList
      .mockResolvedValueOnce({ communities: [] })
      .mockResolvedValue({
        communities: [
          {
            community: {
              id: "community-1",
              name: "Sunset Ridge HOA",
              slug: "sunset-ridge-hoa",
              state: "CA",
              ownerUserId: "user-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            role: "owner",
          },
        ],
      });
    mockInvite.mockResolvedValue({ ok: true });
  });

  it("shows hint text on step 2 before a file is chosen", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    await user.type(
      await screen.findByLabelText(/community name/i),
      "Sunset Ridge",
    );
    await user.selectOptions(screen.getByLabelText("State"), "CA");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText("Invite board members");
    await user.click(screen.getByRole("button", { name: /skip for now/i }));

    await screen.findByText("Import homeowner roster");
    expect(
      screen.getByText("Select a file above to import."),
    ).toBeInTheDocument();
  });

  it("hides hint text on step 2 after a file is selected", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    await user.type(
      await screen.findByLabelText(/community name/i),
      "Sunset Ridge",
    );
    await user.selectOptions(screen.getByLabelText("State"), "CA");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText("Invite board members");
    await user.click(screen.getByRole("button", { name: /skip for now/i }));

    await screen.findByText("Import homeowner roster");
    await user.click(screen.getByRole("button", { name: "File drop zone" }));

    expect(
      screen.queryByText("Select a file above to import."),
    ).not.toBeInTheDocument();
  });
});

describe("SetupPage FIX 5 — multi-invite on step 1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    mockCommunitySetup.mockResolvedValue({ ok: true });
    mockCommunityList
      .mockResolvedValueOnce({ communities: [] })
      .mockResolvedValue({
        communities: [
          {
            community: {
              id: "community-1",
              name: "Sunset Ridge HOA",
              slug: "sunset-ridge-hoa",
              state: "CA",
              ownerUserId: "user-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            role: "owner",
          },
        ],
      });
    mockInvite.mockResolvedValue({ ok: true });
  });

  it("sending an invite keeps you on step 1 and shows the invited email in the list", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    await completeStep0(user);

    await user.type(
      screen.getByPlaceholderText("member@example.com"),
      "secretary@example.com",
    );
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      // Still on step 1
      expect(screen.getByText("Invite board members")).toBeInTheDocument();
      // Email appears in invited list
      expect(screen.getByText("secretary@example.com")).toBeInTheDocument();
    });

    // Email field was cleared
    expect(
      (screen.getByPlaceholderText("member@example.com") as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("can invite a second member and both appear in the list", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    await completeStep0(user);

    await user.type(
      screen.getByPlaceholderText("member@example.com"),
      "secretary@example.com",
    );
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() =>
      expect(screen.getByText("secretary@example.com")).toBeInTheDocument(),
    );

    await user.type(
      screen.getByPlaceholderText("member@example.com"),
      "president@example.com",
    );
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(screen.getByText("secretary@example.com")).toBeInTheDocument();
      expect(screen.getByText("president@example.com")).toBeInTheDocument();
    });
  });

  it("clicking Continue after inviting advances to step 2 and fires analytics with skipped:false", async () => {
    const user = userEvent.setup();
    await renderSetupPage();

    await completeStep0(user);

    await user.type(
      screen.getByPlaceholderText("member@example.com"),
      "secretary@example.com",
    );
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() =>
      expect(screen.getByText("secretary@example.com")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /^continue/i }));

    await waitFor(() => {
      expect(screen.getByText("Import homeowner roster")).toBeInTheDocument();
    });

    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "setup_step_completed",
      expect.objectContaining({
        step: "board_member_invites",
        step_index: 1,
        skipped: false,
      }),
    );
  });
});
