import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/ui/page-header";

describe("PageHeader", () => {
  it("renders the title and description", () => {
    render(
      <PageHeader
        title="Dashboard — Sunset Ridge HOA"
        description="Overview"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Dashboard — Sunset Ridge HOA",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("syncs the browser title with the page title", () => {
    const { rerender } = render(
      <PageHeader title="Dashboard — Sunset Ridge HOA" />,
    );

    expect(document.title).toBe("Dashboard — Sunset Ridge HOA");

    rerender(<PageHeader title="Billing" />);

    expect(document.title).toBe("Billing");
  });
});
