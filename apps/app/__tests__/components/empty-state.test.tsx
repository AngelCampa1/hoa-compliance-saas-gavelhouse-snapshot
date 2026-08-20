import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/ui/empty-state";

describe("EmptyState", () => {
  it("renders the title as a level-2 heading so it does not skip from the page h1", () => {
    render(<EmptyState title="No journal entries yet" />);

    const heading = screen.getByRole("heading", {
      name: "No journal entries yet",
      level: 2,
    });
    expect(heading).toBeInTheDocument();
  });

  it("renders an optional description", () => {
    render(
      <EmptyState title="Nothing here" description="Add your first record." />,
    );

    expect(screen.getByText("Add your first record.")).toBeInTheDocument();
  });

  it("renders an optional icon and action", () => {
    render(
      <EmptyState
        title="Nothing here"
        icon={<svg data-testid="empty-icon" />}
        action={<button type="button">Create</button>}
      />,
    );

    expect(screen.getByTestId("empty-icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("hides the decorative icon from assistive tech", () => {
    render(
      <EmptyState
        title="Nothing here"
        icon={<svg data-testid="empty-icon" />}
      />,
    );

    // The title already names the empty state; the icon is purely decorative,
    // so its wrapper must be hidden from screen readers.
    const icon = screen.getByTestId("empty-icon");
    expect(icon.parentElement).toHaveAttribute("aria-hidden", "true");
  });
});
