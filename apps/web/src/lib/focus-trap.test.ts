import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFocusTrap, isElementVisible } from "./focus-trap";

function makeButton(disabled = false): HTMLButtonElement {
  const btn = document.createElement("button");
  if (disabled) btn.setAttribute("disabled", "");
  document.body.appendChild(btn);
  return btn;
}

function makeDiv(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

function tabEvent(shiftKey = false): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
}

describe("useFocusTrap", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does nothing when active=false", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = makeButton();
    container.append(btn1, btn2);
    btn2.focus();

    const { result } = renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, false);
      return ref;
    });

    const e = tabEvent();
    const preventSpy = vi.spyOn(e, "preventDefault");
    document.dispatchEvent(e);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(btn2);
    expect(result.current).toBeDefined();
  });

  it("wraps Tab from last element to first", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = makeButton();
    container.append(btn1, btn2);
    btn2.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    const e = tabEvent(false);
    document.dispatchEvent(e);

    expect(document.activeElement).toBe(btn1);
  });

  it("wraps Shift+Tab from first element to last", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = makeButton();
    container.append(btn1, btn2);
    btn1.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    const e = tabEvent(true);
    document.dispatchEvent(e);

    expect(document.activeElement).toBe(btn2);
  });

  it("does not intercept Tab from a non-boundary element", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = makeButton();
    const btn3 = makeButton();
    container.append(btn1, btn2, btn3);
    btn2.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    const e = tabEvent(false);
    const preventSpy = vi.spyOn(e, "preventDefault");
    document.dispatchEvent(e);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  it("does not intercept Shift+Tab from a non-boundary element", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = makeButton();
    const btn3 = makeButton();
    container.append(btn1, btn2, btn3);
    btn2.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    const e = tabEvent(true);
    const preventSpy = vi.spyOn(e, "preventDefault");
    document.dispatchEvent(e);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  it("does nothing when container has no focusable elements", () => {
    const container = makeDiv();
    // No children

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    expect(() => {
      document.dispatchEvent(tabEvent(false));
      document.dispatchEvent(tabEvent(true));
    }).not.toThrow();
  });

  it("skips disabled elements", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = makeButton(true); // disabled
    const btn3 = makeButton();
    container.append(btn1, btn2, btn3);
    btn3.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    const e = tabEvent(false);
    document.dispatchEvent(e);

    expect(document.activeElement).toBe(btn1);
  });

  it("removes listener when active changes to false", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = makeButton();
    container.append(btn1, btn2);
    btn2.focus();

    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => {
        const ref = useRef<HTMLElement>(container);
        useFocusTrap(ref, active);
      },
      { initialProps: { active: true } },
    );

    rerender({ active: false });

    const e = tabEvent(false);
    const preventSpy = vi.spyOn(e, "preventDefault");
    document.dispatchEvent(e);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  it("does nothing when containerRef.current is null", () => {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLElement>(null);
      useFocusTrap(ref, true);
      return ref;
    });

    expect(() => {
      document.dispatchEvent(tabEvent(false));
    }).not.toThrow();
    expect(result.current.current).toBeNull();
  });

  it("skips elements with aria-disabled='true'", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = document.createElement("button");
    btn2.setAttribute("aria-disabled", "true");
    container.appendChild(btn2);
    document.body.appendChild(btn2);
    const btn3 = makeButton();
    container.append(btn1, btn2, btn3);
    btn3.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    // Tab from last (btn3) should wrap to btn1, skipping aria-disabled btn2
    const e = tabEvent(false);
    document.dispatchEvent(e);

    expect(document.activeElement).toBe(btn1);
  });

  it("excludes elements with hidden attribute from focusable list", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = makeButton();
    // btn3 has hidden -- should be excluded, making btn2 the last focusable
    const btn3 = makeButton();
    btn3.setAttribute("hidden", "");
    container.append(btn1, btn2, btn3);
    btn2.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    // Tab from btn2 should wrap to btn1 because btn3 (hidden) is excluded
    // Without the fix, btn3 is the last element, so Tab from btn2 does NOT wrap
    const e = tabEvent(false);
    const preventSpy = vi.spyOn(e, "preventDefault");
    document.dispatchEvent(e);

    expect(preventSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(btn1);
  });

  it("excludes elements inside a hidden ancestor from focusable list", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = makeButton();
    // btn3 is inside a hidden div -- should be excluded
    const hiddenDiv = document.createElement("div");
    hiddenDiv.setAttribute("hidden", "");
    const btn3 = document.createElement("button");
    hiddenDiv.appendChild(btn3);
    container.append(btn1, btn2, hiddenDiv);
    btn2.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    // Tab from btn2 should wrap to btn1 because btn3 (inside hidden div) is excluded
    const e = tabEvent(false);
    const preventSpy = vi.spyOn(e, "preventDefault");
    document.dispatchEvent(e);

    expect(preventSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(btn1);
  });

  it("includes elements with ARIA interactive roles in the focus trap", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const roleButton = document.createElement("div");
    roleButton.setAttribute("role", "button");
    roleButton.setAttribute("tabindex", "0");
    document.body.appendChild(roleButton);
    const roleTab = document.createElement("div");
    roleTab.setAttribute("role", "tab");
    roleTab.setAttribute("tabindex", "0");
    document.body.appendChild(roleTab);
    container.append(btn1, roleButton, roleTab);
    roleTab.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    // Tab from roleTab (last) should wrap to btn1 (first)
    const e = tabEvent(false);
    document.dispatchEvent(e);

    expect(document.activeElement).toBe(btn1);
  });

  it("includes [role='link'] and [role='switch'] elements in the focus trap", () => {
    const container = makeDiv();
    const roleLink = document.createElement("div");
    roleLink.setAttribute("role", "link");
    roleLink.setAttribute("tabindex", "0");
    document.body.appendChild(roleLink);
    const roleSwitch = document.createElement("div");
    roleSwitch.setAttribute("role", "switch");
    roleSwitch.setAttribute("tabindex", "0");
    document.body.appendChild(roleSwitch);
    container.append(roleLink, roleSwitch);
    roleSwitch.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    // Tab from roleSwitch (last) should wrap to roleLink (first)
    const e = tabEvent(false);
    document.dispatchEvent(e);

    expect(document.activeElement).toBe(roleLink);
  });

  it("ignores non-Tab keys", () => {
    const container = makeDiv();
    const btn1 = makeButton();
    const btn2 = makeButton();
    container.append(btn1, btn2);
    btn2.focus();

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, true);
    });

    const e = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    const preventSpy = vi.spyOn(e, "preventDefault");
    document.dispatchEvent(e);

    expect(preventSpy).not.toHaveBeenCalled();
  });
});

describe("isElementVisible", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns true for a normal visible element", () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    expect(isElementVisible(btn)).toBe(true);
  });

  it("returns false for an element with hidden attribute", () => {
    const btn = document.createElement("button");
    btn.setAttribute("hidden", "");
    document.body.appendChild(btn);
    expect(isElementVisible(btn)).toBe(false);
  });

  it("returns false for an element inside a hidden ancestor", () => {
    const div = document.createElement("div");
    div.setAttribute("hidden", "");
    const btn = document.createElement("button");
    div.appendChild(btn);
    document.body.appendChild(div);
    expect(isElementVisible(btn)).toBe(false);
  });

  it("returns false when visibility is hidden", () => {
    const btn = document.createElement("button");
    btn.style.visibility = "hidden";
    document.body.appendChild(btn);
    expect(isElementVisible(btn)).toBe(false);
  });

  it("returns false when display is none", () => {
    const btn = document.createElement("button");
    btn.style.display = "none";
    document.body.appendChild(btn);
    expect(isElementVisible(btn)).toBe(false);
  });
});
