import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { knowledgeBase } from "@boardstack/shared";

const mockTrackDashboardEvent = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (_path: string) =>
    ({ component }: { component: React.ComponentType }) => {
      const route = Object.assign(component, {
        useSearch: () => ({
          role: window.location.search.replace("?role=", "") || undefined,
        }),
        useParams: () => ({ slug: "opening-downloaded-files" }),
      });
      return route;
    },
  Link: ({
    children,
    to,
    onClick,
  }: {
    children: React.ReactNode;
    to: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a
      href={to}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
  notFound: () => new Error("not found"),
}));

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

async function renderHelpPage() {
  const mod = await import("@/routes/_app.help");
  const HelpPage = mod.Route as unknown as React.ComponentType;
  render(<HelpPage />);
}

async function renderHelpTopicPage() {
  const mod = await import("@/routes/_app.help.$slug");
  const HelpTopicPage = mod.Route as unknown as React.ComponentType;
  render(<HelpTopicPage />);
}

describe("HelpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders plain-language help topics and role paths", async () => {
    await renderHelpPage();

    expect(
      screen.getByRole("heading", { name: "Help Center" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(knowledgeBase.app.help.topics[0].title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(knowledgeBase.app.help.topics[1].title),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Start by role" }));

    expect(
      screen.getByText(knowledgeBase.app.help.rolePaths[0].role),
    ).toBeInTheDocument();
    expect(
      screen.getByText(knowledgeBase.app.help.rolePaths[4].role),
    ).toBeInTheDocument();
  });

  it("filters help topics by search", async () => {
    const user = userEvent.setup();

    await renderHelpPage();

    await user.type(screen.getByLabelText("Search help"), "PDF");

    expect(
      screen.getByText(knowledgeBase.app.help.topics[1].title),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Create dues and assessments"),
    ).not.toBeInTheDocument();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "help_search_performed",
      {
        query_length: 3,
        result_count: 2,
      },
    );
    expect(JSON.stringify(mockTrackDashboardEvent.mock.calls)).not.toContain(
      "PDF",
    );
  });

  it("filters help topics by category", async () => {
    const user = userEvent.setup();

    await renderHelpPage();
    await user.click(screen.getByRole("button", { name: "Reports" }));

    expect(screen.getByText("Download an audit pack")).toBeInTheDocument();
    expect(screen.queryByText("Add homeowners")).not.toBeInTheDocument();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "help_category_selected",
      {
        category: "reports",
        result_count: 1,
      },
    );
  });

  it("tracks opened help topics and role paths", async () => {
    const user = userEvent.setup();

    await renderHelpPage();
    await user.click(screen.getAllByRole("link", { name: "Read guide" })[0]);
    await user.click(screen.getByRole("tab", { name: "Start by role" }));
    await user.click(
      screen.getAllByRole("link", { name: "Open role guide" })[0],
    );

    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("help_topic_opened", {
      category: knowledgeBase.app.help.topics[0].category,
      source: "help_index",
      topic_id: knowledgeBase.app.help.topics[0].id,
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "help_role_path_opened",
      {
        role_path_id: knowledgeBase.app.help.rolePaths[0].id,
        source: "help_index",
      },
    );
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain(knowledgeBase.app.help.topics[0].title);
    expect(calls).not.toContain(knowledgeBase.app.help.rolePaths[0].role);
  });

  it("shows glossary entries", async () => {
    const user = userEvent.setup();

    await renderHelpPage();
    await user.click(screen.getByRole("tab", { name: "Glossary" }));

    const glossary = screen.getByRole("tabpanel");
    expect(within(glossary).getByText("PDF")).toBeInTheDocument();
    expect(within(glossary).getByText("ZIP")).toBeInTheDocument();
  });

  it("opens role-specific help from the role query parameter", async () => {
    window.history.pushState({}, "", "/help?role=plain-language");

    await renderHelpPage();

    expect(
      screen.getByRole("heading", {
        name: "Not comfortable with computers",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Go one step at a time.")).toBeInTheDocument();
  });

  it("renders topic pages as article content with a bottom guide action", async () => {
    await renderHelpTopicPage();

    expect(screen.getByRole("article")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Opening downloaded files" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Related app areas")).toBeInTheDocument();
    expect(screen.getByText("Audit pack")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to guides" }),
    ).toBeInTheDocument();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("help_topic_opened", {
      category: "files",
      source: "help_topic",
      topic_id: "opening-downloaded-files",
    });
  });
});
