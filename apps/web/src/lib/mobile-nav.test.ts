import { describe, expect, it, beforeEach } from "vitest";
import { initMobileNav } from "./mobile-nav";
import { _resetScrollLock } from "./scroll-lock";

function buildMobileNav() {
  const details = document.createElement("div");
  details.id = "mobile-nav-details";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.dataset.mobileNavTrigger = "";
  trigger.setAttribute("aria-label", "Toggle navigation menu");
  trigger.setAttribute("aria-controls", "mobile-nav-panel");
  details.appendChild(trigger);

  const overlay = document.createElement("div");
  overlay.dataset.mobileNavOverlay = "";
  overlay.hidden = true;
  details.appendChild(overlay);

  const backdrop = document.createElement("div");
  backdrop.setAttribute("data-mobile-nav-backdrop", "");
  overlay.appendChild(backdrop);

  const panel = document.createElement("div");
  overlay.appendChild(panel);

  const nav = document.createElement("nav");
  nav.id = "mobile-nav-panel";
  nav.setAttribute("aria-label", "Mobile navigation");
  panel.appendChild(nav);

  const firstLink = document.createElement("a");
  firstLink.href ="/first";
  firstLink.textContent = "First";
  firstLink.addEventListener("click", (event) => event.preventDefault());
  nav.appendChild(firstLink);

  const secondLink = document.createElement("a");
  secondLink.href ="/second";
  secondLink.textContent = "Second";
  secondLink.addEventListener("click", (event) => event.preventDefault());
  nav.appendChild(secondLink);

  const ctaLink = document.createElement("a");
  ctaLink.href ="/signup";
  ctaLink.textContent = "Start free trial";
  ctaLink.addEventListener("click", (event) => event.preventDefault());
  const ctaSection = document.createElement("div");
  ctaSection.appendChild(ctaLink);
  nav.appendChild(ctaSection);

  document.body.appendChild(details);

  return {
    details,
    trigger,
    overlay,
    backdrop,
    firstLink,
    secondLink,
    ctaLink,
  };
}

function pressTab(shiftKey = false) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("initMobileNav", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.style.overflow = "";
    delete document.documentElement.dataset.mobileNavOpen;
    _resetScrollLock();
  });

  it("syncs aria-expanded with the current details state", () => {
    const { details, trigger } = buildMobileNav();

    initMobileNav(details);

    expect(details.dataset.mobileNavReady).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    trigger.click();

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.documentElement.dataset.mobileNavOpen).toBe("true");
  });

  it("shows and hides the overlay as the nav opens and closes", () => {
    const { details, overlay, trigger } = buildMobileNav();

    initMobileNav(details);

    expect(overlay.hidden).toBe(true);

    trigger.click();
    expect(overlay.hidden).toBe(false);

    trigger.click();
    expect(overlay.hidden).toBe(true);
  });

  it("wraps Tab focus from the last focusable element back to the first", () => {
    const { details, ctaLink, firstLink, trigger } = buildMobileNav();

    initMobileNav(details);
    trigger.click();
    ctaLink.focus();

    pressTab();

    expect(document.activeElement).toBe(firstLink);
  });

  it("wraps Shift+Tab focus from the first focusable element to the last", () => {
    const { details, ctaLink, firstLink, trigger } = buildMobileNav();

    initMobileNav(details);
    trigger.click();
    firstLink.focus();

    pressTab(true);

    expect(document.activeElement).toBe(ctaLink);
  });

  it("moves focus into the first drawer link when the nav opens", () => {
    const { details, firstLink, trigger } = buildMobileNav();

    initMobileNav(details);
    trigger.click();

    expect(document.activeElement).toBe(firstLink);
  });

  it("returns focus to the trigger when the nav closes", () => {
    const { backdrop, details, secondLink, trigger } = buildMobileNav();

    initMobileNav(details);
    trigger.click();
    secondLink.focus();

    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("falls back to the mobile CTA when the nav opens without primary links", () => {
    const { ctaLink, details, trigger } = buildMobileNav();

    details
      .querySelectorAll("nav[aria-label='Mobile navigation'] > a")
      .forEach((link) => {
        link.remove();
      });

    initMobileNav(details);
    trigger.click();

    expect(document.activeElement).toBe(ctaLink);
  });

  it("keeps focus trapped when the nav opens without primary links", () => {
    const { ctaLink, details, trigger } = buildMobileNav();

    details
      .querySelectorAll("nav[aria-label='Mobile navigation'] > a")
      .forEach((link) => {
        link.remove();
      });

    initMobileNav(details);
    trigger.click();

    expect(document.activeElement).toBe(ctaLink);

    pressTab();
    expect(document.activeElement).toBe(ctaLink);
  });

  it("falls back to the trigger when the nav opens without any actions", () => {
    const { details, trigger } = buildMobileNav();

    details
      .querySelectorAll("nav[aria-label='Mobile navigation'] a")
      .forEach((link) => link.remove());

    initMobileNav(details);
    trigger.click();

    expect(document.activeElement).toBe(trigger);
  });

  it("falls back to the trigger when the mobile nav panel is missing", () => {
    const details = document.createElement("div");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.dataset.mobileNavTrigger = "";
    details.appendChild(trigger);

    const overlay = document.createElement("div");
    overlay.dataset.mobileNavOverlay = "";
    overlay.hidden = true;
    const backdrop = document.createElement("div");
    backdrop.dataset.mobileNavBackdrop = "";
    overlay.appendChild(backdrop);
    details.appendChild(overlay);
    document.body.appendChild(details);

    initMobileNav(details);
    trigger.click();

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(trigger);
    expect(() => pressTab()).not.toThrow();
  });

  it("closes the nav when Escape is pressed", () => {
    const { details, trigger } = buildMobileNav();

    initMobileNav(details);
    trigger.click();

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("locks body scroll while the nav is open and restores it on close", () => {
    const { backdrop, details, trigger } = buildMobileNav();
    document.body.style.overflow = "auto";

    initMobileNav(details);
    trigger.click();

    expect(document.body.style.overflow).toBe("hidden");

    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.body.style.overflow).toBe("auto");
  });

  it("releases any active scroll lock during cleanup", () => {
    const { details, trigger } = buildMobileNav();
    document.body.style.overflow = "scroll";

    const cleanup = initMobileNav(details);
    trigger.click();
    expect(document.body.style.overflow).toBe("hidden");

    cleanup();

    expect(document.body.style.overflow).toBe("scroll");
    expect(document.documentElement.dataset.mobileNavOpen).toBeUndefined();
  });

  it("closes the nav when a mobile nav link is clicked", () => {
    const { details, firstLink, trigger } = buildMobileNav();

    initMobileNav(details);
    trigger.click();
    firstLink.focus();

    firstLink.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the nav when the mobile CTA is clicked", () => {
    const { ctaLink, details, trigger } = buildMobileNav();

    initMobileNav(details);
    trigger.click();
    ctaLink.focus();

    ctaLink.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("does nothing on Tab when the open nav has no focusable elements", () => {
    const details = document.createElement("div");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.dataset.mobileNavTrigger = "";
    details.appendChild(trigger);
    const overlay = document.createElement("div");
    overlay.dataset.mobileNavOverlay = "";
    overlay.hidden = true;
    const nav = document.createElement("nav");
    nav.id = "mobile-nav-panel";
    nav.setAttribute("aria-label", "Mobile navigation");
    overlay.appendChild(nav);
    details.appendChild(overlay);
    document.body.appendChild(details);

    initMobileNav(details);
    trigger.click();

    expect(() => pressTab()).not.toThrow();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
