import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { US_STATES } from "@boardstack/shared";
import { StateSelect } from "@/components/ui/state-select";

/**
 * Radix Select in jsdom has layout limitations — the portal viewport height is
 * 0, so the full item list may not all be in the DOM simultaneously. Tests are
 * written to work with whatever items jsdom does render after the dropdown opens.
 */

describe("StateSelect", () => {
  it("renders a combobox trigger", () => {
    render(<StateSelect value="" onValueChange={() => {}} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows default placeholder when value is empty string", () => {
    render(<StateSelect value="" onValueChange={() => {}} />);
    expect(screen.getByText("Select a state")).toBeInTheDocument();
  });

  it("shows custom placeholder when provided", () => {
    render(
      <StateSelect
        value=""
        onValueChange={() => {}}
        placeholder="Pick a state"
      />,
    );
    expect(screen.getByText("Pick a state")).toBeInTheDocument();
  });

  it("displays the full state name in the trigger for a valid code", () => {
    render(<StateSelect value="CA" onValueChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("California");
  });

  it("displays the full state name in the trigger for Florida", () => {
    render(<StateSelect value="FL" onValueChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Florida");
  });

  it("displays District of Columbia for DC code", () => {
    render(<StateSelect value="DC" onValueChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent(
      "District of Columbia",
    );
  });

  it("is disabled when disabled prop is true", () => {
    render(<StateSelect value="" onValueChange={() => {}} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("forwards id to the trigger element", () => {
    render(<StateSelect value="" onValueChange={() => {}} id="state-field" />);
    expect(screen.getByRole("combobox")).toHaveAttribute("id", "state-field");
  });

  it("uses aria-label when provided", () => {
    render(
      <StateSelect
        value=""
        onValueChange={() => {}}
        aria-label="Community state"
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Community state" }),
    ).toBeInTheDocument();
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    render(<StateSelect value="" onValueChange={() => {}} disabled />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens the listbox when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<StateSelect value="" onValueChange={() => {}} />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("shows the placeholder item after opening", async () => {
    const user = userEvent.setup();
    render(<StateSelect value="" onValueChange={() => {}} />);
    await user.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0]).toHaveTextContent("Select a state");
  });

  it("calls onValueChange with the 2-letter code when an option is selected", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<StateSelect value="" onValueChange={handleChange} />);
    await user.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option");
    // Find any non-placeholder state option rendered by jsdom
    const stateOption = options.find(
      (o) => !o.textContent?.includes("Select a state"),
    );
    expect(stateOption).toBeDefined();
    fireEvent.click(stateOption!);
    expect(handleChange).toHaveBeenCalledTimes(1);
    const calledWith = handleChange.mock.calls[0][0] as string;
    expect(calledWith).toMatch(/^[A-Z]{2}$/);
  });

  it("calls onValueChange with empty string when the clear item is selected", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<StateSelect value="TX" onValueChange={handleChange} />);
    await user.click(screen.getByRole("combobox"));
    const clearOption = screen.getByText("Select a state");
    fireEvent.click(clearOption);
    expect(handleChange).toHaveBeenCalledWith("");
  });

  it("US_STATES has 51 entries (50 states + DC)", () => {
    expect(US_STATES).toHaveLength(51);
  });

  it("US_STATES is sorted alphabetically by label", () => {
    const labels = US_STATES.map((s) => s.label);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(sorted);
  });

  it("US_STATES entries have 2-letter uppercase value codes", () => {
    for (const state of US_STATES) {
      expect(state.value).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("US_STATES includes California with code CA", () => {
    const ca = US_STATES.find((s) => s.value === "CA");
    expect(ca).toBeDefined();
    expect(ca?.label).toBe("California");
  });
});
