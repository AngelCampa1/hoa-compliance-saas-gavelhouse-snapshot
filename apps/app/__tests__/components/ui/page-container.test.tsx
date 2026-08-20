import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageContainer } from "@/components/ui/page-container";

describe("PageContainer", () => {
  it("renders children", () => {
    const { getByText } = render(
      <PageContainer>
        <p>Hello</p>
      </PageContainer>,
    );
    expect(getByText("Hello")).toBeInTheDocument();
  });

  it("applies form variant max-width", () => {
    const { container } = render(
      <PageContainer variant="form">
        <p>Content</p>
      </PageContainer>,
    );
    expect(container.firstChild).toHaveClass("max-w-2xl");
  });

  it("applies data variant (full width, no max-w constraint)", () => {
    const { container } = render(
      <PageContainer variant="data">
        <p>Table</p>
      </PageContainer>,
    );
    expect(container.firstChild).not.toHaveClass("max-w-2xl");
    expect(container.firstChild).not.toHaveClass("max-w-5xl");
  });

  it("applies report variant max-width", () => {
    const { container } = render(
      <PageContainer variant="report">
        <p>Report</p>
      </PageContainer>,
    );
    expect(container.firstChild).toHaveClass("max-w-5xl");
  });

  it("defaults to data variant", () => {
    const { container } = render(
      <PageContainer>
        <p>Default</p>
      </PageContainer>,
    );
    // data = full width, no max-w class
    expect(container.firstChild).not.toHaveClass("max-w-2xl");
  });

  it("applies custom className", () => {
    const { container } = render(
      <PageContainer className="custom">
        <p>Content</p>
      </PageContainer>,
    );
    expect(container.firstChild).toHaveClass("custom");
  });
});
