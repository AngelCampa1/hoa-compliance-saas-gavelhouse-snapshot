let lockCount = 0;
let savedOverflow = "";
let navigationListenerInstalled = false;

function resetOnNavigation(): void {
  if (lockCount > 0) {
    document.body.style.overflow = savedOverflow;
  }
  lockCount = 0;
  savedOverflow = "";
}

function ensureNavigationListener(): void {
  if (navigationListenerInstalled || typeof document === "undefined") return;
  navigationListenerInstalled = true;
  // Astro view transitions fire astro:before-swap before swapping the DOM.
  // Reset scroll lock so the new page starts unlocked.
  document.addEventListener("astro:before-swap", resetOnNavigation);
}

export function lockScroll(): void {
  ensureNavigationListener();
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount++;
}

export function unlockScroll(): void {
  lockCount--;
  if (lockCount <= 0) {
    lockCount = 0;
    document.body.style.overflow = savedOverflow;
  }
}

/** For tests: reset internal state. */
export function _resetScrollLock(): void {
  lockCount = 0;
  savedOverflow = "";
  navigationListenerInstalled = false;
}
