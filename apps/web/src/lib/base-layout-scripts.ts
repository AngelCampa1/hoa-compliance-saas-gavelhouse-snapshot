export const ROOT_JS_CLASS_NAME = "js";
export const SCROLL_REVEAL_TIMEOUT_MS = 1200;
export const CHUNK_RELOAD_SESSION_KEY = "__chunk_reload";

const CHUNK_ERROR_PATTERNS = [
  /dynamically imported module|Importing a module script failed/i,
  /(?:jsxDEV|jsx|jsxs) is not a function/i,
];

export function buildDocumentBootstrapScript(
  rootJsClassName = ROOT_JS_CLASS_NAME,
): string {
  return `(function() {
  document.documentElement.classList.add(${JSON.stringify(rootJsClassName)});
})();`;
}

export function buildScrollRevealScript(
  timeoutMs = SCROLL_REVEAL_TIMEOUT_MS,
): string {
  return `(function() {
  var elements = Array.prototype.slice.call(document.querySelectorAll(".scroll-in"));
  if (elements.length === 0) return;

  function revealAll() {
    elements.forEach(function(element) {
      element.classList.add("visible");
    });
  }

  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    typeof IntersectionObserver === "undefined"
  ) {
    revealAll();
    return;
  }

  var hasIntersected = false;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      hasIntersected = true;
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  elements.forEach(function(element) {
    observer.observe(element);
  });

  window.setTimeout(function() {
    if (hasIntersected) return;
    revealAll();
    observer.disconnect();
  }, ${timeoutMs});
})();`;
}

export function shouldRecoverFromChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function buildChunkRecoveryScript(
  sessionKey = CHUNK_RELOAD_SESSION_KEY,
): string {
  const serializedPatterns = JSON.stringify(
    CHUNK_ERROR_PATTERNS.map((pattern) => ({
      flags: pattern.flags,
      source: pattern.source,
    })),
  );

  return `(function() {
  var key = ${JSON.stringify(sessionKey)};
  var patterns = ${serializedPatterns}.map(function(pattern) {
    return new RegExp(pattern.source, pattern.flags);
  });

  function safeGet(k) { try { return sessionStorage.getItem(k); } catch(e) { return null; } }
  function safeSet(k, v) { try { sessionStorage.setItem(k, v); } catch(e) {} }
  function safeRemove(k) { try { sessionStorage.removeItem(k); } catch(e) {} }

  function shouldRecover(error) {
    var message = error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error == null ? "" : error);
    return patterns.some(function(pattern) {
      return pattern.test(message);
    });
  }

  function triggerReload() {
    if (safeGet(key)) return;
    safeSet(key, "1");
    window.location.reload();
  }

  window.addEventListener("unhandledrejection", function(event) {
    var reason = event && "reason" in event ? event.reason : event;
    if (!shouldRecover(reason)) return;
    event.preventDefault();
    triggerReload();
  });

  window.addEventListener("error", function(event) {
    var error = event && "error" in event && event.error ? event.error : event && "message" in event ? event.message : event;
    if (!shouldRecover(error)) return;
    event.preventDefault();
    triggerReload();
  });

  window.setTimeout(function() {
    safeRemove(key);
  }, 5000);
})();`;
}
