import { useState, useEffect, useCallback, useRef } from "react";
import { sanitizeExcerpt } from "../lib/sanitize";
import { useFocusTrap } from "../lib/focus-trap";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { trackEvent } from "../lib/analytics";

interface SearchOverlayLabels {
  searching?: string;
  noResults?: string;
  emptyState?: string;
  errorMessage?: string;
}

const defaultSearchLabels: Required<SearchOverlayLabels> = {
  searching: "",
  noResults: "",
  emptyState: "",
  errorMessage: "Search failed. Please try again.",
};

interface SearchOverlayProps {
  siteName: string;
  placeholder?: string;
  labels?: SearchOverlayLabels;
  /** Maximum number of search results to display. Defaults to 8. */
  maxResults?: number;
  /** Override the pagefind loader - used in tests to inject a mock. */
  _loadPagefind?: () => Promise<PagefindUI | null>;
}

interface PagefindResult {
  url: string;
  meta: { title: string };
  excerpt: string;
}

interface PagefindUI {
  search: (
    query: string,
  ) => Promise<{ results: { data: () => Promise<PagefindResult> }[] }>;
  destroy?: () => void;
}

type SearchOpenSource = "button" | "keyboard";

function currentPagePath(): string {
  return window.location.pathname || "/";
}

function sanitizedResultPath(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname || "/";
  } catch {
    return url.split(/[?#]/, 1)[0];
  }
}

export async function loadPagefindModule(): Promise<PagefindUI | null> {
  try {
    // Use a variable path so tsc does not try to resolve the literal - pagefind is injected at build time
    const pagefindPath = "/pagefind/pagefind.js" as string;
    return (await import(/* @vite-ignore */ pagefindPath)) as PagefindUI;
  } catch {
    // Pagefind not available (dev mode or not yet built)
    return null;
  }
}

export function SearchOverlay({
  siteName,
  placeholder = "Search...",
  labels: labelsProp,
  maxResults = 8,
  _loadPagefind = loadPagefindModule,
}: SearchOverlayProps) {
  const labels = { ...defaultSearchLabels, ...labelsProp };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PagefindResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pagefindReady, setPagefindReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pagefindRef = useRef<PagefindUI | null>(null);
  const resultRefsRef = useRef<(HTMLLIElement | null)[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
  }, []);

  const openSearch = useCallback(
    (source: SearchOpenSource) => {
      if (!open) {
        trackEvent("search_opened", {
          page_path: currentPagePath(),
          source,
        });
      }
      setOpen(true);
    },
    [open],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          close();
        } else {
          openSearch("keyboard");
        }
      }
      if (e.key === "Escape" && open) {
        close();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, close, openSearch]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    async function loadPagefind() {
      if (pagefindRef.current) return;
      const pf = await _loadPagefind();
      if (pf) {
        pagefindRef.current = pf;
        setPagefindReady(true);
      }
    }
    loadPagefind();
  }, [open, _loadPagefind]);

  useEffect(() => {
    return () => {
      pagefindRef.current?.destroy?.();
      pagefindRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!query.trim() || !pagefindRef.current) {
      setResults([]);
      setActiveIndex(-1);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSearchError(false);

    async function doSearch() {
      const pf = pagefindRef.current;
      const queryLength = query.trim().length;

      try {
        const search = await pf!.search(query);
        const effectiveMaxResults = Math.max(1, maxResults);
        const settled = await Promise.allSettled(
          search.results.slice(0, effectiveMaxResults).map((r) => r.data()),
        );
        const data = settled
          .filter(
            (r): r is PromiseFulfilledResult<PagefindResult> =>
              r.status === "fulfilled",
          )
          .map((r) => r.value);
        const hasRejections = settled.some((r) => r.status === "rejected");
        if (!cancelled) {
          setResults(data);
          setSearchError(hasRejections && data.length === 0);
          setActiveIndex(-1);
          setLoading(false);
          if (hasRejections && data.length === 0) {
            trackEvent("search_failed", {
              failure_type: "result_load",
              page_path: currentPagePath(),
              query_length: queryLength,
            });
          } else {
            trackEvent("search_performed", {
              page_path: currentPagePath(),
              query_length: queryLength,
              result_count: data.length,
            });
            if (data.length === 0) {
              trackEvent("search_no_results", {
                page_path: currentPagePath(),
                query_length: queryLength,
              });
            }
          }
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setSearchError(true);
          setLoading(false);
          trackEvent("search_failed", {
            failure_type: "search",
            page_path: currentPagePath(),
            query_length: queryLength,
          });
        }
      }
    }

    const timer = setTimeout(doSearch, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, maxResults, pagefindReady]);

  const handleResultKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (results.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev < results.length - 1 ? prev + 1 : 0;
          resultRefsRef.current[next]?.focus();
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev > 0 ? prev - 1 : results.length - 1;
          resultRefsRef.current[next]?.focus();
          return next;
        });
      }
    },
    [results],
  );

  const selectResult = useCallback(
    (result: PagefindResult, index: number) => {
      trackEvent("search_result_clicked", {
        page_path: currentPagePath(),
        query_length: query.trim().length,
        result_index: index,
        result_path: sanitizedResultPath(result.url),
      });
      window.location.href = result.url;
      close();
    },
    [close, query],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => openSearch("button")}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] p-2 text-[var(--color-neutral-500)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-700)]"
        aria-label={`Search ${siteName}`}
        title="Search (Ctrl+K)"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center sm:pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "var(--surface-overlay)",
        }}
        onClick={close}
        aria-hidden="true"
      />

      {/* Search panel - full-screen on mobile, floating panel on sm+ */}
      <div
        ref={dialogRef}
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden border-0 sm:mx-4 sm:h-auto sm:max-w-lg sm:rounded-[var(--radius-lg)] sm:border"
        style={{
          backgroundColor: "var(--surface-primary)",
          borderColor: "var(--color-neutral-200)",
          boxShadow: "var(--shadow-ambient)",
        }}
        onKeyDown={handleResultKeyDown}
      >
        <div
          className="flex min-h-[44px] items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--color-neutral-200)" }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-[var(--color-neutral-400)]"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="min-h-11 flex-1 bg-transparent outline-none"
            style={{
              color: "var(--color-brand-text)",
              fontSize: "16px",
            }}
            role="combobox"
            aria-label="Search query"
            aria-expanded={results.length > 0}
            aria-haspopup="listbox"
            aria-controls={results.length > 0 ? "search-results" : undefined}
            aria-activedescendant={
              activeIndex >= 0 ? `search-result-${activeIndex}` : undefined
            }
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close search"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] text-[var(--color-neutral-500)] transition-colors hover:bg-[var(--color-neutral-100)] sm:hidden"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <kbd
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[length:var(--text-caption)] rounded-[var(--radius-sm)] border"
            style={{
              color: "var(--color-neutral-400)",
              borderColor: "var(--color-neutral-200)",
              backgroundColor: "var(--surface-secondary)",
            }}
          >
            Esc
          </kbd>
        </div>

        <div className="flex-1 overflow-y-auto sm:max-h-80 sm:flex-none">
          {loading && labels.searching && (
            <div
              className="px-4 py-8 text-center text-[length:var(--text-caption)]"
              style={{ color: "var(--color-neutral-400)" }}
            >
              {labels.searching}
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && searchError && (
            <div
              className="px-4 py-8 text-center text-[length:var(--text-caption)]"
              style={{ color: "var(--color-neutral-400)" }}
            >
              {labels.errorMessage}
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && !searchError && (
            <div
              className="px-4 py-8 text-center text-[length:var(--text-caption)]"
              style={{ color: "var(--color-neutral-400)" }}
              data-ph-mask="true"
            >
              {labels.noResults ? `${labels.noResults} ` : ""}&ldquo;{query}
              &rdquo;
            </div>
          )}

          {!loading && results.length > 0 && (
            <ul id="search-results" role="listbox" className="py-2">
              {results.map((result, index) => (
                <li
                  key={result.url}
                  id={`search-result-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={index === activeIndex ? 0 : -1}
                  data-href={sanitizedResultPath(result.url)}
                  ref={(el) => {
                    resultRefsRef.current[index] = el;
                  }}
                  className={`block min-h-[44px] px-4 py-3 transition-colors cursor-pointer ${index === activeIndex ? "bg-[var(--color-neutral-100)]" : "hover:bg-[var(--color-neutral-50)]"}`}
                  onClick={() => selectResult(result, index)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" ||
                      e.key === " " ||
                      e.key === "Space" ||
                      e.key === "Spacebar" ||
                      e.key === "Unidentified" ||
                      !e.key ||
                      e.code === "Space"
                    ) {
                      e.preventDefault();
                      selectResult(result, index);
                    }
                  }}
                >
                  <p
                    className="text-[length:var(--text-caption)] font-medium"
                    style={{ color: "var(--color-brand-text)" }}
                  >
                    {result.meta.title}
                  </p>
                  {result.excerpt && (
                    <p
                      className="mt-1 line-clamp-2"
                      style={{
                        color: "var(--color-neutral-500)",
                        fontSize: "var(--text-caption)",
                      }}
                      dangerouslySetInnerHTML={{
                        __html: sanitizeExcerpt(result.excerpt),
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {!loading && !query.trim() && labels.emptyState && (
            <div
              className="px-4 py-8 text-center text-[length:var(--text-caption)]"
              style={{ color: "var(--color-neutral-400)" }}
            >
              {labels.emptyState} {siteName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
