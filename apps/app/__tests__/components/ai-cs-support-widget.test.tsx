import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Capture the props handed to the real AiCsWidget without mounting its full
// session/SSE machinery. The sentinel renders a marker we can query for.
const widgetProps: Array<Record<string, unknown>> = [];
vi.mock("@ventora/ai-cs/react", () => ({
  AiCsWidget: (props: Record<string, unknown>) => {
    widgetProps.push(props);
    return <div data-testid="ai-cs-widget" />;
  },
}));

// Pin the api origin so the BFF base URL is deterministic.
vi.mock("@/lib/api", () => ({
  getApiBase: () => "https://api.gavelhouse.app",
}));

import { AiCsSupportWidget } from "@/components/ai-cs-support-widget";

beforeEach(() => {
  widgetProps.length = 0;
});

describe("AiCsSupportWidget", () => {
  it("mounts the widget for an authenticated user with BFF + brand props", () => {
    const { queryByTestId } = render(
      <AiCsSupportWidget userId="user-123" currentPath="/dashboard" />,
    );

    expect(queryByTestId("ai-cs-widget")).not.toBeNull();
    expect(widgetProps).toHaveLength(1);

    const props = widgetProps[0]!;
    expect(props.api).toEqual({
      baseUrl: "https://api.gavelhouse.app/api/ai-cs",
      credentials: "include",
    });
    expect(props.session).toEqual({
      appId: "gavelhouse",
      userId: "user-123",
      currentPath: "/dashboard",
    });
    expect(props.brand).toEqual({ id: "boardstack" });
  });

  it("renders nothing when there is no authenticated user", () => {
    const { container, queryByTestId } = render(
      <AiCsSupportWidget userId={undefined} currentPath="/dashboard" />,
    );

    expect(queryByTestId("ai-cs-widget")).toBeNull();
    expect(container.firstChild).toBeNull();
    expect(widgetProps).toHaveLength(0);
  });

  it("keeps the memoized api object stable across re-renders", () => {
    const { rerender } = render(
      <AiCsSupportWidget userId="user-123" currentPath="/dashboard" />,
    );
    rerender(<AiCsSupportWidget userId="user-123" currentPath="/billing" />);

    expect(widgetProps).toHaveLength(2);
    // Same api reference handed to the widget on both renders.
    expect(widgetProps[0]!.api).toBe(widgetProps[1]!.api);
    // Session reflects the updated path.
    expect(
      (widgetProps[1]!.session as { currentPath: string }).currentPath,
    ).toBe("/billing");
  });
});
