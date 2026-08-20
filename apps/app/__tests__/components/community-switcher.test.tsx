import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommunitySwitcher } from "@/components/community-switcher";
import { CommunityProvider } from "@/lib/community-context";
import type { Community } from "@/lib/api";

function makeCommunity(overrides?: Partial<Community>): Community {
  return {
    id: "c-1",
    name: "Sunset HOA",
    slug: "sunset-hoa",
    state: "CA",
    ownerUserId: "u-1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderWithProvider(
  communities: Array<{ community: Community; role: string }>,
  initialId: string | null = null,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CommunityProvider initialId={initialId}>
        <CommunitySwitcher communities={communities} />
      </CommunityProvider>
    </QueryClientProvider>,
  );
}

describe("CommunitySwitcher", () => {
  // CommunityProvider persists the selected community to localStorage and reads
  // it back before `initialId` (readStoredCommunityId() ?? initialId). Without
  // clearing storage between tests, a selection made in one test leaks into the
  // next via the shared jsdom localStorage, silently overriding `initialId`.
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders "No community" when communities array is empty', () => {
    renderWithProvider([], null);
    expect(screen.getByText("No community")).toBeInTheDocument();
  });

  it("renders a loading label instead of No community while communities load", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <CommunityProvider initialId={null}>
          <CommunitySwitcher communities={[]} isLoading />
        </CommunityProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Loading community...")).toBeInTheDocument();
    expect(screen.queryByText("No community")).not.toBeInTheDocument();
  });

  it("renders the first community name when no community is selected in context", () => {
    const communities = [{ community: makeCommunity(), role: "owner" }];
    renderWithProvider(communities, null);
    expect(screen.getByText("Sunset HOA")).toBeInTheDocument();
  });

  it("renders the selected community from context when it matches", () => {
    const c1 = makeCommunity({ id: "c-1", name: "Sunset HOA" });
    const c2 = makeCommunity({ id: "c-2", name: "Sunrise Condos" });
    const communities = [
      { community: c1, role: "owner" },
      { community: c2, role: "member" },
    ];
    renderWithProvider(communities, "c-2");
    expect(screen.getByText("Sunrise Condos")).toBeInTheDocument();
  });

  it("renders a dropdown trigger button", () => {
    const communities = [{ community: makeCommunity(), role: "owner" }];
    renderWithProvider(communities, "c-1");
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("switches active community when dropdown item is clicked", async () => {
    const user = userEvent.setup();
    const communities = [
      {
        community: makeCommunity({ id: "c-1", name: "Sunset HOA" }),
        role: "owner",
      },
      {
        community: makeCommunity({ id: "c-2", name: "Sunrise Condos" }),
        role: "member",
      },
    ];
    renderWithProvider(communities, "c-1");

    // Open dropdown
    await user.click(screen.getByRole("button"));
    // Click on the second community item
    const items = await screen.findAllByRole("menuitem");
    await user.click(items[1]);

    // Active community should now be Sunrise Condos
    expect(screen.getByText("Sunrise Condos")).toBeInTheDocument();
  });

  it("falls back to first community when selectedCommunityId does not match any community", () => {
    const c1 = makeCommunity({ id: "c-1", name: "Sunset HOA" });
    const communities = [{ community: c1, role: "owner" }];
    renderWithProvider(communities, "nonexistent-id");
    expect(screen.getByText("Sunset HOA")).toBeInTheDocument();
  });

  it("displays the active community name in the trigger button", () => {
    const c1 = makeCommunity({ id: "c-1", name: "Sunset HOA" });
    const communities = [{ community: c1, role: "owner" }];
    renderWithProvider(communities, "c-1");
    expect(screen.getByRole("button")).toHaveTextContent("Sunset HOA");
  });

  it("constrains the active community name so long names can truncate", () => {
    const c1 = makeCommunity({
      id: "c-1",
      name: "The Very Long Sunset Ridge Homeowners Association Community",
    });
    const communities = [{ community: c1, role: "owner" }];
    renderWithProvider(communities, "c-1");

    expect(screen.getByText(c1.name)).toHaveClass("truncate");
  });

  it('uses "Select community" as aria-label when active community name is empty', () => {
    const c1 = makeCommunity({ id: "c-1", name: "" });
    const communities = [{ community: c1, role: "owner" }];
    renderWithProvider(communities, "c-1");
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Select community");
  });

  it("calls queryClient.removeQueries for previous community keys on switch (HIGH-APP-15)", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const removeQueriesSpy = vi.spyOn(client, "removeQueries");

    const c1 = makeCommunity({ id: "c-1", name: "Sunset HOA" });
    const c2 = makeCommunity({ id: "c-2", name: "Sunrise Condos" });
    const communities = [
      { community: c1, role: "owner" },
      { community: c2, role: "member" },
    ];

    render(
      <QueryClientProvider client={client}>
        <CommunityProvider initialId="c-1">
          <CommunitySwitcher communities={communities} />
        </CommunityProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button"));
    const items = await screen.findAllByRole("menuitem");
    await user.click(items[1]);

    expect(removeQueriesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: expect.any(Function) }),
    );
  });

  it("removes only the outgoing community's cached queries on switch (HIGH-APP-15)", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // Seed cached data: one query scoped to the outgoing community (c-1), one
    // scoped to a different community (c-2), and one global (no community id).
    client.setQueryData(["dues", "c-1"], { total: 100 });
    client.setQueryData(["dues", "c-2"], { total: 200 });
    client.setQueryData(["session"], { userId: "u-1" });

    const c1 = makeCommunity({ id: "c-1", name: "Sunset HOA" });
    const c2 = makeCommunity({ id: "c-2", name: "Sunrise Condos" });
    const communities = [
      { community: c1, role: "owner" },
      { community: c2, role: "member" },
    ];

    render(
      <QueryClientProvider client={client}>
        <CommunityProvider initialId="c-1">
          <CommunitySwitcher communities={communities} />
        </CommunityProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button"));
    const items = await screen.findAllByRole("menuitem");
    await user.click(items[1]);

    // The outgoing community's query is evicted; unrelated queries survive.
    expect(client.getQueryData(["dues", "c-1"])).toBeUndefined();
    expect(client.getQueryData(["dues", "c-2"])).toEqual({ total: 200 });
    expect(client.getQueryData(["session"])).toEqual({ userId: "u-1" });
  });

  it("does not call removeQueries when selecting the already-active community (HIGH-APP-15)", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const removeQueriesSpy = vi.spyOn(client, "removeQueries");

    const c1 = makeCommunity({ id: "c-1", name: "Sunset HOA" });
    const c2 = makeCommunity({ id: "c-2", name: "Sunrise Condos" });
    const communities = [
      { community: c1, role: "owner" },
      { community: c2, role: "member" },
    ];

    render(
      <QueryClientProvider client={client}>
        <CommunityProvider initialId="c-1">
          <CommunitySwitcher communities={communities} />
        </CommunityProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button"));
    const items = await screen.findAllByRole("menuitem");
    // Click the first item which is already selected
    await user.click(items[0]);

    expect(removeQueriesSpy).not.toHaveBeenCalled();
  });
});
