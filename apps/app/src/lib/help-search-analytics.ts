import { trackDashboardEvent } from "@/lib/analytics";

export interface HelpSearchHandlers {
  onOpen: () => void;
  onSearch: (opts: { result_count: number; has_results: boolean }) => void;
  onResultClick: (opts: { result_position: number }) => void;
  onFailed: (opts: { failure_type: string }) => void;
}

/**
 * Returns instrumentation handlers for the help search surface.
 * Emits canonical search_* events. Never receives or forwards query text.
 */
export function makeHelpSearchHandlers(): HelpSearchHandlers {
  function onOpen(): void {
    trackDashboardEvent("search_opened", { source: "help" });
  }

  function onSearch(opts: {
    result_count: number;
    has_results: boolean;
  }): void {
    trackDashboardEvent("search_performed", {
      source: "help",
      result_count: opts.result_count,
      has_results: opts.has_results,
    });
    if (!opts.has_results) {
      trackDashboardEvent("search_no_results", { source: "help" });
    }
  }

  function onResultClick(opts: { result_position: number }): void {
    trackDashboardEvent("search_result_clicked", {
      source: "help",
      result_position: opts.result_position,
    });
  }

  function onFailed(opts: { failure_type: string }): void {
    trackDashboardEvent("search_failed", {
      source: "help",
      failure_type: opts.failure_type,
    });
  }

  return { onOpen, onSearch, onResultClick, onFailed };
}
