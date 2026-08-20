import { describe, expect, it, vi, beforeEach } from "vitest";

const mockTrackDashboardEvent = vi.fn();

vi.mock("@/lib/analytics", () => ({
  trackDashboardEvent: mockTrackDashboardEvent,
}));

describe("makeHelpSearchHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits search_opened when onOpen is called", async () => {
    const { makeHelpSearchHandlers } =
      await import("@/lib/help-search-analytics");
    const { onOpen } = makeHelpSearchHandlers();
    onOpen();
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("search_opened", {
      source: "help",
    });
  });

  it("emits search_performed with result_count when query finds results", async () => {
    const { makeHelpSearchHandlers } =
      await import("@/lib/help-search-analytics");
    const { onSearch } = makeHelpSearchHandlers();
    onSearch({ result_count: 3, has_results: true });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("search_performed", {
      source: "help",
      result_count: 3,
      has_results: true,
    });
  });

  it("emits search_performed and search_no_results when result_count is 0", async () => {
    const { makeHelpSearchHandlers } =
      await import("@/lib/help-search-analytics");
    const { onSearch } = makeHelpSearchHandlers();
    onSearch({ result_count: 0, has_results: false });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("search_performed", {
      source: "help",
      result_count: 0,
      has_results: false,
    });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("search_no_results", {
      source: "help",
    });
  });

  it("emits search_result_clicked with result_position", async () => {
    const { makeHelpSearchHandlers } =
      await import("@/lib/help-search-analytics");
    const { onResultClick } = makeHelpSearchHandlers();
    onResultClick({ result_position: 2 });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith(
      "search_result_clicked",
      {
        source: "help",
        result_position: 2,
      },
    );
  });

  it("emits search_failed with failure_type", async () => {
    const { makeHelpSearchHandlers } =
      await import("@/lib/help-search-analytics");
    const { onFailed } = makeHelpSearchHandlers();
    onFailed({ failure_type: "unexpected" });
    expect(mockTrackDashboardEvent).toHaveBeenCalledWith("search_failed", {
      source: "help",
      failure_type: "unexpected",
    });
  });

  it("does not include query text in any emitted event", async () => {
    const { makeHelpSearchHandlers } =
      await import("@/lib/help-search-analytics");
    const { onSearch } = makeHelpSearchHandlers();
    onSearch({ result_count: 1, has_results: true });
    const calls = JSON.stringify(mockTrackDashboardEvent.mock.calls);
    expect(calls).not.toContain("query");
    expect(calls).not.toContain("search_query");
    expect(calls).not.toContain("raw_query");
  });
});
