import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_SDR_WIDGET_API_BASE_URL,
  AI_SDR_WIDGET_BUNDLE_URL,
  AI_SDR_WIDGET_LAUNCHER_LABEL,
  AI_SDR_WIDGET_PRODUCT_ID,
  AI_SDR_WIDGET_ROOT_ID,
  buildAiSdrWidgetInitScript,
  buildAiSdrWidgetStyles,
} from "./widget";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).VentoraAiSdr;
});

describe("widget constants", () => {
  it("targets the gavelhouse product over the same-origin BFF base", () => {
    expect(AI_SDR_WIDGET_PRODUCT_ID).toBe("gavelhouse");
    expect(AI_SDR_WIDGET_API_BASE_URL).toBe("/api/ai-sdr");
    expect(AI_SDR_WIDGET_BUNDLE_URL).toContain("/client/ai-sdr.global.js");
  });
});

describe("buildAiSdrWidgetStyles", () => {
  const styles = buildAiSdrWidgetStyles();

  it("uses pill geometry for the launcher and close button", () => {
    // Every interactive button uses border-radius:999px (design canon: pills).
    // Match the base rule for each id (the one that also sets `background`),
    // not the prefers-reduced-motion override.
    const toggleRule = styles.match(
      /#ventora-ai-sdr-toggle\{[^}]*background[^}]*\}/,
    );
    const closeRule = styles.match(
      /#ventora-ai-sdr-close\{[^}]*background[^}]*\}/,
    );
    expect(toggleRule?.[0]).toContain("border-radius:999px");
    expect(closeRule?.[0]).toContain("border-radius:999px");
  });

  it("uses the Gavelhouse navy accent and disables motion under reduced-motion", () => {
    expect(styles).toContain("--ai-shell-accent:#163a5f");
    expect(styles).toContain("@media(prefers-reduced-motion:reduce)");
    expect(styles).toContain("transition:none");
  });
});

describe("buildAiSdrWidgetInitScript", () => {
  function run(script: string): void {
    new Function(script)();
  }

  it("injects the shell, styles, and a pill launcher into the root", () => {
    document.body.innerHTML = `<div id="${AI_SDR_WIDGET_ROOT_ID}"></div>`;
    run(buildAiSdrWidgetInitScript());

    const toggle = document.getElementById("ventora-ai-sdr-toggle");
    expect(toggle?.textContent).toBe(AI_SDR_WIDGET_LAUNCHER_LABEL);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("ventora-ai-sdr-panel")).not.toBeNull();
    expect(document.head.querySelector("style")?.textContent).toContain(
      "border-radius:999px",
    );
  });

  it("does nothing when the root element is absent", () => {
    run(buildAiSdrWidgetInitScript());
    expect(document.getElementById("ventora-ai-sdr-toggle")).toBeNull();
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("creates the widget with the gavelhouse session config when opened and the bundle is ready", () => {
    const open = vi.fn();
    const createAiSdrWidget = vi.fn(() => ({ open }));
    (window as unknown as Record<string, unknown>).VentoraAiSdr = {
      createAiSdrWidget,
    };

    document.body.innerHTML = `<div id="${AI_SDR_WIDGET_ROOT_ID}"></div>`;
    run(buildAiSdrWidgetInitScript());

    const toggle = document.getElementById(
      "ventora-ai-sdr-toggle",
    ) as HTMLButtonElement;
    toggle.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      document
        .getElementById("ventora-ai-sdr-panel")
        ?.getAttribute("data-open"),
    ).toBe("true");
    expect(createAiSdrWidget).toHaveBeenCalledTimes(1);
    expect(createAiSdrWidget.mock.calls[0][0]).toMatchObject({
      api: { baseUrl: "/api/ai-sdr" },
      session: {
        productId: "gavelhouse",
        metadata: { surface: "marketing-site" },
      },
    });
    expect(open).toHaveBeenCalled();

    // Re-opening reuses the existing widget instance.
    toggle.click();
    expect(createAiSdrWidget).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("closing the panel clears the open state", () => {
    (window as unknown as Record<string, unknown>).VentoraAiSdr = {
      createAiSdrWidget: () => ({ open: vi.fn() }),
    };
    document.body.innerHTML = `<div id="${AI_SDR_WIDGET_ROOT_ID}"></div>`;
    run(buildAiSdrWidgetInitScript());
    const toggle = document.getElementById(
      "ventora-ai-sdr-toggle",
    ) as HTMLButtonElement;
    const close = document.getElementById(
      "ventora-ai-sdr-close",
    ) as HTMLButtonElement;
    toggle.click();
    close.click();
    expect(
      document
        .getElementById("ventora-ai-sdr-panel")
        ?.hasAttribute("data-open"),
    ).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("polls for the bundle and falls back to an error message after max attempts", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="${AI_SDR_WIDGET_ROOT_ID}"></div>`;
    run(buildAiSdrWidgetInitScript({ maxAttempts: 3, intervalMs: 100 }));
    const toggle = document.getElementById(
      "ventora-ai-sdr-toggle",
    ) as HTMLButtonElement;
    const target = document.getElementById(
      "ventora-ai-sdr-target",
    ) as HTMLElement;

    toggle.click();
    expect(target.innerHTML).toContain("Loading assistant");

    vi.advanceTimersByTime(300);
    expect(target.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("recovers when the bundle arrives mid-poll", () => {
    vi.useFakeTimers();
    const open = vi.fn();
    document.body.innerHTML = `<div id="${AI_SDR_WIDGET_ROOT_ID}"></div>`;
    run(buildAiSdrWidgetInitScript({ maxAttempts: 10, intervalMs: 100 }));
    const toggle = document.getElementById(
      "ventora-ai-sdr-toggle",
    ) as HTMLButtonElement;
    toggle.click();

    (window as unknown as Record<string, unknown>).VentoraAiSdr = {
      createAiSdrWidget: () => ({ open }),
    };
    vi.advanceTimersByTime(100);
    expect(open).toHaveBeenCalled();
  });
});
