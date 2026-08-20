import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  name: z.string().min(1, "Name is required"),
});

type FormValues = z.infer<typeof schema>;

function TestForm({
  onSubmit = () => {},
}: {
  onSubmit?: (v: FormValues) => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", name: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <input {...field} type="email" data-testid="email-input" />
              </FormControl>
              <FormDescription>Enter your work email</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <input {...field} data-testid="name-input" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Submit</button>
      </form>
    </Form>
  );
}

describe("Form primitives", () => {
  it("renders labels and inputs", () => {
    render(<TestForm />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByTestId("email-input")).toBeInTheDocument();
    expect(screen.getByTestId("name-input")).toBeInTheDocument();
  });

  it("renders FormDescription text", () => {
    render(<TestForm />);
    expect(screen.getByText("Enter your work email")).toBeInTheDocument();
  });

  it("shows validation errors after invalid submit", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Name is required")).toBeInTheDocument();
  });

  it("FormMessage renders error from zod", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    await user.type(screen.getByTestId("email-input"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
  });

  it("FormMessage has role=alert", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    await user.click(screen.getByRole("button", { name: /submit/i }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("FormLabel is associated with its input via htmlFor", () => {
    render(<TestForm />);
    const emailLabel = screen.getByText("Email").closest("label");
    const emailInput = screen.getByTestId("email-input");
    expect(emailLabel).toHaveAttribute("for", emailInput.id);
  });

  it("FormControl sets aria-invalid on error", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await screen.findByText("Enter a valid email");
    expect(screen.getByTestId("email-input")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("aria-describedby includes message id when field has error", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await screen.findByText("Enter a valid email");
    const input = screen.getByTestId("email-input");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toContain("-form-item-description");
    expect(describedBy).toContain("-form-item-message");
  });

  it("aria-describedby contains only description id when no error", () => {
    render(<TestForm />);
    const input = screen.getByTestId("email-input");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toContain("-form-item-description");
    expect(describedBy).not.toContain("-form-item-message");
  });

  it("calls onSubmit with valid data", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    render(<TestForm onSubmit={handleSubmit} />);
    await user.type(screen.getByTestId("email-input"), "test@example.com");
    await user.type(screen.getByTestId("name-input"), "Alice");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await vi.waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        { email: "test@example.com", name: "Alice" },
        expect.any(Object),
      );
    });
  });
});
