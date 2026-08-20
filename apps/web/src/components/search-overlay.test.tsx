import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SearchOverlay, loadPagefindModule } from "./search-overlay";
import { sanitizeExcerpt } from "../lib/sanitize";
import { _resetScrollLock } from "../lib/scroll-lock";

const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/analytics", () => ({
  trackEvent: trackEventMock,
}));

// Spy on useFocusTrap to verify SearchOverlay calls it when open
const focusTrapSpy = vi.fn();
vi.mock("../lib/focus-trap", () => ({
  useFocusTrap: (...args: unknown[]) => focusTrapSpy(...args),
}));

describe("sanitizeExcerpt", () => {
  it("passes through plain text unchanged", () => {
    expect(sanitizeExcerpt("plain text")).toBe("plain text");
  });

  it("preserves <mark> tags", () => {
    expect(sanitizeExcerpt("foo <mark>bar</mark> baz")).toBe(
      "foo <mark>bar</mark> baz",
    );
  });

  it("strips non-mark HTML tags (does not leave them as raw HTML)", () => {
    // lib/sanitize strips non-mark tags entirely, leaving only the text content.
    const result = sanitizeExcerpt("<p>foo <strong>bar</strong></p>");
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("<strong>");
    expect(result).toContain("foo");
    expect(result).toContain("bar");
  });

  it("strips script tags - does not execute inner content as HTML", () => {
    // lib/sanitize strips <script> and </script> tags entirely.
    // The inner text content survives (tags stripped, text preserved).
    const result = sanitizeExcerpt('<script>alert("xss")</script>text');
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
    expect(result).toContain("text");
  });

  it("escapes tags with attributes but preserves mark", () => {
    // Non-mark tags get their angle brackets escaped; the mark is preserved.
    const result = sanitizeExcerpt(
      '<span class="x">hello</span> <mark>world</mark>',
    );
    expect(result).not.toContain("<span");
    expect(result).toContain("hello");
    expect(result).toContain("<mark>world</mark>");
  });

  it("handles empty string", () => {
    expect(sanitizeExcerpt("")).toBe("");
  });

  it("preserves closing mark tag", () => {
    expect(sanitizeExcerpt("<mark>hi</mark>")).toBe("<mark>hi</mark>");
  });

  // XSS: attributes on <mark> itself must be stripped (Bug #6)
  it("strips attributes from mark tags - onerror on mark is XSS", () => {
    expect(sanitizeExcerpt('<mark onerror="alert(1)">text</mark>')).toBe(
      "<mark>text</mark>",
    );
  });

  it("strips onclick attribute from mark tag", () => {
    expect(sanitizeExcerpt('<mark onclick="evil()">found</mark>')).toBe(
      "<mark>found</mark>",
    );
  });

  it("plain ampersands are preserved", () => {
    // lib/sanitize does NOT HTML-escape &; it only strips tags and javascript:
    expect(sanitizeExcerpt("foo & bar")).toBe("foo & bar");
  });

  it("is case-insensitive: handles <MARK> uppercase tags", () => {
    expect(sanitizeExcerpt("<MARK>text</MARK>")).toBe("<mark>text</mark>");
  });

  it("strips the img tag with inline event handlers so they cannot execute", () => {
    // lib/sanitize strips the img tag entirely - no raw <img in output.
    const result = sanitizeExcerpt('<img src=x onerror="alert(1)">text');
    expect(result).not.toContain("<img");
    // The text after the tag must still appear
    expect(result).toContain("text");
  });

  it("strips nested HTML tags inside mark content", () => {
    // lib/sanitize strips inner tags from <mark> content, leaving text only.
    expect(sanitizeExcerpt("<mark><em>nested</em></mark>")).toBe(
      "<mark>nested</mark>",
    );
  });
});

describe("loadPagefindModule", () => {
  it("returns null when import fails", async () => {
    // In jsdom environment, /pagefind/pagefind.js does not exist
    const result = await loadPagefindModule();
    expect(result).toBeNull();
  });
});

describe("SearchOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    trackEventMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders search button when closed", () => {
    render(<SearchOverlay siteName="TestSite" />);
    const btn = screen.getByRole("button", { name: "Search TestSite" });
    expect(btn).toBeDefined();
  });

  it("opens overlay on button click", () => {
    render(
      <SearchOverlay
        siteName="TestSite"
        labels={{ emptyState: "Start typing to search" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Start typing to search TestSite")).toBeDefined();
  });

  it("tracks opening source without user-entered text", () => {
    render(<SearchOverlay siteName="TestSite" />);

    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));

    expect(trackEventMock).toHaveBeenCalledWith("search_opened", {
      page_path: "/",
      source: "button",
    });
    expect(trackEventMock).toHaveBeenCalledTimes(1);
  });

  it("uses custom placeholder", () => {
    render(
      <SearchOverlay siteName="TestSite" placeholder="Find articles..." />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    expect(screen.getByPlaceholderText("Find articles...")).toBeDefined();
  });

  it("uses default placeholder", () => {
    render(<SearchOverlay siteName="TestSite" />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    expect(screen.getByPlaceholderText("Search...")).toBeDefined();
  });

  it("opens on Ctrl+K", () => {
    render(<SearchOverlay siteName="TestSite" />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("tracks keyboard opening source", () => {
    render(<SearchOverlay siteName="TestSite" />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(trackEventMock).toHaveBeenCalledWith("search_opened", {
      page_path: "/",
      source: "keyboard",
    });
  });

  it("does not load pagefind twice after reopening", async () => {
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({ results: [] }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);

    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    expect(mockLoader).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    render(<SearchOverlay siteName="TestSite" />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on backdrop click", () => {
    const { container } = render(<SearchOverlay siteName="TestSite" />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    expect(screen.getByRole("dialog")).toBeDefined();

    const backdrop = container.querySelector(
      "[aria-hidden='true']",
    ) as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toggles open/close with Ctrl+K", () => {
    render(<SearchOverlay siteName="TestSite" />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears query on close", () => {
    render(<SearchOverlay siteName="TestSite" />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    const input = screen.getByLabelText("Search query") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test query" } });
    expect(input.value).toBe("test query");

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    const newInput = screen.getByLabelText("Search query") as HTMLInputElement;
    expect(newInput.value).toBe("");
  });

  it("opens with Meta+K (macOS)", () => {
    render(<SearchOverlay siteName="TestSite" />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("shows no-results message when query has no matches", async () => {
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({ results: [] }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(
      <SearchOverlay
        siteName="TestSite"
        labels={{ noResults: "No results for" }}
        _loadPagefind={mockLoader}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));

    // Trigger pagefind load
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "nomatch" } });

    // Advance debounce timer
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    expect(screen.getByText(/No results for/)).toBeDefined();
  });

  it("masks no-result query text from session recordings", async () => {
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({ results: [] }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(
      <SearchOverlay
        siteName="TestSite"
        labels={{ noResults: "No results for" }}
        _loadPagefind={mockLoader}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "private search" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    expect(screen.getByText(/No results for/).dataset.phMask).toBe("true");
  });

  it("tracks no-result searches by length only", async () => {
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({ results: [] }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "nomatch" },
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    expect(trackEventMock).toHaveBeenCalledWith("search_performed", {
      page_path: "/",
      query_length: 7,
      result_count: 0,
    });
    expect(trackEventMock).toHaveBeenCalledWith("search_no_results", {
      page_path: "/",
      query_length: 7,
    });
    expect(JSON.stringify(trackEventMock.mock.calls)).not.toContain("nomatch");
  });

  it("renders search results when pagefind returns matches", async () => {
    const mockResult = {
      url: "/some-page",
      meta: { title: "Some Page Title" },
      excerpt: "A short excerpt about the page",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));

    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "some" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    expect(screen.getByText("Some Page Title")).toBeDefined();
    // The result li must have data-href - no <a> inside role=option (ARIA violation)
    const listItem = container.querySelector("[role='option']") as HTMLElement;
    expect(listItem).not.toBeNull();
    expect(listItem.getAttribute("data-href")).toBe("/some-page");
    // No interactive <a> inside the option
    expect(listItem.querySelector("a")).toBeNull();
  });

  it("tracks search results without sending raw query text", async () => {
    const mockResult = {
      url: "/some-page",
      meta: { title: "Some Page Title" },
      excerpt: "A short excerpt about the page",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "some" },
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    expect(trackEventMock).toHaveBeenCalledWith("search_performed", {
      page_path: "/",
      query_length: 4,
      result_count: 1,
    });
    expect(JSON.stringify(trackEventMock.mock.calls)).not.toContain("some");
  });

  it("sanitizes excerpt HTML to only allow mark tags", async () => {
    const mockResult = {
      url: "/xss-page",
      meta: { title: "XSS Test" },
      excerpt: "<script>evil()</script>safe <mark>match</mark>",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "match" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // Script tag must not be present in rendered DOM (sanitizeExcerpt strips the tags)
    expect(container.querySelector("script")).toBeNull();
    // mark tag should be present (sanitizeExcerpt preserves <mark>)
    expect(container.querySelector("mark")).toBeDefined();
  });

  it("resets loading to false when pf.search() throws", async () => {
    const mockPagefind = {
      search: vi.fn().mockRejectedValue(new Error("network failure")),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(
      <SearchOverlay
        siteName="TestSite"
        labels={{ searching: "Searching..." }}
        _loadPagefind={mockLoader}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));

    // Wait for pagefind to load
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "throws" } });

    // Advance debounce - doSearch fires and throws
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // Loading spinner must be gone - not stuck
    expect(screen.queryByText("Searching...")).toBeNull();
  });

  it("ignores fulfilled search results after the query is cleared", async () => {
    let resolveSearch:
      | ((value: {
          results: { data: () => Promise<PagefindResult> }[];
        }) => void)
      | undefined;
    type PagefindResult = {
      url: string;
      meta: { title: string };
      excerpt: string;
    };
    const mockPagefind = {
      search: vi.fn(
        () =>
          new Promise<{ results: { data: () => Promise<PagefindResult> }[] }>(
            (resolve) => {
              resolveSearch = resolve;
            },
          ),
      ),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "stale" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "" },
    });
    await act(async () => {
      resolveSearch?.({
        results: [
          {
            data: () =>
              Promise.resolve({
                url: "/stale",
                meta: { title: "Stale Result" },
                excerpt: "",
              }),
          },
        ],
      });
    });

    expect(screen.queryByText("Stale Result")).toBeNull();
  });

  it("ignores rejected searches after the query is cleared", async () => {
    let rejectSearch: ((error: Error) => void) | undefined;
    const mockPagefind = {
      search: vi.fn(
        () =>
          new Promise<{ results: never[] }>((_resolve, reject) => {
            rejectSearch = reject;
          }),
      ),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "stale" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "" },
    });
    await act(async () => {
      rejectSearch?.(new Error("stale failure"));
    });

    expect(screen.queryByText("Search failed. Please try again.")).toBeNull();
    expect(trackEventMock).not.toHaveBeenCalledWith(
      "search_failed",
      expect.objectContaining({ query_length: 5 }),
    );
  });

  it("tracks search failures without sending error text or raw query text", async () => {
    const mockPagefind = {
      search: vi.fn().mockRejectedValue(new Error("network failure")),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "throws" },
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    expect(trackEventMock).toHaveBeenCalledWith("search_failed", {
      failure_type: "search",
      page_path: "/",
      query_length: 6,
    });
    const calls = JSON.stringify(trackEventMock.mock.calls);
    expect(calls).not.toContain("throws");
    expect(calls).not.toContain("network failure");
  });

  it("resets loading to false when a result data() call rejects", async () => {
    // Variant: search succeeds but one data() call throws
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [
          { data: () => Promise.reject(new Error("data load failure")) },
        ],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(
      <SearchOverlay
        siteName="TestSite"
        labels={{ searching: "Searching..." }}
        _loadPagefind={mockLoader}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "fail" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // Loading spinner must not be stuck
    expect(screen.queryByText("Searching...")).toBeNull();
  });

  // --- M4: Promise.allSettled - partial failures show only fulfilled results ---

  it("renders fulfilled results and skips rejected data() calls", async () => {
    const goodResult = {
      url: "/good-page",
      meta: { title: "Good Page" },
      excerpt: "A good excerpt",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [
          { data: () => Promise.resolve(goodResult) },
          { data: () => Promise.reject(new Error("data load failure")) },
        ],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "good" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // The fulfilled result should be shown
    expect(screen.getByText("Good Page")).toBeDefined();
    // The loading spinner must be gone (not stuck)
    expect(screen.queryByText("Searching...")).toBeNull();
  });

  it("shows empty results when all data() calls are rejected", async () => {
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [
          { data: () => Promise.reject(new Error("fail 1")) },
          { data: () => Promise.reject(new Error("fail 2")) },
        ],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(
      <SearchOverlay
        siteName="TestSite"
        labels={{ noResults: "No results for" }}
        _loadPagefind={mockLoader}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "fail" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // No results displayed, no loading spinner
    expect(screen.queryByText("Searching...")).toBeNull();
    // All data() calls failed - should show error message, not "no results"
    expect(screen.getByText("Search failed. Please try again.")).toBeDefined();
    // "No results for" must NOT appear when it's actually a search error
    expect(screen.queryByText(/No results for/)).toBeNull();
  });

  it("shows error message with custom errorMessage label when all data() calls reject", async () => {
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.reject(new Error("fail 1")) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(
      <SearchOverlay
        siteName="TestSite"
        labels={{ errorMessage: "Something went wrong." }}
        _loadPagefind={mockLoader}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "fail" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    expect(screen.getByText("Something went wrong.")).toBeDefined();
  });

  it("resets searchError on subsequent successful search", async () => {
    const mockPagefind = {
      search: vi.fn(),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    // First search: all data() reject
    mockPagefind.search.mockResolvedValueOnce({
      results: [{ data: () => Promise.reject(new Error("fail")) }],
    });

    render(
      <SearchOverlay
        siteName="TestSite"
        labels={{ noResults: "No results for" }}
        _loadPagefind={mockLoader}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "fail" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // Error message should be shown
    expect(screen.getByText("Search failed. Please try again.")).toBeDefined();

    // Second search: returns real results
    const goodResult = {
      url: "/good",
      meta: { title: "Good Result" },
      excerpt: "works",
    };
    mockPagefind.search.mockResolvedValueOnce({
      results: [{ data: () => Promise.resolve(goodResult) }],
    });

    fireEvent.change(input, { target: { value: "good" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // Error should be gone, result should show
    expect(screen.queryByText("Search failed. Please try again.")).toBeNull();
    expect(screen.getByText("Good Result")).toBeDefined();
  });

  it("shows search error when pf.search() throws (outer catch)", async () => {
    const mockPagefind = {
      search: vi.fn().mockRejectedValue(new Error("network failure")),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "throws" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    expect(screen.getByText("Search failed. Please try again.")).toBeDefined();
  });

  it("ArrowDown moves focus to the first result", async () => {
    const mockResults = [
      {
        url: "/page-1",
        meta: { title: "Page One" },
        excerpt: "First page",
      },
      {
        url: "/page-2",
        meta: { title: "Page Two" },
        excerpt: "Second page",
      },
    ];
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "page" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // Press ArrowDown to focus first result
    // B-6: the panel is now full-screen on mobile; the inner panel div is the
    // direct non-backdrop child of the dialog wrapper. The backdrop has
    // aria-hidden="true", so :not([aria-hidden]) selects the panel reliably.
    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    ) as HTMLElement;
    fireEvent.keyDown(searchPanel, {
      key: "ArrowDown",
    });

    const listItems = container.querySelectorAll("ul li");
    expect(listItems[0].getAttribute("aria-selected")).toBe("true");
    expect(listItems[1].getAttribute("aria-selected")).toBe("false");
  });

  it("ArrowUp from first result wraps to last result", async () => {
    const mockResults = [
      { url: "/page-1", meta: { title: "Page One" }, excerpt: "First" },
      { url: "/page-2", meta: { title: "Page Two" }, excerpt: "Second" },
    ];
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    )!;
    // ArrowDown to select first (index 0)
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" });
    // ArrowUp should wrap to last (index 1)
    fireEvent.keyDown(searchPanel, { key: "ArrowUp" });

    const listItems = container.querySelectorAll("ul li");
    expect(listItems[1].getAttribute("aria-selected")).toBe("true");
  });

  it("ArrowDown wraps from last result to first", async () => {
    const mockResults = [
      { url: "/page-1", meta: { title: "Page One" }, excerpt: "First" },
      { url: "/page-2", meta: { title: "Page Two" }, excerpt: "Second" },
    ];
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    )!;
    // Move to first, then second, then wrap
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" }); // 0
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" }); // 1
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" }); // wrap to 0

    const listItems = container.querySelectorAll("ul li");
    expect(listItems[0].getAttribute("aria-selected")).toBe("true");
  });

  it("Enter activates the focused result", async () => {
    const mockResult = {
      url: "/enter-page",
      meta: { title: "Enter Page" },
      excerpt: "",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "enter" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    )!;
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" }); // select first - focus moves to li

    // Enter on the focused li (not the panel) activates the result
    const focusedLi = container.querySelector("[role='option']") as HTMLElement;
    fireEvent.keyDown(focusedLi, { key: "Enter" });

    // Overlay should close after activating
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Enter with results but no active item (activeIndex -1) does nothing", async () => {
    const mockResult = {
      url: "/some-page",
      meta: { title: "Some Page" },
      excerpt: "",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "some" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // Results are present but activeIndex is still -1 (no ArrowDown pressed)
    const listItems = container.querySelectorAll("ul li");
    expect(listItems.length).toBeGreaterThan(0);

    // Press Enter without first pressing ArrowDown - should not navigate or throw
    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    )!;
    expect(() => {
      fireEvent.keyDown(searchPanel, { key: "Enter" });
    }).not.toThrow();

    // Dialog must remain open (no navigation occurred)
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("keyboard navigation does nothing when no results", async () => {
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({ results: [] }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay
        siteName="TestSite"
        labels={{ noResults: "No results for" }}
        _loadPagefind={mockLoader}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "nothing" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    )!;
    // Should not throw
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" });
    fireEvent.keyDown(searchPanel, { key: "ArrowUp" });
    fireEvent.keyDown(searchPanel, { key: "Enter" });

    // Dialog should still be open
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("active index resets when query changes", async () => {
    const mockResults1 = [
      { url: "/page-1", meta: { title: "Page One" }, excerpt: "First" },
    ];
    const mockResults2 = [
      { url: "/page-a", meta: { title: "Page Alpha" }, excerpt: "Alpha" },
    ];
    let callCount = 0;
    const mockPagefind = {
      search: vi.fn().mockImplementation(() => {
        callCount++;
        const results = callCount === 1 ? mockResults1 : mockResults2;
        return Promise.resolve({
          results: results.map((r) => ({
            data: () => Promise.resolve(r),
          })),
        });
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    // First search
    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    )!;
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" }); // select index 0
    let listItems = container.querySelectorAll("ul li");
    expect(listItems[0].getAttribute("aria-selected")).toBe("true");

    // Change query - active index should reset
    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "alpha" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    listItems = container.querySelectorAll("ul li");
    expect(listItems[0].getAttribute("aria-selected")).toBe("false");
  });

  it("limits results to maxResults prop when provided", async () => {
    const mockResults = Array.from({ length: 12 }, (_, i) => ({
      url: `/page-${i}`,
      meta: { title: `Page ${i}` },
      excerpt: `Excerpt ${i}`,
    }));
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay
        siteName="TestSite"
        maxResults={5}
        _loadPagefind={mockLoader}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItems = container.querySelectorAll("ul li");
    expect(listItems.length).toBe(5);
  });

  it("defaults to 8 results when maxResults is not provided", async () => {
    const mockResults = Array.from({ length: 12 }, (_, i) => ({
      url: `/page-${i}`,
      meta: { title: `Page ${i}` },
      excerpt: `Excerpt ${i}`,
    }));
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItems = container.querySelectorAll("ul li");
    expect(listItems.length).toBe(8);
  });

  it("clamps maxResults=0 to 1 so at least one result is shown", async () => {
    const mockResults = Array.from({ length: 5 }, (_, i) => ({
      url: `/page-${i}`,
      meta: { title: `Page ${i}` },
      excerpt: `Excerpt ${i}`,
    }));
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay
        siteName="TestSite"
        maxResults={0}
        _loadPagefind={mockLoader}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // maxResults=0 is clamped to 1, so exactly 1 result should show
    const listItems = container.querySelectorAll("ul li");
    expect(listItems.length).toBe(1);
  });

  // --- Bug 2: Focus trap on search overlay dialog ---

  it("useFocusTrap is called with active=true when overlay is open", () => {
    focusTrapSpy.mockClear();
    render(<SearchOverlay siteName="TestSite" />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));

    // useFocusTrap must have been called at least once with active=true
    expect(focusTrapSpy).toHaveBeenCalled();
    const calls = focusTrapSpy.mock.calls;
    const activeTrueCall = calls.find((call) => call[1] === true);
    expect(activeTrueCall).toBeDefined();
  });

  it("useFocusTrap receives a ref whose current points to the search panel div", () => {
    focusTrapSpy.mockClear();
    const { container } = render(<SearchOverlay siteName="TestSite" />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));

    const calls = focusTrapSpy.mock.calls;
    const activeTrueCall = calls.find((call) => call[1] === true);
    expect(activeTrueCall).toBeDefined();

    // The ref passed must be an object with a .current property pointing to the panel
    const ref = activeTrueCall![0] as { current: HTMLElement | null };
    expect(ref).toBeDefined();
    expect(ref.current).not.toBeNull();

    // The panel div must contain the search input
    const input = screen.getByLabelText("Search query");
    expect(ref.current!.contains(input)).toBe(true);

    // Sanity check: the panel is the direct non-backdrop child div of the dialog
    // wrapper. B-6 made the panel full-screen on mobile so max-w-lg is now
    // sm:max-w-lg; the backdrop has aria-hidden="true" so :not([aria-hidden])
    // reliably selects the panel div.
    const panelEl = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    ) as HTMLElement;
    expect(ref.current).toBe(panelEl);
  });

  // Bug 8: pagefind destroy() must be called on unmount
  it("calls pagefind destroy() on unmount if defined", async () => {
    const destroySpy = vi.fn();
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({ results: [] }),
      destroy: destroySpy,
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { unmount } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    // Open overlay to trigger pagefind load
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    // Unmount - destroy must be called
    unmount();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("does not throw on unmount when pagefind has no destroy method", async () => {
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({ results: [] }),
      // no destroy
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { unmount } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    expect(() => unmount()).not.toThrow();
  });

  it("closes overlay when a result item is clicked", async () => {
    const mockResult = {
      url: "/some-page",
      meta: { title: "Some Page Title" },
      excerpt: "",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "some" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItem = container.querySelector("[role='option']") as HTMLElement;
    fireEvent.click(listItem);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // --- WCAG 2.1 A: listbox/option ARIA pattern for search results ---

  it("results list has role=listbox and id=search-results", async () => {
    const mockResult = {
      url: "/aria-page",
      meta: { title: "ARIA Page" },
      excerpt: "testing listbox",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "aria" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const list = container.querySelector("ul");
    expect(list).not.toBeNull();
    expect(list!.getAttribute("role")).toBe("listbox");
    expect(list!.getAttribute("id")).toBe("search-results");
  });

  it("each result li has role=option and aria-selected", async () => {
    const mockResults = [
      { url: "/page-1", meta: { title: "Page One" }, excerpt: "First" },
      { url: "/page-2", meta: { title: "Page Two" }, excerpt: "Second" },
    ];
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItems = container.querySelectorAll("ul li");
    expect(listItems.length).toBe(2);
    listItems.forEach((li, index) => {
      expect(li.getAttribute("role")).toBe("option");
      expect(li.getAttribute("id")).toBe(`search-result-${index}`);
      expect(li.getAttribute("aria-selected")).toBe("false");
    });
  });

  it("each result li has no aria-current attribute", async () => {
    const mockResult = {
      url: "/no-current-page",
      meta: { title: "No Current" },
      excerpt: "should not have aria-current",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "current" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItems = container.querySelectorAll("ul li");
    listItems.forEach((li) => {
      expect(li.hasAttribute("aria-current")).toBe(false);
    });
  });

  it("input has no aria-controls when overlay is open but input is empty", () => {
    render(<SearchOverlay siteName="TestSite" />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));

    const input = screen.getByLabelText("Search query");
    // No query and no results - aria-controls must be absent
    expect(input.getAttribute("aria-controls")).toBeNull();
  });

  it("input has aria-controls=search-results when results are displayed", async () => {
    const mockResult = {
      url: "/ctrl-page",
      meta: { title: "Controls Page" },
      excerpt: "aria-controls test",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "ctrl" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    expect(input.getAttribute("aria-controls")).toBe("search-results");
  });

  it("pressing Enter directly on a result li navigates and closes the overlay", async () => {
    const mockResult = {
      url: "/direct-enter-page",
      meta: { title: "Direct Enter" },
      excerpt: "",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "enter" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItem = container.querySelector("[role='option']") as HTMLElement;
    fireEvent.keyDown(listItem, { key: "Enter" });
    // Overlay must close
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tracks result clicks with a sanitized result path", async () => {
    const mockResult = {
      url: "/direct-enter-page?token=secret#section",
      meta: { title: "Direct Enter" },
      excerpt: "",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "findme" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItem = container.querySelector("[role='option']") as HTMLElement;
    expect(listItem.getAttribute("data-href")).toBe("/direct-enter-page");
    expect(listItem.getAttribute("data-href")).not.toContain("token=secret");
    fireEvent.click(listItem);

    expect(trackEventMock).toHaveBeenCalledWith("search_result_clicked", {
      page_path: "/",
      query_length: 6,
      result_index: 0,
      result_path: "/direct-enter-page",
    });
    const calls = JSON.stringify(trackEventMock.mock.calls);
    expect(calls).not.toContain("findme");
    expect(calls).not.toContain("token=secret");
  });

  it("falls back to splitting invalid result urls before tracking clicks", async () => {
    const mockResult = {
      url: "http://[::1?token=secret#section",
      meta: { title: "Invalid URL Result" },
      excerpt: "",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "invalid" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItem = container.querySelector("[role='option']") as HTMLElement;
    expect(listItem.getAttribute("data-href")).toBe("http://[::1");
    expect(listItem.getAttribute("data-href")).not.toContain("token=secret");
  });

  it("pressing Space directly on a result li navigates and closes the overlay", async () => {
    const mockResult = {
      url: "/direct-space-page",
      meta: { title: "Direct Space" },
      excerpt: "",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "space" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItem = container.querySelector("[role='option']") as HTMLElement;
    fireEvent.keyDown(listItem, { key: "" });
    // Overlay must close
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("other keys on result li do not navigate or close the overlay", async () => {
    const mockResult = {
      url: "/other-key-page",
      meta: { title: "Other Key" },
      excerpt: "",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "other" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItem = container.querySelector("[role='option']") as HTMLElement;
    // Tab key should not close
    expect(() => {
      fireEvent.keyDown(listItem, { key: "Tab" });
    }).not.toThrow();
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("role=option elements contain no interactive children (<a> or <button>)", async () => {
    const mockResults = [
      { url: "/page-1", meta: { title: "Page One" }, excerpt: "First" },
      { url: "/page-2", meta: { title: "Page Two" }, excerpt: "Second" },
    ];
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const options = container.querySelectorAll("[role='option']");
    expect(options.length).toBeGreaterThan(0);
    options.forEach((option) => {
      // WAI-ARIA: role=option must not contain interactive descendants
      expect(option.querySelector("a")).toBeNull();
      expect(option.querySelector("button")).toBeNull();
    });
  });

  it("input aria-activedescendant is undefined when no item is active", async () => {
    const mockResult = {
      url: "/desc-page",
      meta: { title: "Desc Page" },
      excerpt: "testing activedescendant",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "desc" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    // No ArrowDown pressed, so no active item
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("input aria-activedescendant points to active option id after ArrowDown", async () => {
    const mockResults = [
      { url: "/page-1", meta: { title: "Page One" }, excerpt: "First" },
      { url: "/page-2", meta: { title: "Page Two" }, excerpt: "Second" },
    ];
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    )!;
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" }); // activeIndex = 0

    const input = screen.getByLabelText("Search query");
    expect(input.getAttribute("aria-activedescendant")).toBe("search-result-0");

    fireEvent.keyDown(searchPanel, { key: "ArrowDown" }); // activeIndex = 1
    expect(input.getAttribute("aria-activedescendant")).toBe("search-result-1");

    fireEvent.keyDown(searchPanel, { key: "ArrowUp" }); // activeIndex = 0
    expect(input.getAttribute("aria-activedescendant")).toBe("search-result-0");
  });

  it("active option has aria-selected=true, others have aria-selected=false", async () => {
    const mockResults = [
      { url: "/page-1", meta: { title: "Page One" }, excerpt: "First" },
      { url: "/page-2", meta: { title: "Page Two" }, excerpt: "Second" },
    ];
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    )!;
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" }); // activeIndex = 0

    const listItems = container.querySelectorAll("ul li");
    expect(listItems[0].getAttribute("aria-selected")).toBe("true");
    expect(listItems[1].getAttribute("aria-selected")).toBe("false");
  });

  // Bug 10: pagefind race condition - query typed before pagefind loads
  it("retries search after pagefind loads when query was typed before pagefind was ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let resolveLoader: (pf: {
      search: ReturnType<typeof vi.fn>;
      destroy?: () => void;
    }) => void;
    const mockLoader = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolveLoader = r;
      }),
    );

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));

    // Type query before pagefind has loaded
    const input = screen.getByLabelText("Search query");
    fireEvent.change(input, { target: { value: "test query" } });

    // Advance debounce timer - search effect runs but pagefind is null, so no results
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // No results should appear yet (pagefind not loaded)
    expect(screen.queryByRole("list")).toBeNull();

    // Now resolve the pagefind loader
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [
          {
            data: () =>
              Promise.resolve({
                url: "/test",
                meta: { title: "Test Result" },
                excerpt: "test excerpt",
              }),
          },
        ],
      }),
    };
    await act(async () => {
      resolveLoader!(mockPagefind);
    });

    // The search effect should re-run now that pagefindReady is true
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    expect(screen.getByText("Test Result")).toBeDefined();
  });

  // --- Fix A: scroll lock when overlay opens ---

  it("locks body scroll when overlay opens", () => {
    _resetScrollLock();
    document.body.style.overflow = "";
    render(<SearchOverlay siteName="TestSite" />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body scroll when overlay closes", () => {
    _resetScrollLock();
    document.body.style.overflow = "";
    render(<SearchOverlay siteName="TestSite" />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  // --- Fix B: handleResultKeyDown should not handle Enter ---

  it("handleResultKeyDown only handles ArrowDown/ArrowUp, not Enter", async () => {
    const mockResults = [
      { url: "/page-1", meta: { title: "Page One" }, excerpt: "First" },
      { url: "/page-2", meta: { title: "Page Two" }, excerpt: "Second" },
    ];
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    )!;
    // Navigate to first result
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" });

    // Spy on the li click to verify Enter on the panel does NOT trigger a click
    const li = container.querySelector("[role='option']") as HTMLElement;
    const clickSpy = vi.fn();
    li.addEventListener("click", clickSpy);

    // Fire Enter on the search panel (not the li) - this should NOT trigger click
    // because handleResultKeyDown should not handle Enter
    fireEvent.keyDown(searchPanel, { key: "Enter" });

    // The click should NOT have been called by handleResultKeyDown
    expect(clickSpy).not.toHaveBeenCalled();

    li.removeEventListener("click", clickSpy);
  });

  // --- Bug 1B: Roving tabindex pattern ---

  it("only the active result has tabIndex=0, others have tabIndex=-1", async () => {
    const mockResults = [
      { url: "/page-1", meta: { title: "Page One" }, excerpt: "First" },
      { url: "/page-2", meta: { title: "Page Two" }, excerpt: "Second" },
      { url: "/page-3", meta: { title: "Page Three" }, excerpt: "Third" },
    ];
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: mockResults.map((r) => ({ data: () => Promise.resolve(r) })),
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    const { container } = render(
      <SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "page" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    const listItems = container.querySelectorAll("ul li");
    // Initially no active item - all should have tabIndex=-1
    listItems.forEach((li) => {
      expect(li.getAttribute("tabindex")).toBe("-1");
    });

    // ArrowDown to select first
    const searchPanel = container.querySelector(
      "[role='dialog'] > div:not([aria-hidden])",
    )!;
    fireEvent.keyDown(searchPanel, { key: "ArrowDown" });

    // First item should have tabIndex=0, others -1
    const updatedItems = container.querySelectorAll("ul li");
    expect(updatedItems[0].getAttribute("tabindex")).toBe("0");
    expect(updatedItems[1].getAttribute("tabindex")).toBe("-1");
    expect(updatedItems[2].getAttribute("tabindex")).toBe("-1");
  });

  // --- Bug 1C: Combobox ARIA attributes on input ---

  it("input has role=combobox, aria-expanded, and aria-haspopup=listbox", async () => {
    const mockResult = {
      url: "/combobox-page",
      meta: { title: "Combobox Page" },
      excerpt: "combobox test",
    };
    const mockPagefind = {
      search: vi.fn().mockResolvedValue({
        results: [{ data: () => Promise.resolve(mockResult) }],
      }),
    };
    const mockLoader = vi.fn().mockResolvedValue(mockPagefind);

    render(<SearchOverlay siteName="TestSite" _loadPagefind={mockLoader} />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));
    await act(async () => {});

    const input = screen.getByLabelText("Search query");
    // Before results: aria-expanded=false
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-haspopup")).toBe("listbox");
    expect(input.getAttribute("aria-expanded")).toBe("false");

    // Type query and get results
    fireEvent.change(input, { target: { value: "combobox" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // After results: aria-expanded=true
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  // --- Fix C: z-index standardization ---

  it("overlay uses z-[70] class", () => {
    const { container } = render(<SearchOverlay siteName="TestSite" />);
    fireEvent.click(screen.getByRole("button", { name: "Search TestSite" }));

    const overlayDiv = container.querySelector(".fixed.inset-0");
    expect(overlayDiv).not.toBeNull();
    expect(overlayDiv!.className).toContain("z-[70]");
    expect(overlayDiv!.className).not.toContain("z-[100]");
  });
});
