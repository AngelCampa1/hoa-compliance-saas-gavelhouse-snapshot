import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FormError } from "@/components/ui/form-error";

describe("FormError", () => {
  it("renders nothing when message is undefined", () => {
    const { container } = render(<FormError />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when message is empty string", () => {
    const { container } = render(<FormError message="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the message text", () => {
    render(<FormError message="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("has role alert", () => {
    render(<FormError message="Error!" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<FormError message="Error" className="mt-2" />);
    expect(screen.getByRole("alert")).toHaveClass("mt-2");
  });
});
