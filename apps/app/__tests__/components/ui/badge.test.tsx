import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  it("renders success variant with semantic success tokens", () => {
    const { container } = render(<Badge variant="success">OK</Badge>);
    const el = container.querySelector("span");
    expect(el).not.toBeNull();
    expect(el?.className).toContain("bg-success");
    expect(el?.className).toContain("text-success-foreground");
  });

  it("renders warning variant with semantic warning tokens", () => {
    const { container } = render(<Badge variant="warning">Warn</Badge>);
    const el = container.querySelector("span");
    expect(el?.className).toContain("bg-warning");
    expect(el?.className).toContain("text-warning-foreground");
  });

  it("renders info variant with semantic info tokens", () => {
    const { container } = render(<Badge variant="info">Info</Badge>);
    const el = container.querySelector("span");
    expect(el?.className).toContain("bg-info");
    expect(el?.className).toContain("text-info-foreground");
  });

  it("renders destructive variant with destructive tokens", () => {
    const { container } = render(<Badge variant="destructive">Bad</Badge>);
    const el = container.querySelector("span");
    expect(el?.className).toContain("bg-destructive");
    expect(el?.className).toContain("text-destructive-foreground");
  });

  it("renders secondary variant with secondary tokens", () => {
    const { container } = render(<Badge variant="secondary">Meh</Badge>);
    const el = container.querySelector("span");
    expect(el?.className).toContain("bg-secondary");
    expect(el?.className).toContain("text-secondary-foreground");
  });
});
