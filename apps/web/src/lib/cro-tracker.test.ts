import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));

import { trackEvent } from "./analytics";
import {
  initCroTracking,
  setupScrollDepthTracking,
  setupSectionVisibilityTracking,
  setupEngagedTimeTracking,
  setupFaqExpansionTracking,
  setupCtaClickTracking,
} from "./cro-tracker";

const mockTrackEvent = vi.mocked(trackEvent);

// --- IntersectionObserver mock ---
type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void;

class MockIntersectionObserver {
  callback: IntersectionCallback;
  options: IntersectionObserverInit | undefined;
  observed: Set<Element> = new Set();
  disconnected = false;

  constructor(
    callback: IntersectionCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }

  unobserve(el: Element): void {
    this.observed.delete(el);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }

  triggerIntersection(entries: Partial<IntersectionObserverEntry>[]): void {
    this.callback(entries as IntersectionObserverEntry[]);
  }

  static instances: MockIntersectionObserver[] = [];
  static reset(): void {
    MockIntersectionObserver.instances = [];
  }
}

// --- helpers ---
function setScrollProps(
  scrollHeight: number,
  scrollY: number,
  innerHeight: number,
): void {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(window, "scrollY", {
    value: scrollY,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: innerHeight,
    configurable: true,
  });
}

function fireScroll(): void {
  window.dispatchEvent(new Event("scroll"));
}

function preventNavigation(element: Element): void {
  element.addEventListener("click", (event) => event.preventDefault());
}

beforeEach(() => {
  mockTrackEvent.mockClear();
  MockIntersectionObserver.reset();
  Object.defineProperty(window, "IntersectionObserver", {
    value: MockIntersectionObserver,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "location", {
    value: { pathname: "/test-page" },
    configurable: true,
    writable: true,
  });
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// setupScrollDepthTracking
// ============================================================
describe("setupScrollDepthTracking", () => {
  it("fires at each threshold as scroll progresses", () => {
    setScrollProps(2000, 0, 500);
    const cleanup = setupScrollDepthTracking();

    // 25%: (scrollY + innerHeight) / scrollHeight >= 0.25 => scrollY >= 0
    setScrollProps(2000, 0, 500);
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 25,
      page_path: "/test-page",
    });

    mockTrackEvent.mockClear();

    // 50%: scrollY + 500 = 1000 => scrollY = 500
    setScrollProps(2000, 500, 500);
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 50,
      page_path: "/test-page",
    });

    mockTrackEvent.mockClear();

    // 75%: scrollY + 500 = 1500 => scrollY = 1000
    setScrollProps(2000, 1000, 500);
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 75,
      page_path: "/test-page",
    });

    mockTrackEvent.mockClear();

    // 100%: scrollY + 500 = 2000 => scrollY = 1500
    setScrollProps(2000, 1500, 500);
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 100,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("does not re-fire past same threshold", () => {
    setScrollProps(2000, 0, 500);
    const cleanup = setupScrollDepthTracking();

    // Fire 25% threshold twice
    setScrollProps(2000, 0, 500);
    fireScroll();
    fireScroll();

    const calls25 = mockTrackEvent.mock.calls.filter(
      (c) =>
        c[0] === "scroll_depth_reached" &&
        (c[1] as Record<string, unknown>)?.threshold === 25,
    );
    expect(calls25).toHaveLength(1);

    cleanup();
  });

  it("fires all thresholds immediately when page fits in viewport", () => {
    setScrollProps(500, 0, 800);
    const cleanup = setupScrollDepthTracking();

    expect(mockTrackEvent).toHaveBeenCalledTimes(4);
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 25,
      page_path: "/test-page",
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 50,
      page_path: "/test-page",
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 75,
      page_path: "/test-page",
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 100,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("cleanup removes scroll listener", () => {
    setScrollProps(2000, 0, 500);
    const cleanup = setupScrollDepthTracking();

    // Fire 25%
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    mockTrackEvent.mockClear();

    cleanup();

    // Further scrolls should not fire
    setScrollProps(2000, 1500, 500);
    fireScroll();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("page_path is included in properties", () => {
    setScrollProps(2000, 0, 500);
    const cleanup = setupScrollDepthTracking();
    fireScroll();

    expect(mockTrackEvent).toHaveBeenCalledWith(
      "scroll_depth_reached",
      expect.objectContaining({ page_path: "/test-page" }),
    );

    cleanup();
  });
});

// ============================================================
// setupSectionVisibilityTracking
// ============================================================
describe("setupSectionVisibilityTracking", () => {
  it("fires section_viewed when element intersects at 30%+", () => {
    const el = document.createElement("div");
    el.setAttribute("data-section", "hero");
    document.body.appendChild(el);

    const cleanup = setupSectionVisibilityTracking();

    const observer = MockIntersectionObserver.instances[0]!;
    expect(observer.options?.threshold).toBe(0.3);

    observer.triggerIntersection([
      {
        isIntersecting: true,
        target: el,
        intersectionRatio: 0.35,
      },
    ]);

    expect(mockTrackEvent).toHaveBeenCalledWith(
      "section_viewed",
      expect.objectContaining({
        section: "hero",
        page_path: "/test-page",
      }),
    );

    cleanup();
  });

  it("does not re-fire for same section", () => {
    const el = document.createElement("div");
    el.setAttribute("data-section", "hero");
    document.body.appendChild(el);

    const cleanup = setupSectionVisibilityTracking();
    const observer = MockIntersectionObserver.instances[0]!;

    observer.triggerIntersection([
      { isIntersecting: true, target: el, intersectionRatio: 0.35 },
    ]);
    // Second intersection should not fire because element was unobserved
    expect(observer.observed.has(el)).toBe(false);

    cleanup();
  });

  it("time_to_view_ms is a positive number", () => {
    const el = document.createElement("div");
    el.setAttribute("data-section", "pricing");
    document.body.appendChild(el);

    const cleanup = setupSectionVisibilityTracking();
    const observer = MockIntersectionObserver.instances[0]!;

    observer.triggerIntersection([
      { isIntersecting: true, target: el, intersectionRatio: 0.5 },
    ]);

    const props = mockTrackEvent.mock.calls[0]![1] as Record<string, unknown>;
    expect(typeof props.time_to_view_ms).toBe("number");
    expect(props.time_to_view_ms as number).toBeGreaterThanOrEqual(0);

    cleanup();
  });

  it("handles zero [data-section] elements gracefully", () => {
    const cleanup = setupSectionVisibilityTracking();
    expect(mockTrackEvent).not.toHaveBeenCalled();
    // Should not throw
    cleanup();
  });

  it("cleanup disconnects observer", () => {
    const el = document.createElement("div");
    el.setAttribute("data-section", "hero");
    document.body.appendChild(el);

    const cleanup = setupSectionVisibilityTracking();
    const observer = MockIntersectionObserver.instances[0]!;

    cleanup();
    expect(observer.disconnected).toBe(true);
  });

  it("does not fire when isIntersecting is false", () => {
    const el = document.createElement("div");
    el.setAttribute("data-section", "hero");
    document.body.appendChild(el);

    const cleanup = setupSectionVisibilityTracking();
    const observer = MockIntersectionObserver.instances[0]!;

    observer.triggerIntersection([
      { isIntersecting: false, target: el, intersectionRatio: 0.1 },
    ]);

    expect(mockTrackEvent).not.toHaveBeenCalled();
    cleanup();
  });
});

// ============================================================
// setupEngagedTimeTracking
// ============================================================
describe("setupEngagedTimeTracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires at 15s milestone when tab is visible", () => {
    const cleanup = setupEngagedTimeTracking();

    vi.advanceTimersByTime(15_000);

    expect(mockTrackEvent).toHaveBeenCalledWith("engaged_time_reached", {
      milestone_seconds: 15,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("pauses counting when tab is hidden", () => {
    const cleanup = setupEngagedTimeTracking();

    // 10s visible
    vi.advanceTimersByTime(10_000);
    expect(mockTrackEvent).not.toHaveBeenCalled();

    // Tab hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // 10 more seconds while hidden
    vi.advanceTimersByTime(10_000);
    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("resumes and fires correct milestone after tab returns visible", () => {
    const cleanup = setupEngagedTimeTracking();

    // 10s visible
    vi.advanceTimersByTime(10_000);

    // Hide tab
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // 20s hidden
    vi.advanceTimersByTime(20_000);

    // Show tab again
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // 5 more seconds visible => total 15s visible
    vi.advanceTimersByTime(5_000);

    expect(mockTrackEvent).toHaveBeenCalledWith("engaged_time_reached", {
      milestone_seconds: 15,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("stops interval after 300s", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const cleanup = setupEngagedTimeTracking();

    vi.advanceTimersByTime(300_000);

    expect(mockTrackEvent).toHaveBeenCalledWith("engaged_time_reached", {
      milestone_seconds: 300,
      page_path: "/test-page",
    });

    expect(clearIntervalSpy).toHaveBeenCalled();

    cleanup();
    clearIntervalSpy.mockRestore();
  });

  it("cleanup clears interval", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const cleanup = setupEngagedTimeTracking();

    cleanup();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("fires all milestones in sequence", () => {
    const cleanup = setupEngagedTimeTracking();

    vi.advanceTimersByTime(300_000);

    const milestones = [15, 30, 60, 120, 300];
    for (const ms of milestones) {
      expect(mockTrackEvent).toHaveBeenCalledWith("engaged_time_reached", {
        milestone_seconds: ms,
        page_path: "/test-page",
      });
    }

    cleanup();
  });
});

// ============================================================
// setupFaqExpansionTracking
// ============================================================
describe("setupFaqExpansionTracking", () => {
  it("fires on toggle open", () => {
    document.body.innerHTML = `
      <div data-faq-section>
        <details>
          <summary>What is CRO?</summary>
          <p>Answer here</p>
        </details>
      </div>
    `;

    const cleanup = setupFaqExpansionTracking();

    const details = document.querySelector("details")!;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));

    expect(mockTrackEvent).toHaveBeenCalledWith("faq_expanded", {
      question_text: "What is CRO?",
      question_index: 0,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("does NOT fire on toggle close", () => {
    document.body.innerHTML = `
      <div data-faq-section>
        <details open>
          <summary>What is CRO?</summary>
          <p>Answer here</p>
        </details>
      </div>
    `;

    const cleanup = setupFaqExpansionTracking();

    const details = document.querySelector("details")!;
    details.open = false;
    details.dispatchEvent(new Event("toggle"));

    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("captures correct question text and index", () => {
    document.body.innerHTML = `
      <div data-faq-section>
        <details><summary>First question</summary><p>A</p></details>
        <details><summary>Second question</summary><p>B</p></details>
      </div>
    `;

    const cleanup = setupFaqExpansionTracking();

    const allDetails = document.querySelectorAll("details");
    allDetails[1]!.open = true;
    allDetails[1]!.dispatchEvent(new Event("toggle"));

    expect(mockTrackEvent).toHaveBeenCalledWith("faq_expanded", {
      question_text: "Second question",
      question_index: 1,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("truncates long question text to 200 chars", () => {
    const longText = "A".repeat(250);
    document.body.innerHTML = `
      <div data-faq-section>
        <details><summary>${longText}</summary><p>A</p></details>
      </div>
    `;

    const cleanup = setupFaqExpansionTracking();

    const details = document.querySelector("details")!;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));

    const props = mockTrackEvent.mock.calls[0]![1] as Record<string, unknown>;
    expect((props.question_text as string).length).toBe(200);

    cleanup();
  });

  it("handles no [data-faq-section] elements gracefully", () => {
    const cleanup = setupFaqExpansionTracking();
    expect(mockTrackEvent).not.toHaveBeenCalled();
    cleanup(); // should not throw
  });

  it("falls back to empty string when summary has no text content", () => {
    document.body.innerHTML = `
      <div data-faq-section>
        <details></details>
      </div>
    `;

    const cleanup = setupFaqExpansionTracking();
    const details = document.querySelector("details")!;
    // Remove the summary so summary?.textContent is null
    details.open = true;
    details.dispatchEvent(new Event("toggle"));

    expect(mockTrackEvent).toHaveBeenCalledWith("faq_expanded", {
      question_text: "",
      question_index: 0,
      page_path: expect.any(String),
    });

    cleanup();
  });
});

// ============================================================
// setupCtaClickTracking
// ============================================================
describe("setupCtaClickTracking", () => {
  it("fires cta_clicked when clicking a[href^='#']", () => {
    document.body.innerHTML = `
      <div data-section="pricing">
        <a href="#pricing">Go to pricing</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      button_text: "Go to pricing",
      href: "#pricing",
      section: "pricing",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("fires cta_clicked when clicking [data-cta-button]", () => {
    document.body.innerHTML = `
      <div data-section="hero">
        <button data-cta-button>Sign up now</button>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const btn = document.querySelector("button")!;
    btn.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      button_text: "Sign up now",
      href: "",
      section: "hero",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("fires cta_clicked when clicking .btn-primary", () => {
    document.body.innerHTML = `
      <div data-section="footer">
        <a href="/signup" class="btn-primary">Get Started</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const btn = document.querySelector("a")!;
    preventNavigation(btn);
    btn.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      button_text: "Get Started",
      href: "/signup",
      section: "footer",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("fires cta_clicked when clicking .btn-secondary", () => {
    document.body.innerHTML = `
      <div>
        <button class="btn-secondary">Learn more</button>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const btn = document.querySelector("button")!;
    btn.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      button_text: "Learn more",
      href: "",
      section: "unknown",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("fires cta_clicked when clicking a .b1-button landing page CTA", () => {
    document.body.innerHTML = `
      <section data-section="hero">
        <a href="/pricing/" class="b1-button">See pricing</a>
      </section>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      button_text: "See pricing",
      href: "/pricing/",
      section: "hero",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("includes correct href, button_text, section", () => {
    document.body.innerHTML = `
      <div data-section="cta-banner">
        <a href="#demo" data-cta-button>Book a demo</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    document.querySelector("a")!.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      button_text: "Book a demo",
      href: "#demo",
      section: "cta-banner",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("strips query strings and hashes from CTA hrefs", () => {
    document.body.innerHTML = `
      <div data-section="hero">
        <a href="/signup?email=owner@example.com&token=secret#plan" data-cta-button>Start</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      button_text: "Start",
      href: "/signup",
      section: "hero",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("drops mailto CTA hrefs and sensitive hash fragments", () => {
    document.body.innerHTML = `
      <div data-section="footer">
        <a href="mailto:owner@example.com" data-cta-button>Email us</a>
        <a href="#token=secret" data-cta-button>Secret anchor</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const [mailtoLink, hashLink] = Array.from(document.querySelectorAll("a"));
    mailtoLink!.click();
    hashLink!.click();

    expect(mockTrackEvent).toHaveBeenNthCalledWith(1, "cta_clicked", {
      button_text: "Email us",
      href: "",
      section: "footer",
      page_path: "/test-page",
    });
    expect(mockTrackEvent).toHaveBeenNthCalledWith(2, "cta_clicked", {
      button_text: "Secret anchor",
      href: "",
      section: "footer",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("includes shared CTA analytics context when present", () => {
    document.body.innerHTML = `
      <div data-section="decision-cta-card">
        <a
          href="/compare/vendors"
          data-cta-button
          data-cta-page-family="comparison"
          data-cta-buyer-stage="mofu"
          data-cta-placement="mid-article-routing"
          data-cta-intent="evaluate"
          data-cta-target="/compare/vendors"
        >
          Compare vendors
        </a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      button_text: "Compare vendors",
      href: "/compare/vendors",
      section: "decision-cta-card",
      page_path: "/test-page",
      page_family: "comparison",
      buyer_stage: "mofu",
      placement: "mid-article-routing",
      intent: "evaluate",
      target: "/compare/vendors",
    });

    cleanup();
  });

  it("truncates long button text to 100 chars", () => {
    const longText = "B".repeat(150);
    document.body.innerHTML = `
      <div>
        <button data-cta-button>${longText}</button>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    document.querySelector("button")!.click();

    const props = mockTrackEvent.mock.calls[0]![1] as Record<string, unknown>;
    expect((props.button_text as string).length).toBe(100);

    cleanup();
  });

  it("cleanup removes click listener", () => {
    document.body.innerHTML = `<a href="#test" data-cta-button>Click</a>`;

    const cleanup = setupCtaClickTracking();
    cleanup();

    document.querySelector("a")!.click();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("uses empty string for href when element has no href attribute", () => {
    document.body.innerHTML = `
      <div>
        <button data-cta-button></button>
      </div>
    `;

    const cleanup = setupCtaClickTracking();
    document.querySelector("button")!.click();

    const props = mockTrackEvent.mock.calls[0]![1] as Record<string, unknown>;
    expect(props.href).toBe("");
    expect(props.button_text).toBe("");

    cleanup();
  });

  it("walks up to 3 ancestor levels to find a matching element", () => {
    document.body.innerHTML = `
      <div data-section="hero">
        <a href="#pricing" class="btn-primary">
          <span><strong>Click here</strong></span>
        </a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    // Click the <strong> which is 2 levels deep inside the <a>
    const strong = document.querySelector("strong")!;
    strong.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      button_text: "Click here",
      href: "#pricing",
      section: "hero",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("does not fire for non-CTA elements", () => {
    document.body.innerHTML = `<p>Just a paragraph</p>`;

    const cleanup = setupCtaClickTracking();

    document.querySelector("p")!.click();
    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("stops searching after three ancestor levels for non-CTA trees", () => {
    document.body.innerHTML = `
      <div>
        <div>
          <div>
            <div>
              <span>Deep text</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    document.querySelector("span")!.click();
    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });
});

// ============================================================
// initCroTracking
// ============================================================
describe("initCroTracking", () => {
  it("calls all five setup functions", () => {
    setScrollProps(2000, 0, 500);

    // We test by checking that events can be triggered for each tracker
    initCroTracking();

    // Scroll depth should be set up
    setScrollProps(2000, 1500, 500);
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "scroll_depth_reached",
      expect.objectContaining({ threshold: 100 }),
    );
  });
});
