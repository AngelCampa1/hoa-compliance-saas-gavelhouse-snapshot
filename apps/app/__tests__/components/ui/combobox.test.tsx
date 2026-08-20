import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Combobox } from "@/components/ui/combobox";
import type { ComboboxOption } from "@/components/ui/combobox";

const options: ComboboxOption[] = [
  { value: "1000", label: "1000 — Operating Checking" },
  { value: "1100", label: "1100 — Reserve Savings" },
  { value: "4000", label: "4000 — Assessment Revenue" },
];

function renderCombobox(
  props: Partial<React.ComponentProps<typeof Combobox>> = {},
) {
  const onChange = vi.fn();
  render(
    <Combobox
      aria-label="Account"
      options={options}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange };
}

describe("Combobox", () => {
  it("opens the listbox when the trigger is activated", async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole("combobox", { name: "Account" }));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("selects an option with the mouse", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    await user.click(screen.getByRole("option", { name: /Reserve Savings/ }));

    expect(onChange).toHaveBeenCalledWith("1100");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters options as the user types in the search box", async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    await user.keyboard("Reserve");

    const opts = screen.getAllByRole("option");
    expect(opts).toHaveLength(1);
    expect(opts[0]).toHaveTextContent("Reserve Savings");
  });

  it("lets a keyboard-only user move and select an option with arrows + Enter", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    // Search input is focused on open; arrow down activates first option,
    // a second arrow down moves to the second option, Enter selects it.
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("1100");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("exposes the active option via aria-activedescendant", async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    const search = screen.getByRole("textbox");
    expect(search).not.toHaveAttribute("aria-activedescendant");

    await user.keyboard("{ArrowDown}");
    const active = screen.getAllByRole("option")[0];
    expect(active.id).toBeTruthy();
    expect(search).toHaveAttribute("aria-activedescendant", active.id);
    expect(active).toHaveAttribute("aria-selected", "true");
  });

  it("wraps from the last option back to the first with ArrowDown", async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    const search = screen.getByRole("textbox");
    await user.keyboard("{ArrowUp}"); // ArrowUp from none -> last option
    const opts = screen.getAllByRole("option");
    expect(search).toHaveAttribute("aria-activedescendant", opts[2].id);

    await user.keyboard("{ArrowDown}"); // wrap to first
    expect(search).toHaveAttribute("aria-activedescendant", opts[0].id);
  });

  it("closes the listbox on Escape without selecting", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    await user.keyboard("{ArrowDown}{Escape}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not select anything when Enter is pressed with no active option", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    await user.keyboard("{Enter}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the selected label on the trigger and marks the option selected", async () => {
    const user = userEvent.setup();
    renderCombobox({ value: "4000" });

    const trigger = screen.getByRole("combobox", { name: "Account" });
    expect(trigger).toHaveTextContent("Assessment Revenue");

    await user.click(trigger);
    const selected = screen.getByRole("option", { name: /Assessment Revenue/ });
    expect(selected).toHaveAttribute("aria-selected", "true");
  });

  it("renders an empty-results state that is not a selectable option", async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    await user.keyboard("zzzzz");

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    const list = screen.getByRole("listbox");
    expect(within(list).getByText("No results found.")).toBeInTheDocument();
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    renderCombobox({ disabled: true });

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
