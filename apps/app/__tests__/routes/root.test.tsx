import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

const mockGetSession = vi.fn();
const mockCaptureUnexpectedError = vi.fn();

vi.mock("@/lib/auth", () => ({
  authClient: {
    getSession: mockGetSession,
  },
}));

vi.mock("@/lib/sentry", () => ({
  captureUnexpectedError: mockCaptureUnexpectedError,
  reportUserFacingError: vi.fn((error: unknown, fallback: string) => {
    return error instanceof Error ? error.message : fallback;
  }),
}));

// Capture loader data so we can pass it to the component
let capturedLoaderData: Record<string, unknown> = {};

vi.mock("@tanstack/react-router", () => ({
  createRootRoute: (opts: {
    loader?: () => Promise<unknown>;
    beforeLoad?: () => Promise<unknown>;
    component?: React.ComponentType;
    errorComponent?: React.ComponentType<{ error: unknown }>;
    notFoundComponent?: React.ComponentType;
  }) => ({
    ...opts,
    useLoaderData: () => capturedLoaderData,
  }),
  Outlet: () => <div data-testid="outlet">outlet</div>,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  TanStackRouterDevtools: () => null,
}));

vi.mock("@tanstack/router-devtools", () => ({
  TanStackRouterDevtools: () => null,
}));

async function callLoader(
  context: { session: unknown; sessionCheckFailed: boolean } = {
    session: null,
    sessionCheckFailed: false,
  },
) {
  const mod = await import("@/routes/__root");
  const route = mod.Route as unknown as {
    loader?: (opts: { context: typeof context }) => unknown;
  };
  if (!route.loader) throw new Error("loader not found on Route");
  return route.loader({ context });
}

async function callBeforeLoad() {
  const mod = await import("@/routes/__root");
  const route = mod.Route as unknown as {
    beforeLoad?: () => Promise<unknown>;
  };
  if (!route.beforeLoad) throw new Error("beforeLoad not found on Route");
  return route.beforeLoad();
}

async function renderRootComponent(loaderData: Record<string, unknown> = {}) {
  capturedLoaderData = loaderData;
  const mod = await import("@/routes/__root");
  const route = mod.Route as unknown as {
    component?: React.ComponentType;
    useLoaderData?: () => Record<string, unknown>;
  };
  if (!route.component) throw new Error("component not found on Route");
  const Component = route.component;
  render(<Component />);
}

describe("Root route loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    capturedLoaderData = {};
  });

  // The loader no longer calls getSession; it projects context values set by
  // beforeLoad into loader data for the component to read (HIGH-APP-6 fix).
  it("passes session and sessionCheckFailed from context into loader data", async () => {
    const session = { user: { id: "u-1", email: "owner@example.com" } };
    const result = await callLoader({ session, sessionCheckFailed: false });
    expect(result).toEqual({ sessionCheckFailed: false, session });
  });

  it("passes sessionCheckFailed: true when context indicates failure", async () => {
    const result = await callLoader({
      session: null,
      sessionCheckFailed: true,
    });
    expect(result).toEqual({ sessionCheckFailed: true, session: null });
  });
});

describe("Root route beforeLoad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    capturedLoaderData = {};
  });

  // beforeLoad now owns the single getSession call and sets sessionCheckFailed
  // so the loader can project it into loader data without a second fetch.
  it("returns session and sessionCheckFailed: false when getSession resolves", async () => {
    mockGetSession.mockResolvedValue({
      data: { user: { id: "u-1", email: "owner@example.com" } },
    });

    const result = await callBeforeLoad();

    expect(result).toEqual({
      session: { user: { id: "u-1", email: "owner@example.com" } },
      sessionCheckFailed: false,
    });
  });

  it("returns { session: null, sessionCheckFailed: false } when getSession resolves with null data", async () => {
    mockGetSession.mockResolvedValue({ data: null });

    const result = await callBeforeLoad();

    expect(result).toEqual({ session: null, sessionCheckFailed: false });
  });

  it("returns { session: null, sessionCheckFailed: true } and calls captureUnexpectedError when getSession throws", async () => {
    const networkError = new TypeError("Failed to fetch");
    mockGetSession.mockRejectedValue(networkError);

    const result = await callBeforeLoad();

    expect(result).toEqual({ session: null, sessionCheckFailed: true });
    expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(networkError, {
      tags: { source: "root-beforeLoad" },
    });
  });
});

describe("Root route component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    capturedLoaderData = {};
  });

  it("renders the Outlet by default (no session error)", async () => {
    await renderRootComponent({ sessionCheckFailed: false });

    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("does not show connectivity banner when sessionCheckFailed is false", async () => {
    await renderRootComponent({ sessionCheckFailed: false });

    expect(
      screen.queryByRole("heading", { name: /connection issue/i }),
    ).toBeNull();
  });
});

describe("Root route sessionCheckFailed banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    capturedLoaderData = {};
  });

  it("shows the connectivity warning alert when sessionCheckFailed loader data is true", async () => {
    // The banner is driven by loader data (reactive state), not a module-level flag.
    await renderRootComponent({ sessionCheckFailed: true });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /connection issue/i }),
      ).toBeInTheDocument();
    });
  });

  it("clears the banner when sessionCheckFailed loader data is false", async () => {
    // Re-render with sessionCheckFailed: false — banner must not appear.
    await renderRootComponent({ sessionCheckFailed: false });

    expect(
      screen.queryByRole("heading", { name: /connection issue/i }),
    ).toBeNull();
  });
});
