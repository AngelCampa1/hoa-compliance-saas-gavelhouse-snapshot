import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

describe("Alert", () => {
  it("renders default variant with semantic default tokens", () => {
    const { container } = render(<Alert>Default</Alert>);
    const el = container.querySelector("[role='alert']");
    expect(el).not.toBeNull();
    expect(el?.className).toContain("bg-background");
    expect(el?.className).toContain("text-foreground");
    expect(el?.className).toContain("border-border");
  });

  it("renders info variant with semantic info tokens", () => {
    const { container } = render(<Alert variant="info">Info</Alert>);
    const el = container.querySelector("[role='alert']");
    expect(el?.className).toContain("bg-info/10");
    expect(el?.className).toContain("text-info");
    expect(el?.className).toContain("border-info/30");
  });

  it("renders success variant with semantic success tokens", () => {
    const { container } = render(<Alert variant="success">Ok</Alert>);
    const el = container.querySelector("[role='alert']");
    expect(el?.className).toContain("bg-success/10");
    expect(el?.className).toContain("text-success");
    expect(el?.className).toContain("border-success/30");
  });

  it("renders warning variant with warning-foreground text token", () => {
    const { container } = render(<Alert variant="warning">Warn</Alert>);
    const el = container.querySelector("[role='alert']");
    expect(el?.className).toContain("bg-warning/15");
    expect(el?.className).toContain("text-warning-foreground");
    expect(el?.className).toContain("border-warning/40");
  });

  it("renders destructive variant with destructive tokens", () => {
    const { container } = render(<Alert variant="destructive">Bad</Alert>);
    const el = container.querySelector("[role='alert']");
    expect(el?.className).toContain("bg-destructive/10");
    expect(el?.className).toContain("text-destructive");
    expect(el?.className).toContain("border-destructive/30");
  });

  it("renders the default icon for the variant", () => {
    const { container } = render(<Alert variant="success">Ok</Alert>);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("allows overriding the icon via the icon prop", () => {
    const { container } = render(
      <Alert variant="info" icon={<span data-testid="custom-icon" />}>
        Info
      </Alert>,
    );
    expect(
      container.querySelector("[data-testid='custom-icon']"),
    ).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("suppresses the icon when icon={null}", () => {
    const { container } = render(
      <Alert variant="info" icon={null}>
        Info
      </Alert>,
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("merges custom className with variant classes", () => {
    const { container } = render(
      <Alert variant="info" className="custom-class">
        Info
      </Alert>,
    );
    const el = container.querySelector("[role='alert']");
    expect(el?.className).toContain("custom-class");
    expect(el?.className).toContain("bg-info/10");
  });

  it("renders AlertTitle as an h5 with provided content", () => {
    const { container } = render(
      <Alert>
        <AlertTitle className="extra-title">Title</AlertTitle>
      </Alert>,
    );
    const h5 = container.querySelector("h5");
    expect(h5).not.toBeNull();
    expect(h5?.textContent).toBe("Title");
    expect(h5?.className).toContain("extra-title");
    expect(h5?.className).toContain("font-medium");
  });

  it("renders AlertDescription as a p with provided content", () => {
    const { container } = render(
      <Alert>
        <AlertDescription className="extra-desc">Body</AlertDescription>
      </Alert>,
    );
    const p = container.querySelector("p");
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe("Body");
    expect(p?.className).toContain("extra-desc");
    expect(p?.className).toContain("text-sm");
  });
});
