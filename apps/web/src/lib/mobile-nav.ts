import { isElementVisible } from "./focus-trap";
import { lockScroll, unlockScroll } from "./scroll-lock";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="switch"], [role="option"]';

type Cleanup = () => void;

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-disabled") !== "true" &&
      isElementVisible(el),
  );
}

function focusTrigger(trigger: HTMLElement | null): void {
  trigger?.focus({ preventScroll: true });
}

function focusInitialOpenTarget(
  primaryNavLinks: HTMLAnchorElement[],
  actionLinks: HTMLAnchorElement[],
  trigger: HTMLElement | null,
): void {
  const firstVisibleNavLink = primaryNavLinks.find((link) =>
    isElementVisible(link),
  );

  if (firstVisibleNavLink) {
    firstVisibleNavLink.focus({ preventScroll: true });
    return;
  }

  const firstVisibleActionLink = actionLinks.find((link) =>
    isElementVisible(link),
  );

  if (firstVisibleActionLink) {
    firstVisibleActionLink.focus({ preventScroll: true });
    return;
  }

  focusTrigger(trigger);
}

export function initMobileNav(details: HTMLElement): Cleanup {
  details.dataset.mobileNavReady = "true";

  const trigger = details.querySelector(
    "[data-mobile-nav-trigger]",
  ) as HTMLButtonElement | null;
  const overlay = details.querySelector(
    "[data-mobile-nav-overlay]",
  ) as HTMLDivElement | null;
  const backdrop = details.querySelector(
    "[data-mobile-nav-backdrop]",
  ) as HTMLDivElement | null;
  const mobileNav = details.querySelector(
    '[aria-label="Mobile navigation"]',
  ) as HTMLElement | null;
  const primaryNavLinks = Array.from(
    mobileNav?.querySelectorAll<HTMLAnchorElement>(":scope > a") ?? [],
  );
  const actionLinks = Array.from(
    mobileNav?.querySelectorAll<HTMLAnchorElement>("a") ?? [],
  );

  let isScrollLocked = false;
  let isOpen = false;

  const syncExpandedState = () => {
    trigger?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    overlay?.toggleAttribute("hidden", !isOpen);
    details.classList.toggle("mobile-nav-open", isOpen);
    document.documentElement.dataset.mobileNavOpen = isOpen ? "true" : "false";

    if (isOpen && !isScrollLocked) {
      lockScroll();
      isScrollLocked = true;
      focusInitialOpenTarget(primaryNavLinks, actionLinks, trigger);
    } else if (!isOpen && isScrollLocked) {
      unlockScroll();
      isScrollLocked = false;
    }
  };

  const closeMobileNav = () => {
    isOpen = false;
    syncExpandedState();
    focusTrigger(trigger);
  };

  const openMobileNav = () => {
    isOpen = true;
    syncExpandedState();
  };

  const toggleMobileNav = () => {
    if (isOpen) {
      closeMobileNav();
      return;
    }
    openMobileNav();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || !isOpen) {
      return;
    }

    const focusable = mobileNav ? getFocusableElements(mobileNav) : [];
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMobileNav();
    }
  };

  const handleBackdropPress = () => {
    closeMobileNav();
  };

  const handleLinkClick = () => {
    closeMobileNav();
  };

  trigger?.addEventListener("click", toggleMobileNav);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keydown", handleEscapeKey);
  backdrop?.addEventListener("click", handleBackdropPress);
  actionLinks.forEach((link) => {
    link.addEventListener("click", handleLinkClick);
  });

  syncExpandedState();

  return () => {
    trigger?.removeEventListener("click", toggleMobileNav);
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("keydown", handleEscapeKey);
    backdrop?.removeEventListener("click", handleBackdropPress);
    actionLinks.forEach((link) => {
      link.removeEventListener("click", handleLinkClick);
    });
    if (isScrollLocked) {
      unlockScroll();
      isScrollLocked = false;
    }
    delete document.documentElement.dataset.mobileNavOpen;
  };
}
