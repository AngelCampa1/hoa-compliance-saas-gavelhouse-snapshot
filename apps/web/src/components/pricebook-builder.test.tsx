import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { PricebookBuilder } from "./pricebook-builder";

vi.mock("../lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

import { trackEvent } from "../lib/analytics";

const defaultProps = {
  productName: "Gavelhouse",
  trialUrl: "/#pricing",
  apiUrl: "https://api.test",
  trades: [
    { value: "hvac", label: "HVAC" },
    { value: "plumbing", label: "Plumbing" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("PricebookBuilder", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      render(<PricebookBuilder {...defaultProps} />);
      expect(screen.getByText("HVAC")).toBeDefined();
      expect(screen.getByText("Plumbing")).toBeDefined();
    });

    it("renders trade selector buttons", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const hvacBtn = screen.getByRole("button", { name: /hvac/i });
      const plumbingBtn = screen.getByRole("button", { name: /plumbing/i });
      expect(hvacBtn).toBeDefined();
      expect(plumbingBtn).toBeDefined();
    });

    it("renders labor rate input with correct label", () => {
      render(<PricebookBuilder {...defaultProps} />);
      expect(screen.getByLabelText(/billable rate/i)).toBeDefined();
    });

    it("renders parts markup input", () => {
      render(<PricebookBuilder {...defaultProps} />);
      expect(screen.getByLabelText(/parts markup/i)).toBeDefined();
    });

    it("renders after-hours multiplier input", () => {
      render(<PricebookBuilder {...defaultProps} />);
      expect(screen.getByLabelText(/after-hours multiplier/i)).toBeDefined();
    });

    it("renders email input with correct label", () => {
      render(<PricebookBuilder {...defaultProps} />);
      expect(screen.getByLabelText(/your email.*pdf/i)).toBeDefined();
    });

    it("renders download button", () => {
      render(<PricebookBuilder {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /get the pdf/i }),
      ).toBeDefined();
    });

    it("shows HVAC categories in results table", () => {
      render(<PricebookBuilder {...defaultProps} />);
      // HVAC has these categories
      expect(screen.getByText("Electrical")).toBeDefined();
      expect(screen.getByText("Motors")).toBeDefined();
    });

    it("shows task count", () => {
      render(<PricebookBuilder {...defaultProps} />);
      expect(screen.getByText(/repairs priced/i)).toBeDefined();
    });

    it("shows prices formatted with $ prefix", () => {
      render(<PricebookBuilder {...defaultProps} />);
      // All prices should show $ sign somewhere in the results
      const dollars = screen.getAllByText(/^\$\d+$/);
      expect(dollars.length).toBeGreaterThan(0);
    });

    it("uses surface-primary token for input backgrounds", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const laborInput = screen.getByLabelText(/billable rate/i);
      const partsInput = screen.getByLabelText(/parts markup/i);
      const afterHoursInput = screen.getByLabelText(/after-hours multiplier/i);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      expect(laborInput.className).toContain("--surface-primary");
      expect(partsInput.className).toContain("--surface-primary");
      expect(afterHoursInput.className).toContain("--surface-primary");
      expect(emailInput.className).toContain("--surface-primary");
    });

    it("selected trade button uses --color-brand-primary token", () => {
      render(<PricebookBuilder {...defaultProps} />);
      // HVAC is selected by default (first trade)
      const hvacBtn = screen.getByRole("button", { name: /hvac/i });
      expect(hvacBtn.className).toContain("--color-brand-primary");
    });

    it("category label uses --color-brand-primary token", () => {
      render(<PricebookBuilder {...defaultProps} />);
      // Category labels are rendered as <td> with the brand-primary class
      const electricalCell = screen.getByText("Electrical");
      expect(electricalCell.className).toContain("--color-brand-primary");
    });
  });

  describe("trade selector", () => {
    it("defaults to HVAC trade", () => {
      render(<PricebookBuilder {...defaultProps} />);
      // HVAC-specific category
      expect(screen.getByText("Controls")).toBeDefined();
      expect(screen.getByText("Refrigerant")).toBeDefined();
    });

    it("switches to Plumbing when Plumbing button is clicked", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const plumbingBtn = screen.getByRole("button", { name: /plumbing/i });
      fireEvent.click(plumbingBtn);
      // Plumbing-specific categories
      expect(screen.getByText("Fixtures")).toBeDefined();
      expect(screen.getByText("Water Heater")).toBeDefined();
    });

    it("shows HVAC categories after switching back from Plumbing", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const plumbingBtn = screen.getByRole("button", { name: /plumbing/i });
      fireEvent.click(plumbingBtn);
      const hvacBtn = screen.getByRole("button", { name: /hvac/i });
      fireEvent.click(hvacBtn);
      expect(screen.getByText("Electrical")).toBeDefined();
    });

    it("calls trackEvent when trade changes", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const plumbingBtn = screen.getByRole("button", { name: /plumbing/i });
      fireEvent.click(plumbingBtn);
      expect(trackEvent).toHaveBeenCalledWith(
        "pricebook_builder_inputs_changed",
        expect.objectContaining({ trade: "plumbing" }),
      );
    });
  });

  describe("inputs", () => {
    it("updates labor rate when input changes", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const laborInput = screen.getByLabelText(/billable rate/i);
      fireEvent.change(laborInput, { target: { value: "150" } });
      expect((laborInput as HTMLInputElement).value).toBe("150");
    });

    it("calls trackEvent when labor rate changes", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const laborInput = screen.getByLabelText(/billable rate/i);
      fireEvent.change(laborInput, { target: { value: "150" } });
      expect(trackEvent).toHaveBeenCalledWith(
        "pricebook_builder_inputs_changed",
        expect.objectContaining({ labor_rate: 150 }),
      );
    });

    it("updates parts markup when input changes", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const markupInput = screen.getByLabelText(/parts markup/i);
      fireEvent.change(markupInput, { target: { value: "2.5" } });
      expect((markupInput as HTMLInputElement).value).toBe("2.5");
    });

    it("calls trackEvent when parts markup changes", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const markupInput = screen.getByLabelText(/parts markup/i);
      fireEvent.change(markupInput, { target: { value: "2.5" } });
      expect(trackEvent).toHaveBeenCalledWith(
        "pricebook_builder_inputs_changed",
        expect.objectContaining({ parts_markup: 2.5 }),
      );
    });

    it("updates after-hours multiplier when input changes", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const ahInput = screen.getByLabelText(/after-hours multiplier/i);
      fireEvent.change(ahInput, { target: { value: "2.0" } });
      expect((ahInput as HTMLInputElement).value).toBe("2.0");
    });

    it("calls trackEvent when after-hours multiplier changes", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const ahInput = screen.getByLabelText(/after-hours multiplier/i);
      fireEvent.change(ahInput, { target: { value: "2.0" } });
      expect(trackEvent).toHaveBeenCalledWith(
        "pricebook_builder_inputs_changed",
        expect.objectContaining({
          trade: "hvac",
          labor_rate: 120,
          parts_markup: 3,
        }),
      );
    });
  });

  describe("results table", () => {
    it("shows plumbing categories after trade switch", () => {
      render(<PricebookBuilder {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /plumbing/i }));
      expect(screen.getByText("Drain")).toBeDefined();
      expect(screen.getByText("Pipes")).toBeDefined();
    });

    it("shows after-hours prices in table", () => {
      render(<PricebookBuilder {...defaultProps} />);
      // With default 1.5x multiplier, after-hours prices exist
      const headers = screen.getAllByText(/after.hours/i);
      expect(headers.length).toBeGreaterThan(0);
    });

    it("shows standard price column header", () => {
      render(<PricebookBuilder {...defaultProps} />);
      expect(screen.getByText(/standard/i)).toBeDefined();
    });
  });

  describe("email gate - validation", () => {
    it("shows error on empty email submit", async () => {
      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      // Use fireEvent.submit on the form to bypass JSDOM's required constraint
      // check, which prevents onSubmit from firing when the field is empty.
      // Our custom JS validation in handleDownload shows the error message.
      fireEvent.submit(emailInput.closest("form")!);
      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeDefined();
      });
    });

    it("shows error on invalid email format", async () => {
      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      // Use a value that passes HTML type="email" native validation but fails our strict regex
      fireEvent.change(emailInput, { target: { value: "test@" } });
      fireEvent.submit(emailInput.closest("form")!);
      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeDefined();
      });
    });

    it("clears email error when user starts typing a new email", async () => {
      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      // Submit with empty to trigger error
      fireEvent.submit(emailInput.closest("form")!);
      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeDefined();
      });
      fireEvent.change(emailInput, { target: { value: "good@example.com" } });
      await waitFor(() => {
        expect(screen.queryByText(/valid email/i)).toBeNull();
      });
    });
  });

  describe("email gate - submission", () => {
    it("calls fetch with correct payload on valid email submit", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      fireEvent.change(emailInput, { target: { value: "tech@hvac.com" } });
      fireEvent.click(screen.getByRole("button", { name: /get the pdf/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "https://api.test/waitlist/subscribe",
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
              "Content-Type": "application/json",
            }),
            body: expect.stringContaining("pricebook-builder"),
          }),
        );
      });

      const callBody = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as {
        email: string;
        sourcePage: string;
      };
      expect(callBody.email).toBe("tech@hvac.com");
      expect(callBody.sourcePage).toBe("pricebook-builder");
    });

    it("shows loading state while fetching", async () => {
      let resolve: (value: unknown) => void;
      const pendingFetch = new Promise((res) => {
        resolve = res;
      });
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(pendingFetch));

      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      fireEvent.change(emailInput, { target: { value: "tech@hvac.com" } });
      fireEvent.click(screen.getByRole("button", { name: /get the pdf/i }));

      await waitFor(() => {
        // While loading, the button text changes to "Sending…"
        expect(screen.getByText(/sending/i)).toBeDefined();
      });

      await act(async () => {
        resolve!({ ok: true });
      });
    });

    it("shows success message after successful submit", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      fireEvent.change(emailInput, { target: { value: "tech@hvac.com" } });
      fireEvent.click(screen.getByRole("button", { name: /get the pdf/i }));

      await waitFor(() => {
        expect(screen.getByText(/your pricebook is on the way/i)).toBeDefined();
      });
    });

    it("shows CTA after success", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      fireEvent.change(emailInput, { target: { value: "tech@hvac.com" } });
      fireEvent.click(screen.getByRole("button", { name: /get the pdf/i }));

      await waitFor(() => {
        expect(screen.getByText(/start trial/i)).toBeDefined();
        expect(
          screen.getByRole("link", { name: /start trial/i }),
        ).toBeDefined();
      });
    });

    it("shows generic error on fetch failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      fireEvent.change(emailInput, { target: { value: "tech@hvac.com" } });
      fireEvent.click(screen.getByRole("button", { name: /get the pdf/i }));

      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeDefined();
      });
    });

    it("shows generic error on network exception", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network")));

      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      fireEvent.change(emailInput, { target: { value: "tech@hvac.com" } });
      fireEvent.click(screen.getByRole("button", { name: /get the pdf/i }));

      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeDefined();
      });
    });

    it("calls trackEvent with pricebook_pdf_requested on success", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      fireEvent.change(emailInput, { target: { value: "tech@hvac.com" } });
      fireEvent.click(screen.getByRole("button", { name: /get the pdf/i }));

      await waitFor(() => {
        expect(trackEvent).toHaveBeenCalledWith(
          "pricebook_pdf_requested",
          expect.objectContaining({ email_provided: true }),
        );
      });
    });

    it("uses apiUrl prop to construct fetch URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      render(
        <PricebookBuilder
          {...defaultProps}
          apiUrl="https://custom-api.example"
        />,
      );
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      fireEvent.change(emailInput, { target: { value: "tech@hvac.com" } });
      fireEvent.click(screen.getByRole("button", { name: /get the pdf/i }));

      await waitFor(() => {
        const calledUrl = (mockFetch.mock.calls[0] as [string])[0];
        expect(calledUrl).toBe("https://custom-api.example/waitlist/subscribe");
      });
    });

    it("shows custom copy overrides in success state", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

      render(
        <PricebookBuilder
          {...defaultProps}
          copy={{
            downloadSuccess: "Custom success!",
            trialPrompt: "Try {productName} today.",
            trialCtaText: "Custom CTA →",
          }}
        />,
      );
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      fireEvent.change(emailInput, { target: { value: "tech@hvac.com" } });
      fireEvent.click(screen.getByRole("button", { name: /get the pdf/i }));

      await waitFor(() => {
        expect(screen.getByText("Custom success!")).toBeDefined();
        expect(screen.getByText("Try Gavelhouse today.")).toBeDefined();
        expect(screen.getByText("Custom CTA →")).toBeDefined();
      });
    });

    it("submit button is disabled in success state", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

      render(<PricebookBuilder {...defaultProps} />);
      const emailInput = screen.getByLabelText(/your email.*pdf/i);
      fireEvent.change(emailInput, { target: { value: "tech@hvac.com" } });
      fireEvent.click(screen.getByRole("button", { name: /get the pdf/i }));

      await waitFor(() => {
        expect(screen.getByText(/your pricebook is on the way/i)).toBeDefined();
      });

      // After success the submit button should not be present or be disabled
      const submitBtn = screen.queryByRole("button", {
        name: /get the pdf/i,
      });
      // Either the button is gone or disabled
      if (submitBtn) {
        expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
      }
    });
  });

  describe("trades parameterization", () => {
    it("renders custom trade buttons from trades prop", () => {
      render(
        <PricebookBuilder
          {...defaultProps}
          trades={[
            { value: "hvac", label: "Heating/Cooling" },
            { value: "plumbing", label: "Plumbing/Gas" },
          ]}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Heating/Cooling" }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", { name: "Plumbing/Gas" }),
      ).toBeDefined();
    });

    it("defaults to first trade in the array", () => {
      render(
        <PricebookBuilder
          {...defaultProps}
          trades={[
            { value: "plumbing", label: "Plumbing" },
            { value: "hvac", label: "HVAC" },
          ]}
        />,
      );
      // Plumbing is first, so plumbing categories should appear
      expect(screen.getByText("Fixtures")).toBeDefined();
    });

    it("renders custom download button text from copy prop", () => {
      render(
        <PricebookBuilder
          {...defaultProps}
          copy={{ downloadCtaText: "Download Now" }}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Download Now" }),
      ).toBeDefined();
    });

    it("renders custom download label from copy prop", () => {
      render(
        <PricebookBuilder
          {...defaultProps}
          copy={{ downloadLabel: "Enter your work email" }}
        />,
      );
      expect(screen.getByLabelText("Enter your work email")).toBeDefined();
    });

    it("renders custom repairs priced label from copy prop", () => {
      render(
        <PricebookBuilder
          {...defaultProps}
          copy={{ repairsPricedLabel: "{count} tasks ready" }}
        />,
      );
      expect(screen.getByText(/tasks ready/i)).toBeDefined();
    });
  });

  describe("WCAG 1.3.5 autocomplete & required", () => {
    it("email input has autoComplete='email'", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const input = screen.getByLabelText(/your email.*pdf/i);
      expect(input.getAttribute("autocomplete")).toBe("email");
    });

    it("email input has required attribute", () => {
      render(<PricebookBuilder {...defaultProps} />);
      const input = screen.getByLabelText(/your email.*pdf/i);
      expect((input as HTMLInputElement).required).toBe(true);
    });
  });
});
