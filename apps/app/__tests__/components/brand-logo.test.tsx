import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLogo } from "../../src/components/brand-logo";

describe("BrandLogo", () => {
  it("renders the selected full Gavelhouse logo with brand-colored wordmark", () => {
    render(<BrandLogo />);

    expect(screen.getByLabelText("Gavelhouse")).toBeInTheDocument();
    expect(screen.getByLabelText("Gavelhouse")).toHaveClass(
      "[--bs-logo-board:#163a5f]",
    );
    expect(screen.getByText("Gavel")).toHaveAttribute(
      "fill",
      "var(--bs-logo-board)",
    );
    expect(screen.getByText("house")).toHaveAttribute(
      "fill",
      "var(--bs-logo-stack)",
    );
    expect(screen.getByText("Gavel").parentElement).toHaveAttribute(
      "letter-spacing",
      "0",
    );
  });

  it("can render the wordmark for inverse brand surfaces", () => {
    render(<BrandLogo tone="inverse" />);

    expect(screen.getByLabelText("Gavelhouse")).toHaveClass(
      "[--bs-logo-board:#f4ecdf]",
    );
    expect(screen.getByText("Gavel")).toHaveAttribute(
      "fill",
      "var(--bs-logo-board)",
    );
    expect(screen.getByText("house")).toHaveAttribute(
      "fill",
      "var(--bs-logo-stack)",
    );
  });

  it("can render the standalone stacked-check mark for compact spaces", () => {
    const { container } = render(<BrandLogo variant="mark" title="Home" />);

    expect(screen.getByLabelText("Home")).toBeInTheDocument();
    expect(container.querySelector('[data-brand-logo-wordmark="true"]')).toBe(
      null,
    );
    expect(container.querySelector('[data-brand-logo-mark="true"]')).not.toBe(
      null,
    );
  });
});
