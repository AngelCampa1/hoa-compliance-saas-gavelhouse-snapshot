import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

describe("modal overlays", () => {
  it("use the semantic overlay token instead of pure black", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Dialog</DialogTitle>
          <DialogDescription>Dialog content</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Sheet</SheetTitle>
          <SheetDescription>Sheet content</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByText("Dialog")).toBeInTheDocument();
    expect(screen.getByText("Sheet")).toBeInTheDocument();
    expect(document.querySelector("[data-slot='dialog-overlay']")).toHaveClass(
      "bg-overlay",
    );
    expect(document.querySelector("[data-slot='sheet-overlay']")).toHaveClass(
      "bg-overlay",
    );
    expect(
      document.querySelector("[data-slot='dialog-overlay']"),
    ).not.toHaveClass("bg-black/80");
    expect(
      document.querySelector("[data-slot='sheet-overlay']"),
    ).not.toHaveClass("bg-black/80");
  });
});
