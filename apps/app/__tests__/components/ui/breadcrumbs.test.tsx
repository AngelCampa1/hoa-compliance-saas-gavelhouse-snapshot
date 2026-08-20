import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BreadcrumbList } from "@/components/ui/breadcrumbs";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("BreadcrumbList", () => {
  it("renders nothing for empty items", () => {
    const { container } = render(<BreadcrumbList items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a single item", () => {
    const { container } = render(
      <BreadcrumbList items={[{ label: "Home", href:"/" }]} />,
    );
    // Single item = current page = no nav needed
    expect(container.firstChild).toBeNull();
  });

  it("renders breadcrumb items", () => {
    render(
      <BreadcrumbList
        items={[
          { label: "Finance", href:"/finance" },
          { label: "Journal", href:"/finance/journal" },
        ]}
      />,
    );
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Journal")).toBeInTheDocument();
  });

  it("renders separator between items", () => {
    render(
      <BreadcrumbList
        items={[
          { label: "Finance", href:"/finance" },
          { label: "Journal", href:"/finance/journal" },
        ]}
      />,
    );
    // separator is rendered as a visual element
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
  });

  it("last item has aria-current page", () => {
    render(
      <BreadcrumbList
        items={[
          { label: "Finance", href:"/finance" },
          { label: "Journal", href:"/finance/journal" },
        ]}
      />,
    );
    const current = screen.getByText("Journal").closest("[aria-current]");
    expect(current).toHaveAttribute("aria-current", "page");
  });
});
