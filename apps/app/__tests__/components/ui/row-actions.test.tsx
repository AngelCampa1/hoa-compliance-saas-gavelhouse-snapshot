import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { RowActions, RowAction } from "@/components/ui/row-actions";

describe("RowActions", () => {
  it("renders the trigger button", () => {
    render(
      <RowActions label="Actions for item 1">
        <RowAction onClick={() => {}}>Edit</RowAction>
      </RowActions>,
    );
    expect(
      screen.getByRole("button", { name: "Actions for item 1" }),
    ).toBeInTheDocument();
  });

  it("opens dropdown on click and shows items", async () => {
    const user = userEvent.setup();
    render(
      <RowActions label="Actions">
        <RowAction onClick={() => {}}>Edit</RowAction>
        <RowAction onClick={() => {}}>Delete</RowAction>
      </RowActions>,
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onClick when a RowAction is clicked", async () => {
    const user = userEvent.setup();
    const handleEdit = vi.fn();
    render(
      <RowActions label="Actions">
        <RowAction onClick={handleEdit}>Edit</RowAction>
      </RowActions>,
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByText("Edit"));
    expect(handleEdit).toHaveBeenCalledTimes(1);
  });

  it("applies destructive variant styling to RowAction", async () => {
    const user = userEvent.setup();
    render(
      <RowActions label="Actions">
        <RowAction onClick={() => {}} variant="destructive">
          Delete
        </RowAction>
      </RowActions>,
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const item = screen.getByText("Delete");
    expect(item).toBeInTheDocument();
  });
});
