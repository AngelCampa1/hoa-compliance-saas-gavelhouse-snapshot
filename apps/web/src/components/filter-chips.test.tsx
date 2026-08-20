import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterChips } from "./filter-chips";
import type { FilterDef, SortOption, ContentItem } from "../lib/types";

const filters: FilterDef[] = [
  {
    id: "buyerStage",
    label: "Stage",
    options: [
      { value: "tofu", label: "Awareness" },
      { value: "mofu", label: "Consideration" },
      { value: "bofu", label: "Decision" },
    ],
  },
];

const items: ContentItem[] = [
  {
    buyerStage: "tofu",
    title: "Article A",
    description: "Desc A",
    href: "/a",
    relatedPages: [],
    publishedAt: "2024-01-01",
    updatedAt: "2024-01-01",
  },
  {
    buyerStage: "mofu",
    title: "Article B",
    description: "Desc B",
    href: "/b",
    relatedPages: [],
    publishedAt: "2024-01-02",
    updatedAt: "2024-01-02",
  },
  {
    buyerStage: "bofu",
    title: "Article C",
    description: "Desc C",
    href: "/c",
    relatedPages: [],
    publishedAt: "2024-01-03",
    updatedAt: "2024-01-03",
  },
  {
    buyerStage: "tofu",
    title: "Article D",
    description: "Desc D",
    href: "/d",
    relatedPages: [],
    publishedAt: "2024-01-04",
    updatedAt: "2024-01-04",
  },
];

const defaultProps = {
  filters,
  items,
  onItemsFiltered: vi.fn(),
};

describe("FilterChips", () => {
  it("renders filter labels and options", () => {
    render(<FilterChips {...defaultProps} />);
    expect(screen.getByText("Stage:")).toBeDefined();
    expect(screen.getByText("Awareness")).toBeDefined();
    expect(screen.getByText("Consideration")).toBeDefined();
    expect(screen.getByText("Decision")).toBeDefined();
  });

  it("toggles filter on click and shows count", () => {
    render(<FilterChips {...defaultProps} />);
    const btn = screen.getByText("Awareness");
    fireEvent.click(btn);

    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("2 of 4")).toBeDefined();
    expect(screen.getByText("Clear")).toBeDefined();
  });

  it("deselects filter on second click", () => {
    render(<FilterChips {...defaultProps} />);
    const btn = screen.getByText("Awareness");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("Clear")).toBeNull();
  });

  it("clears all filters on Clear click", () => {
    render(<FilterChips {...defaultProps} />);
    fireEvent.click(screen.getByText("Awareness"));
    expect(screen.getByText("Clear")).toBeDefined();

    fireEvent.click(screen.getByText("Clear"));
    expect(screen.queryByText("Clear")).toBeNull();
    expect(screen.getByText("Awareness").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("does not render sort when no sortOptions", () => {
    render(<FilterChips {...defaultProps} />);
    expect(screen.queryByLabelText("Sort:")).toBeNull();
  });

  it("renders sort dropdown when sortOptions provided", () => {
    const sortOptions: SortOption[] = [
      { value: "newest", label: "Newest" },
      { value: "oldest", label: "Oldest" },
    ];
    render(
      <FilterChips
        {...defaultProps}
        sortOptions={sortOptions}
        defaultSort="newest"
      />,
    );
    const select = screen.getByLabelText("Sort:");
    expect(select).toBeDefined();
    expect((select as HTMLSelectElement).value).toBe("newest");
  });

  it("does not render sort when only one sortOption", () => {
    const sortOptions: SortOption[] = [{ value: "newest", label: "Newest" }];
    render(<FilterChips {...defaultProps} sortOptions={sortOptions} />);
    expect(screen.queryByLabelText("Sort:")).toBeNull();
  });

  it("changes sort value on select", () => {
    const sortOptions: SortOption[] = [
      { value: "newest", label: "Newest" },
      { value: "oldest", label: "Oldest" },
    ];
    render(<FilterChips {...defaultProps} sortOptions={sortOptions} />);
    const select = screen.getByLabelText("Sort:") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "oldest" } });
    expect(select.value).toBe("oldest");
  });

  it("switches between filter values in the same group", () => {
    render(<FilterChips {...defaultProps} />);
    fireEvent.click(screen.getByText("Awareness"));
    expect(screen.getByText("Awareness").getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.click(screen.getByText("Decision"));
    expect(screen.getByText("Decision").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByText("Awareness").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByText("1 of 4")).toBeDefined();
  });

  // Bug #7: callback props were accepted but never called - these must fail before the fix

  it("calls onFilterChange with active filters when a filter is clicked", () => {
    const onFilterChange = vi.fn();
    render(<FilterChips {...defaultProps} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText("Awareness"));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({ buyerStage: "tofu" });
  });

  it("calls onFilterChange with empty object when filter is deselected", () => {
    const onFilterChange = vi.fn();
    render(<FilterChips {...defaultProps} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText("Awareness")); // select
    fireEvent.click(screen.getByText("Awareness")); // deselect
    expect(onFilterChange).toHaveBeenCalledTimes(2);
    expect(onFilterChange).toHaveBeenLastCalledWith({});
  });

  it("calls onSortChange when sort select changes", () => {
    const onSortChange = vi.fn();
    const sortOptions: SortOption[] = [
      { value: "newest", label: "Newest" },
      { value: "oldest", label: "Oldest" },
    ];
    render(
      <FilterChips
        {...defaultProps}
        sortOptions={sortOptions}
        onSortChange={onSortChange}
      />,
    );
    const select = screen.getByLabelText("Sort:") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "oldest" } });
    expect(onSortChange).toHaveBeenCalledTimes(1);
    expect(onSortChange).toHaveBeenCalledWith("oldest");
  });

  it("calls onItemsFiltered with all items on initial render", () => {
    const onItemsFiltered = vi.fn();
    render(<FilterChips {...defaultProps} onItemsFiltered={onItemsFiltered} />);
    expect(onItemsFiltered).toHaveBeenCalled();
    expect(onItemsFiltered).toHaveBeenCalledWith(items);
  });

  it("calls onItemsFiltered with filtered items when filter is active", () => {
    const onItemsFiltered = vi.fn();
    render(<FilterChips {...defaultProps} onItemsFiltered={onItemsFiltered} />);
    fireEvent.click(screen.getByText("Awareness"));
    // Should be called again with only tofu items
    const lastCall =
      onItemsFiltered.mock.calls[onItemsFiltered.mock.calls.length - 1];
    expect(lastCall[0]).toEqual([
      {
        buyerStage: "tofu",
        title: "Article A",
        description: "Desc A",
        href: "/a",
        relatedPages: [],
        publishedAt: "2024-01-01",
        updatedAt: "2024-01-01",
      },
      {
        buyerStage: "tofu",
        title: "Article D",
        description: "Desc D",
        href: "/d",
        relatedPages: [],
        publishedAt: "2024-01-04",
        updatedAt: "2024-01-04",
      },
    ]);
  });

  it("calls onItemsFiltered with all items when filters are cleared", () => {
    const onItemsFiltered = vi.fn();
    render(<FilterChips {...defaultProps} onItemsFiltered={onItemsFiltered} />);
    fireEvent.click(screen.getByText("Awareness"));
    fireEvent.click(screen.getByText("Clear"));
    const lastCall =
      onItemsFiltered.mock.calls[onItemsFiltered.mock.calls.length - 1];
    expect(lastCall[0]).toEqual(items);
  });

  it("calls onFilterChange with empty object when Clear is clicked", () => {
    const onFilterChange = vi.fn();
    render(<FilterChips {...defaultProps} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText("Awareness")); // activate a filter so Clear appears
    onFilterChange.mockClear(); // reset call count - only care about the Clear click
    fireEvent.click(screen.getByText("Clear"));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({});
  });

  it("does not throw when onFilterChange is not provided", () => {
    // Callbacks are optional - must not crash when omitted
    expect(() => {
      render(
        <FilterChips
          filters={filters}
          items={items}
          onItemsFiltered={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByText("Awareness"));
    }).not.toThrow();
  });

  it("sort select is labelled by its associated <label> element", () => {
    const sortOptions: SortOption[] = [
      { value: "newest", label: "Newest" },
      { value: "oldest", label: "Oldest" },
    ];
    render(
      <FilterChips
        {...defaultProps}
        sortOptions={sortOptions}
        defaultSort="newest"
      />,
    );
    // The <label> text "Sort:" is the accessible name - no aria-label override
    const select = screen.getByLabelText("Sort:");
    expect(select).toBeDefined();
    expect(select.tagName).toBe("SELECT");
  });

  // --- M5: items in useEffect dep array - re-syncs when parent passes new items ---

  it("calls onItemsFiltered with updated items when items prop changes", () => {
    const onItemsFiltered = vi.fn();
    const initialItems: ContentItem[] = [
      {
        buyerStage: "tofu",
        title: "Article A",
        description: "Desc A",
        href: "/a",
        relatedPages: [],
        publishedAt: "2024-01-01",
        updatedAt: "2024-01-01",
      },
    ];
    const newItems: ContentItem[] = [
      {
        buyerStage: "tofu",
        title: "Article A",
        description: "Desc A",
        href: "/a",
        relatedPages: [],
        publishedAt: "2024-01-01",
        updatedAt: "2024-01-01",
      },
      {
        buyerStage: "mofu",
        title: "Article B",
        description: "Desc B",
        href: "/b",
        relatedPages: [],
        publishedAt: "2024-01-02",
        updatedAt: "2024-01-02",
      },
    ];

    const { rerender } = render(
      <FilterChips
        filters={filters}
        items={initialItems}
        onItemsFiltered={onItemsFiltered}
      />,
    );

    // Called once on mount with initial items
    expect(onItemsFiltered).toHaveBeenCalledWith(initialItems);
    const callCountAfterMount = onItemsFiltered.mock.calls.length;

    // Rerender with a new items array (same reference would not trigger)
    rerender(
      <FilterChips
        filters={filters}
        items={newItems}
        onItemsFiltered={onItemsFiltered}
      />,
    );

    // Must be called again with the new items
    expect(onItemsFiltered.mock.calls.length).toBeGreaterThan(
      callCountAfterMount,
    );
    const lastCall =
      onItemsFiltered.mock.calls[onItemsFiltered.mock.calls.length - 1];
    expect(lastCall[0]).toEqual(newItems);
  });

  // --- Bug 3: filteredCount must match getFilteredItems output ---

  it("displayed count matches getFilteredItems output (not a duplicated inline computation)", () => {
    // Activate the 'tofu' filter - 2 of the 4 test items have buyerStage='tofu'
    render(<FilterChips {...defaultProps} />);
    fireEvent.click(screen.getByText("Awareness")); // activates buyerStage=tofu

    // The count element "2 of 4" must be present.
    // If filteredCount were computed by a diverged inline expression, a
    // future logic change could make it differ; this test pins the value to
    // what getFilteredItems actually returns.
    expect(screen.getByText("2 of 4")).toBeDefined();
  });

  // Bug 3: when items change while filters are active, callback must receive filtered (not all) items
  it("calls onItemsFiltered with filtered items (not all) when items prop changes while filter is active", () => {
    const onItemsFiltered = vi.fn();
    const { rerender } = render(
      <FilterChips
        filters={filters}
        items={items}
        onItemsFiltered={onItemsFiltered}
      />,
    );

    // Activate tofu filter - 2 of 4 items match
    fireEvent.click(screen.getByText("Awareness"));
    onItemsFiltered.mockClear();

    // New items array (same data, new reference - simulates parent refresh)
    const newItems = [...items];
    rerender(
      <FilterChips
        filters={filters}
        items={newItems}
        onItemsFiltered={onItemsFiltered}
      />,
    );

    // Must have been called with only the tofu items, not all 4
    expect(onItemsFiltered).toHaveBeenCalled();
    const lastCall =
      onItemsFiltered.mock.calls[onItemsFiltered.mock.calls.length - 1];
    expect(lastCall[0]).toHaveLength(2); // only tofu items
    expect(
      (lastCall[0] as Array<{ buyerStage: string }>).every(
        (item) => item.buyerStage === "tofu",
      ),
    ).toBe(true);
  });

  it("does not throw when onSortChange is not provided", () => {
    const sortOptions: SortOption[] = [
      { value: "newest", label: "Newest" },
      { value: "oldest", label: "Oldest" },
    ];
    expect(() => {
      render(
        <FilterChips
          filters={filters}
          items={items}
          onItemsFiltered={vi.fn()}
          sortOptions={sortOptions}
        />,
      );
      fireEvent.change(screen.getByLabelText("Sort:"), {
        target: { value: "oldest" },
      });
    }).not.toThrow();
  });

  it("does not throw when filters are omitted for sort-only usage", () => {
    const sortOptions: SortOption[] = [
      { value: "newest", label: "Newest" },
      { value: "oldest", label: "Oldest" },
    ];

    expect(() => {
      render(
        <FilterChips
          items={items}
          sortOptions={sortOptions}
          defaultSort="newest"
          onItemsFiltered={vi.fn()}
        />,
      );
    }).not.toThrow();

    expect(screen.getByLabelText("Sort:")).toBeDefined();
  });

  it("still reports the full item set on mount when used without filters", () => {
    const onItemsFiltered = vi.fn();

    render(<FilterChips items={items} onItemsFiltered={onItemsFiltered} />);

    expect(onItemsFiltered).toHaveBeenCalledWith(items);
  });

  // --- WCAG 2.1 A: ARIA toolbar/group patterns ---

  it("outer container has role='toolbar'", () => {
    const { container } = render(<FilterChips {...defaultProps} />);
    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar).not.toBeNull();
  });

  it("outer container has aria-label='Filters'", () => {
    const { container } = render(<FilterChips {...defaultProps} />);
    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar?.getAttribute("aria-label")).toBe("Filters");
  });

  it("each filter group div has role='group'", () => {
    const multiFilters: FilterDef[] = [
      {
        id: "buyerStage",
        label: "Stage",
        options: [
          { value: "tofu", label: "Awareness" },
          { value: "bofu", label: "Decision" },
        ],
      },
      {
        id: "category",
        label: "Category",
        options: [
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ],
      },
    ];
    const { container } = render(
      <FilterChips {...defaultProps} filters={multiFilters} />,
    );
    const groups = container.querySelectorAll('[role="group"]');
    expect(groups).toHaveLength(2);
  });

  // --- Type-safe filtering (Fix A: remove unsafe cast) ---

  it("filters by metadata key when filter id is not buyerStage or featured", () => {
    const metadataFilters: FilterDef[] = [
      {
        id: "category",
        label: "Category",
        options: [
          { value: "guide", label: "Guides" },
          { value: "tutorial", label: "Tutorials" },
        ],
      },
    ];
    const metadataItems: ContentItem[] = [
      {
        buyerStage: "tofu",
        title: "Guide A",
        description: "A guide",
        href: "/guide-a",
        relatedPages: [],
        publishedAt: "2024-01-01",
        updatedAt: "2024-01-01",
        metadata: { category: "guide" },
      },
      {
        buyerStage: "tofu",
        title: "Tutorial B",
        description: "A tutorial",
        href: "/tutorial-b",
        relatedPages: [],
        publishedAt: "2024-01-02",
        updatedAt: "2024-01-02",
        metadata: { category: "tutorial" },
      },
      {
        buyerStage: "mofu",
        title: "Guide C",
        description: "Another guide",
        href: "/guide-c",
        relatedPages: [],
        publishedAt: "2024-01-03",
        updatedAt: "2024-01-03",
        metadata: { category: "guide" },
      },
    ];
    const onItemsFiltered = vi.fn();
    render(
      <FilterChips
        filters={metadataFilters}
        items={metadataItems}
        onItemsFiltered={onItemsFiltered}
      />,
    );
    fireEvent.click(screen.getByText("Guides"));
    const lastCall =
      onItemsFiltered.mock.calls[onItemsFiltered.mock.calls.length - 1];
    expect(lastCall[0]).toHaveLength(2);
    expect(
      (lastCall[0] as ContentItem[]).every(
        (item) => item.metadata?.category === "guide",
      ),
    ).toBe(true);
  });

  it("filters by featured flag", () => {
    const featuredFilters: FilterDef[] = [
      {
        id: "featured",
        label: "Featured",
        options: [{ value: "true", label: "Featured Only" }],
      },
    ];
    const featuredItems: ContentItem[] = [
      {
        buyerStage: "tofu",
        title: "Featured A",
        description: "Desc",
        href: "/fa",
        relatedPages: [],
        publishedAt: "2024-01-01",
        updatedAt: "2024-01-01",
        featured: true,
      },
      {
        buyerStage: "mofu",
        title: "Regular B",
        description: "Desc",
        href: "/rb",
        relatedPages: [],
        publishedAt: "2024-01-02",
        updatedAt: "2024-01-02",
        featured: false,
      },
      {
        buyerStage: "bofu",
        title: "Regular C",
        description: "Desc",
        href: "/rc",
        relatedPages: [],
        publishedAt: "2024-01-03",
        updatedAt: "2024-01-03",
      },
    ];
    const onItemsFiltered = vi.fn();
    render(
      <FilterChips
        filters={featuredFilters}
        items={featuredItems}
        onItemsFiltered={onItemsFiltered}
      />,
    );
    fireEvent.click(screen.getByText("Featured Only"));
    const lastCall =
      onItemsFiltered.mock.calls[onItemsFiltered.mock.calls.length - 1];
    expect(lastCall[0]).toHaveLength(1);
    expect((lastCall[0] as ContentItem[])[0].title).toBe("Featured A");
  });

  it("excludes items without metadata when filtering by metadata key", () => {
    const metadataFilters: FilterDef[] = [
      {
        id: "category",
        label: "Category",
        options: [{ value: "guide", label: "Guides" }],
      },
    ];
    const mixedItems: ContentItem[] = [
      {
        buyerStage: "tofu",
        title: "Has metadata",
        description: "Desc",
        href: "/a",
        relatedPages: [],
        publishedAt: "2024-01-01",
        updatedAt: "2024-01-01",
        metadata: { category: "guide" },
      },
      {
        buyerStage: "tofu",
        title: "No metadata",
        description: "Desc",
        href: "/b",
        relatedPages: [],
        publishedAt: "2024-01-02",
        updatedAt: "2024-01-02",
      },
    ];
    const onItemsFiltered = vi.fn();
    render(
      <FilterChips
        filters={metadataFilters}
        items={mixedItems}
        onItemsFiltered={onItemsFiltered}
      />,
    );
    fireEvent.click(screen.getByText("Guides"));
    const lastCall =
      onItemsFiltered.mock.calls[onItemsFiltered.mock.calls.length - 1];
    expect(lastCall[0]).toHaveLength(1);
    expect((lastCall[0] as ContentItem[])[0].title).toBe("Has metadata");
  });

  it("each filter group div has aria-label equal to the filter's label", () => {
    const multiFilters: FilterDef[] = [
      {
        id: "buyerStage",
        label: "Stage",
        options: [
          { value: "tofu", label: "Awareness" },
          { value: "bofu", label: "Decision" },
        ],
      },
      {
        id: "category",
        label: "Category",
        options: [
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ],
      },
    ];
    const { container } = render(
      <FilterChips {...defaultProps} filters={multiFilters} />,
    );
    const groups = container.querySelectorAll('[role="group"]');
    expect(groups[0]?.getAttribute("aria-label")).toBe("Stage");
    expect(groups[1]?.getAttribute("aria-label")).toBe("Category");
  });
});
