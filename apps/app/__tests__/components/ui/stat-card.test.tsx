import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatCard } from "@/components/ui/stat-card";
import { SummaryStat } from "@/components/ui/stat-card";
import { DollarSign } from "lucide-react";

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Total Reserves" value="$42,000" />);
    expect(screen.getByText("Total Reserves")).toBeInTheDocument();
    expect(screen.getByText("$42,000")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <StatCard
        label="Reserves"
        value="$42,000"
        description="+5% from last month"
      />,
    );
    expect(screen.getByText("+5% from last month")).toBeInTheDocument();
  });

  it("does not render description when omitted", () => {
    const { queryByText } = render(
      <StatCard label="Reserves" value="$42,000" />,
    );
    expect(queryByText(/from last month/)).toBeNull();
  });

  it("renders icon when provided", () => {
    render(
      <StatCard
        label="Reserves"
        value="$42,000"
        icon={<DollarSign data-testid="icon" />}
      />,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <StatCard label="Reserves" value="$42,000" className="w-full" />,
    );
    expect(container.firstChild).toHaveClass("w-full");
  });

  it("renders meta, trend, and action content when provided", () => {
    render(
      <StatCard
        label="Reserve funding"
        value="72%"
        meta="Updated today"
        trend="5 points under target"
        action={<a href="/finance/reserves">Review reserve plan</a>}
      />,
    );

    expect(screen.getByText("Updated today")).toBeInTheDocument();
    expect(screen.getByText("5 points under target")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review reserve plan" }),
    ).toBeInTheDocument();
  });

  it("renders SummaryStat action content when provided", () => {
    render(
      <SummaryStat
        label="Next action"
        value="Review reserves"
        action={<button type="button">Open reserves</button>}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open reserves" }),
    ).toBeInTheDocument();
  });
});
