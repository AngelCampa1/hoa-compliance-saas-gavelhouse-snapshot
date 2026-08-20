import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TableSkeleton } from "@/components/ui/table-skeleton";

describe("TableSkeleton", () => {
  it("renders the correct number of rows", () => {
    const { container } = render(<TableSkeleton rows={4} columns={3} />);
    const rows = container.querySelectorAll("tr");
    // header row + 4 body rows
    expect(rows).toHaveLength(5);
  });

  it("renders the correct number of columns", () => {
    const { container } = render(<TableSkeleton rows={2} columns={5} />);
    const headerCells = container.querySelectorAll("th");
    expect(headerCells).toHaveLength(5);
  });

  it("defaults to 5 rows and 4 columns", () => {
    const { container } = render(<TableSkeleton />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(5);
  });

  it("applies custom className to the wrapper", () => {
    const { container } = render(<TableSkeleton className="test-class" />);
    expect(container.firstChild).toHaveClass("test-class");
  });
});
