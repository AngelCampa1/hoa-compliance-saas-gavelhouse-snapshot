import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LedgerFilters } from "@/components/reports/LedgerFilters";

describe("LedgerFilters", () => {
  const defaultProps = {
    from: "2026-01-01",
    to: "2026-01-31",
    onFromChange: vi.fn(),
    onToChange: vi.fn(),
    accountId: "",
    onAccountIdChange: vi.fn(),
    fundType: "",
    onFundTypeChange: vi.fn(),
  };

  it("renders from date input with current value", () => {
    render(<LedgerFilters {...defaultProps} />);
    // DatePicker renders <input type="date"> linked to a <Label>
    const fromInput = screen.getByLabelText("From") as HTMLInputElement;
    expect(fromInput.value).toBe("2026-01-01");
  });

  it("renders to date input with current value", () => {
    render(<LedgerFilters {...defaultProps} />);
    const toInput = screen.getByLabelText("To") as HTMLInputElement;
    expect(toInput.value).toBe("2026-01-31");
  });

  it("renders account ID input with current value", () => {
    render(<LedgerFilters {...defaultProps} accountId="acc-1" />);
    const input = screen.getByLabelText("Account ID") as HTMLInputElement;
    expect(input.value).toBe("acc-1");
    expect(input).toHaveAttribute("placeholder", "Account ID");
  });

  it("renders fund type combobox button", () => {
    render(<LedgerFilters {...defaultProps} fundType="operating" />);
    // Radix Select renders a <button role="combobox"> linked via aria-label
    expect(
      screen.getByRole("combobox", { name: "Fund Type" }),
    ).toBeInTheDocument();
  });

  it("calls onFromChange when from date changes", () => {
    const onFromChange = vi.fn();
    render(<LedgerFilters {...defaultProps} onFromChange={onFromChange} />);
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-02-01" },
    });
    expect(onFromChange).toHaveBeenCalledWith("2026-02-01");
  });

  it("calls onToChange when to date changes", () => {
    const onToChange = vi.fn();
    render(<LedgerFilters {...defaultProps} onToChange={onToChange} />);
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-02-28" },
    });
    expect(onToChange).toHaveBeenCalledWith("2026-02-28");
  });

  it("calls onAccountIdChange when account input changes", () => {
    const onAccountIdChange = vi.fn();
    render(
      <LedgerFilters {...defaultProps} onAccountIdChange={onAccountIdChange} />,
    );
    fireEvent.change(screen.getByLabelText("Account ID"), {
      target: { value: "acc-99" },
    });
    expect(onAccountIdChange).toHaveBeenCalledWith("acc-99");
  });

  it("shows Operating label text when operating is selected", () => {
    render(<LedgerFilters {...defaultProps} fundType="operating" />);
    expect(
      screen.getByRole("combobox", { name: "Fund Type" }),
    ).toHaveTextContent("Operating");
  });

  it("shows Reserve label text when reserve is selected", () => {
    render(<LedgerFilters {...defaultProps} fundType="reserve" />);
    expect(
      screen.getByRole("combobox", { name: "Fund Type" }),
    ).toHaveTextContent("Reserve");
  });

  it("shows All label text when fundType is empty string", () => {
    render(<LedgerFilters {...defaultProps} fundType="" />);
    expect(
      screen.getByRole("combobox", { name: "Fund Type" }),
    ).toHaveTextContent("All");
  });

  it("calls onFundTypeChange with empty string when All option is selected", async () => {
    const user = userEvent.setup();
    const onFundTypeChange = vi.fn();
    render(
      <LedgerFilters
        {...defaultProps}
        fundType="operating"
        onFundTypeChange={onFundTypeChange}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Fund Type" }));
    const allOption = await screen.findByRole("option", { name: "All" });
    await user.click(allOption);
    expect(onFundTypeChange).toHaveBeenCalledWith("");
  });

  it("calls onFundTypeChange with 'reserve' when Reserve option is selected", async () => {
    const user = userEvent.setup();
    const onFundTypeChange = vi.fn();
    render(
      <LedgerFilters
        {...defaultProps}
        fundType="operating"
        onFundTypeChange={onFundTypeChange}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Fund Type" }));
    const reserveOption = await screen.findByRole("option", {
      name: "Reserve",
    });
    await user.click(reserveOption);
    expect(onFundTypeChange).toHaveBeenCalledWith("reserve");
  });
});
