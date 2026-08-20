import { describe, it, expect } from "vitest";
import { writeCsv } from "../../../src/domain/exports/csv";

describe("writeCsv", () => {
  it("produces a header-only output when rows array is empty", () => {
    const result = writeCsv(["Name", "Amount"], []);
    expect(result).toBe("Name,Amount");
  });

  it("produces header and one data row with CRLF separator", () => {
    const result = writeCsv(["Name", "Amount"], [["Reserves", 5000]]);
    expect(result).toBe("Name,Amount\r\nReserves,5000");
  });

  it("quotes a field that contains a comma", () => {
    const result = writeCsv(["Label"], [["Smith, John"]]);
    expect(result).toBe('Label\r\n"Smith, John"');
  });

  it("doubles embedded double-quotes inside a quoted field", () => {
    const result = writeCsv(["Note"], [['He said "hello"']]);
    expect(result).toBe('Note\r\n"He said ""hello"""');
  });

  it("quotes a field that contains a newline", () => {
    const result = writeCsv(["Desc"], [["line1\nline2"]]);
    expect(result).toBe('Desc\r\n"line1\nline2"');
  });

  it("converts null to an empty string", () => {
    const result = writeCsv(["A", "B"], [[null, "x"]]);
    expect(result).toBe("A,B\r\n,x");
  });

  it("converts undefined to an empty string", () => {
    const result = writeCsv(["A", "B"], [[undefined, "y"]]);
    expect(result).toBe("A,B\r\n,y");
  });

  it("prefixes formula-like cells before quoting", () => {
    const result = writeCsv(
      ["A", "B", "C", "D", "E"],
      [["=SUM(A1:A2)", "+10", "-20", "@cmd"," normal"]],
    );

    expect(result).toBe("A,B,C,D,E\r\n'=SUM(A1:A2),'+10,'-20,'@cmd, normal");
  });

  it("does not prefix negative numeric cells", () => {
    const result = writeCsv(["Amount"], [[-2000]]);

    expect(result).toBe("Amount\r\n-2000");
  });

  it("prefixes cells with leading whitespace before formula triggers", () => {
    const result = writeCsv(["Value"], [[" \t=cmd|'/C calc'!A0"]]);

    expect(result).toBe("Value\r\n' \t=cmd|'/C calc'!A0");
  });

  it("produces multiple data rows joined with CRLF", () => {
    const result = writeCsv(
      ["X", "Y"],
      [
        ["a", "b"],
        ["c", "d"],
      ],
    );
    expect(result).toBe("X,Y\r\na,b\r\nc,d");
  });
});
