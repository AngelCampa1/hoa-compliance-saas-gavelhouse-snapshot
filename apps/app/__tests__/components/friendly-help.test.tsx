import type * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmActionDialog } from "@/components/help/ConfirmActionDialog";
import { FriendlyEmptyState } from "@/components/help/FriendlyEmptyState";
import { HelpHint } from "@/components/help/HelpHint";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("friendly help components", () => {
  it("renders page help as clear purpose, next step, and common mistake sections", () => {
    render(
      <PageHelpPanel
        help={{
          route: "/finance/dues",
          title: "Dues help",
          purpose: "This page creates charges for homeowners.",
          nextStep: "Start by checking the homeowner list.",
          commonMistake: "Do not create dues before homeowners are imported.",
          href: "/help/dues-and-assessments",
        }}
      />,
    );

    expect(screen.getByRole("region", { name: "Dues help" })).toBeDefined();
    expect(screen.getByText("What this page is for")).toBeInTheDocument();
    expect(screen.getByText("What to do next")).toBeInTheDocument();
    expect(screen.getByText("Common mistake")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open full guide" }),
    ).toHaveAttribute("href", "/help/dues-and-assessments");
  });

  it("shows help hints from an accessible question button", async () => {
    const user = userEvent.setup();

    render(
      <HelpHint
        help={{
          key: "dues.amount",
          label: "Amount",
          body: "Enter the amount each homeowner owes for this batch.",
        }}
      />,
    );

    await user.hover(screen.getByRole("button", { name: "Help: Amount" }));

    expect(
      await screen.findByRole("tooltip", {
        name: "Enter the amount each homeowner owes for this batch.",
      }),
    ).toBeInTheDocument();
  });

  it("renders empty states with a reason, next step, and action", () => {
    render(
      <FriendlyEmptyState
        title="No homeowners yet"
        reason="This is empty because no roster has been imported."
        nextStep="Import the roster before creating dues."
        action={<button type="button">Import CSV</button>}
      />,
    );

    expect(screen.getByText("No homeowners yet")).toBeInTheDocument();
    // Title is a level-2 heading so it does not skip from the page h1 (a11y).
    expect(
      screen.getByRole("heading", { name: "No homeowners yet", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Why this is empty")).toBeInTheDocument();
    expect(screen.getByText("Next step")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import CSV" }),
    ).toBeInTheDocument();
  });

  it("confirms irreversible actions without window.confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm");

    render(
      <ConfirmActionDialog
        trigger={<button type="button">Complete close</button>}
        title="Complete month-end close?"
        description="This locks the period so board records stay stable."
        confirmLabel="Complete close"
        onConfirm={onConfirm}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "Complete close" });
    await user.click(buttons[0]!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Complete close",
      }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
