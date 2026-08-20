import { trackEvent } from "./analytics";
import {
  buildCtaClickEventProperties,
  sanitizeCtaTarget,
} from "./cta-analytics";

const SCROLL_THRESHOLDS = [25, 50, 75, 100] as const;
const ENGAGED_TIME_MILESTONES = [15, 30, 60, 120, 300] as const;
const MAX_MILESTONE_SECONDS = 300;

export function setupScrollDepthTracking(): () => void {
  const firedThresholds = new Set<number>();

  function checkThresholds(): void {
    const scrollHeight = document.documentElement.scrollHeight;
    const scrollY = window.scrollY;
    const innerHeight = window.innerHeight;
    const ratio = (scrollY + innerHeight) / scrollHeight;

    for (const threshold of SCROLL_THRESHOLDS) {
      if (!firedThresholds.has(threshold) && ratio >= threshold / 100) {
        firedThresholds.add(threshold);
        trackEvent("scroll_depth_reached", {
          threshold,
          page_path: location.pathname,
        });
      }
    }
  }

  // Edge case: page fits in viewport
  if (document.documentElement.scrollHeight <= window.innerHeight) {
    for (const threshold of SCROLL_THRESHOLDS) {
      firedThresholds.add(threshold);
      trackEvent("scroll_depth_reached", {
        threshold,
        page_path: location.pathname,
      });
    }
  }

  window.addEventListener("scroll", checkThresholds);

  return () => {
    window.removeEventListener("scroll", checkThresholds);
  };
}

export function setupSectionVisibilityTracking(): () => void {
  const sections = document.querySelectorAll("[data-section]");

  if (sections.length === 0) {
    return () => {};
  }

  const pageLoadTime = Date.now();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        trackEvent("section_viewed", {
          section: el.dataset.section,
          time_to_view_ms: Date.now() - pageLoadTime,
          page_path: location.pathname,
        });
        observer.unobserve(el);
      }
    },
    { threshold: 0.3 },
  );

  for (const section of sections) {
    observer.observe(section);
  }

  return () => {
    observer.disconnect();
  };
}

export function setupEngagedTimeTracking(): () => void {
  let seconds = 0;
  const firedMilestones = new Set<number>();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  intervalId = setInterval(() => {
    if (document.visibilityState !== "visible") return;

    seconds += 1;

    for (const milestone of ENGAGED_TIME_MILESTONES) {
      if (!firedMilestones.has(milestone) && seconds >= milestone) {
        firedMilestones.add(milestone);
        trackEvent("engaged_time_reached", {
          milestone_seconds: milestone,
          page_path: location.pathname,
        });
      }
    }

    if (seconds >= MAX_MILESTONE_SECONDS && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }, 1000);

  return () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

export function setupFaqExpansionTracking(): () => void {
  const faqSection = document.querySelector("[data-faq-section]");
  if (!faqSection) return () => {};

  const detailsElements = faqSection.querySelectorAll("details");
  const handlers: Array<{ el: HTMLDetailsElement; handler: () => void }> = [];

  detailsElements.forEach((el, index) => {
    const detailsEl = el as HTMLDetailsElement;
    const handler = (): void => {
      if (!detailsEl.open) return;

      const summary = detailsEl.querySelector("summary");
      const text = (summary?.textContent ?? "").trim().slice(0, 200);

      trackEvent("faq_expanded", {
        question_text: text,
        question_index: index,
        page_path: location.pathname,
      });
    };

    detailsEl.addEventListener("toggle", handler);
    handlers.push({ el: detailsEl, handler });
  });

  return () => {
    for (const { el, handler } of handlers) {
      el.removeEventListener("toggle", handler);
    }
  };
}

function findCtaElement(target: EventTarget | null): HTMLElement | null {
  let el = target as HTMLElement | null;
  let depth = 0;

  while (el && depth <= 3) {
    if (el === document.body) return null;

    const isAnchorHash =
      el.tagName === "A" && (el.getAttribute("href") ?? "").startsWith("#");
    const isCtaButton = el.hasAttribute("data-cta-button");
    const isBtnPrimary = el.classList.contains("btn-primary");
    const isBtnSecondary = el.classList.contains("btn-secondary");
    const isB1Button = el.classList.contains("b1-button");

    if (
      isAnchorHash ||
      isCtaButton ||
      isBtnPrimary ||
      isBtnSecondary ||
      isB1Button
    ) {
      return el;
    }

    el = el.parentElement;
    depth += 1;
  }

  return null;
}

export function setupCtaClickTracking(): () => void {
  function onClick(event: Event): void {
    const ctaEl = findCtaElement(event.target);
    if (!ctaEl) return;

    const buttonText = (ctaEl.textContent ?? "").trim().slice(0, 100);
    const href = sanitizeCtaTarget(ctaEl.getAttribute("href") ?? "");
    const sectionEl = ctaEl.closest("[data-section]") as HTMLElement | null;
    const section = sectionEl?.dataset.section ?? "unknown";

    trackEvent(
      "cta_clicked",
      buildCtaClickEventProperties(ctaEl, {
        buttonText,
        href,
        section,
        pagePath: location.pathname,
      }),
    );
  }

  document.body.addEventListener("click", onClick);

  return () => {
    document.body.removeEventListener("click", onClick);
  };
}

export function initCroTracking(): void {
  setupScrollDepthTracking();
  setupSectionVisibilityTracking();
  setupEngagedTimeTracking();
  setupFaqExpansionTracking();
  setupCtaClickTracking();
}
