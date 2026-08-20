import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Ensure React Testing Library unmounts all rendered components after each test.
// This prevents JSDOM state leaks between test files which can cause coverage
// instrumentation failures on Windows (ENOENT race in vitest tmp dir cleanup).
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// Radix UI components use pointer capture and scroll APIs not available in jsdom.
// Polyfill them to prevent test errors.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = (_pointerId: number) => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = (_pointerId: number) => undefined;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = (_pointerId: number) => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
}
