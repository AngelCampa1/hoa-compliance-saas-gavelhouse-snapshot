import { trackEvent } from "./analytics";

let hasFiredFocus = false;

export function trackEmailFocus(sourcePage: string): void {
  if (hasFiredFocus) return;
  hasFiredFocus = true;
  trackEvent("email_field_focused", { source_page: sourcePage });
}

export function trackEmailBlurWithoutSubmit(
  sourcePage: string,
  hasValue: boolean,
): void {
  trackEvent("email_field_abandoned", {
    source_page: sourcePage,
    had_value: hasValue,
  });
}

export function resetFocusTracking(): void {
  hasFiredFocus = false;
}
