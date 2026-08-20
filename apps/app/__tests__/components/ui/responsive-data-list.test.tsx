import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ResponsiveDataList,
  type ResponsiveDataListColumn,
} from "@/components/ui/responsive-data-list";

type Row = {
  id: string;
  homeowner: string;
  status: string;
  amount: string;
};

const columns: Array<ResponsiveDataListColumn<Row>> = [
  {
    key: "homeowner",
    header: "Homeowner",
    primary: true,
    render: (row) => row.homeowner,
  },
  {
    key: "status",
    header: "Status",
    render: (row) => row.status,
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    render: (row) => row.amount,
  },
];

const rows: Row[] = [
  {
    id: "row-1",
    homeowner: "Ava Martinez",
    status: "Past due",
    amount: "$150.00",
  },
];

describe("ResponsiveDataList", () => {
  it("renders a desktop table and mobile record cards from the same columns", () => {
    render(
      <ResponsiveDataList
        ariaLabel="Assessment status"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
      />,
    );

    expect(
      screen.getByRole("table", { name: "Assessment status" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Assessment status mobile list" }),
    ).toBeInTheDocument();

    const mobileCard = screen.getByRole("listitem", {
      name: "Ava Martinez",
    });
    expect(within(mobileCard).getByText("Past due")).toBeInTheDocument();
    expect(within(mobileCard).getByText("$150.00")).toBeInTheDocument();
  });

  it("renders a helpful empty state when there are no rows", () => {
    render(
      <ResponsiveDataList
        ariaLabel="Homeowners"
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        emptyTitle="No homeowners"
        emptyDescription="Import a roster to continue."
      />,
    );

    expect(screen.getByText("No homeowners")).toBeInTheDocument();
    expect(
      screen.getByText("Import a roster to continue."),
    ).toBeInTheDocument();
  });

  it("uses the first column as the primary mobile label when no primary column is set", () => {
    render(
      <ResponsiveDataList
        ariaLabel="Fallback primary"
        columns={columns.map(({ primary: _primary, ...column }) => column)}
        rows={rows}
        getRowKey={(row) => row.id}
      />,
    );

    expect(
      screen.getByRole("listitem", { name: "Ava Martinez" }),
    ).toBeInTheDocument();
  });

  it("renders actions in desktop rows and mobile cards", () => {
    render(
      <ResponsiveDataList
        ariaLabel="Assessment actions"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        renderActions={(row) => (
          <button type="button">Review {row.homeowner}</button>
        )}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Actions" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Review Ava Martinez" }),
    ).toHaveLength(2);
  });

  it("uses a custom action column label when provided", () => {
    render(
      <ResponsiveDataList
        ariaLabel="Assessment actions"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        actionLabel="Next step"
        renderActions={(row) => (
          <button type="button">Review {row.homeowner}</button>
        )}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Next step" }),
    ).toBeInTheDocument();
  });

  it("uses a default empty title when none is provided", () => {
    render(
      <ResponsiveDataList
        ariaLabel="Empty"
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
      />,
    );

    expect(screen.getByText("No records found")).toBeInTheDocument();
  });
});
