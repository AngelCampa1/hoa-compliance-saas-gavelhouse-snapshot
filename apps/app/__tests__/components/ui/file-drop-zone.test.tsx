import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FileDropZone } from "@/components/ui/file-drop-zone";

function makeFile(name = "test.csv", type = "text/csv"): File {
  return new File(["col1,col2\n1,2"], name, { type });
}

describe("FileDropZone", () => {
  it("renders with default label and sublabel", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    expect(screen.getByText("Drop your file here")).toBeInTheDocument();
    expect(screen.getByText("or click to browse")).toBeInTheDocument();
  });

  it("renders custom label and sublabel", () => {
    render(
      <FileDropZone
        accept=".json"
        onFile={() => {}}
        label="Upload your JSON"
        sublabel="max 10 MB"
      />,
    );
    expect(screen.getByText("Upload your JSON")).toBeInTheDocument();
    expect(screen.getByText("max 10 MB")).toBeInTheDocument();
  });

  it("clicking the zone triggers the hidden file input", async () => {
    const user = userEvent.setup();
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("calls onFile when a file is chosen via the input", async () => {
    const user = userEvent.setup();
    const handleFile = vi.fn();
    render(<FileDropZone accept=".csv" onFile={handleFile} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = makeFile();
    await user.upload(input, file);
    expect(handleFile).toHaveBeenCalledWith(file);
  });

  it("adds border-primary class on dragOver", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    const zone = screen.getByRole("button");
    expect(zone.className).not.toContain("border-primary");
    fireEvent.dragOver(zone, { preventDefault: vi.fn() });
    expect(zone.className).toContain("border-primary");
  });

  it("removes border-primary class on dragLeave when relatedTarget is outside the zone", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    const zone = screen.getByRole("button");
    fireEvent.dragOver(zone, { preventDefault: vi.fn() });
    expect(zone.className).toContain("border-primary");
    fireEvent.dragLeave(zone, { relatedTarget: null });
    expect(zone.className).not.toContain("border-primary");
  });

  it("does NOT clear isDragging on dragLeave when relatedTarget is inside the zone", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    const zone = screen.getByRole("button");
    fireEvent.dragOver(zone, { preventDefault: vi.fn() });
    expect(zone.className).toContain("border-primary");
    // jsdom DragEvent does not propagate relatedTarget through React synthetic events,
    // so we stub zone.contains to return true (simulating cursor moving to a child).
    const containsSpy = vi.spyOn(zone, "contains").mockReturnValue(true);
    fireEvent.dragLeave(zone);
    // isDragging should remain true — border-primary must still be present
    expect(zone.className).toContain("border-primary");
    containsSpy.mockRestore();
  });

  it("calls onFile with dropped file on drop", () => {
    const handleFile = vi.fn();
    render(<FileDropZone accept=".csv" onFile={handleFile} />);
    const zone = screen.getByRole("button");
    const file = makeFile();
    fireEvent.drop(zone, {
      preventDefault: vi.fn(),
      dataTransfer: { files: [file] },
    });
    expect(handleFile).toHaveBeenCalledWith(file);
  });

  it("clears dragging state after drop", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    const zone = screen.getByRole("button");
    fireEvent.dragOver(zone, { preventDefault: vi.fn() });
    fireEvent.drop(zone, {
      preventDefault: vi.fn(),
      dataTransfer: { files: [makeFile()] },
    });
    expect(zone.className).not.toContain("border-primary");
  });

  it("does not call onFile on drop when no files in dataTransfer", () => {
    const handleFile = vi.fn();
    render(<FileDropZone accept=".csv" onFile={handleFile} />);
    const zone = screen.getByRole("button");
    fireEvent.drop(zone, {
      preventDefault: vi.fn(),
      dataTransfer: { files: [] },
    });
    expect(handleFile).not.toHaveBeenCalled();
  });

  it("applies disabled styling when disabled", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} disabled />);
    const zone = screen.getByRole("button");
    expect(zone.className).toContain("opacity-50");
    expect(zone.className).toContain("cursor-not-allowed");
    expect(zone).toHaveAttribute("aria-disabled", "true");
    expect(zone).toHaveAttribute("tabIndex", "-1");
  });

  it("does not trigger file input click when disabled", async () => {
    const user = userEvent.setup();
    render(<FileDropZone accept=".csv" onFile={() => {}} disabled />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button"));
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("does not call onFile on dragOver when disabled", () => {
    const handleFile = vi.fn();
    render(<FileDropZone accept=".csv" onFile={handleFile} disabled />);
    const zone = screen.getByRole("button");
    fireEvent.dragOver(zone, { preventDefault: vi.fn() });
    // isDragging should NOT be set when disabled
    expect(zone.className).not.toContain("border-primary");
  });

  it("does not call onFile on drop when disabled", () => {
    const handleFile = vi.fn();
    render(<FileDropZone accept=".csv" onFile={handleFile} disabled />);
    const zone = screen.getByRole("button");
    fireEvent.drop(zone, {
      preventDefault: vi.fn(),
      dataTransfer: { files: [makeFile()] },
    });
    expect(handleFile).not.toHaveBeenCalled();
  });

  it("applies custom className", () => {
    render(
      <FileDropZone
        accept=".csv"
        onFile={() => {}}
        className="my-custom-class"
      />,
    );
    expect(screen.getByRole("button").className).toContain("my-custom-class");
  });

  it("activates on Enter keydown", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    const zone = screen.getByRole("button");
    fireEvent.keyDown(zone, { key: "Enter" });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("activates on Space keydown", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    const zone = screen.getByRole("button");
    fireEvent.keyDown(zone, { key: " " });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT activate on Unidentified key (HIGH-APP-5 regression guard)", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    const zone = screen.getByRole("button");
    fireEvent.keyDown(zone, { key: "Unidentified" });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("does NOT activate on falsy key (HIGH-APP-5 regression guard)", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    const zone = screen.getByRole("button");
    fireEvent.keyDown(zone, { key: "" });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("does not activate on other key keydown", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    const zone = screen.getByRole("button");
    fireEvent.keyDown(zone, { key: "Tab" });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("does not call onFile when handleChange fires with no files", () => {
    const handleFile = vi.fn();
    render(<FileDropZone accept=".csv" onFile={handleFile} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    // Simulate change event with empty FileList
    fireEvent.change(input, { target: { files: [] } });
    expect(handleFile).not.toHaveBeenCalled();
  });

  it("hidden input has correct accept attribute", () => {
    render(<FileDropZone accept=".csv,.json" onFile={() => {}} />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toHaveAttribute("accept", ".csv,.json");
  });

  it("zone has aria-label with the default label text", () => {
    render(<FileDropZone accept=".csv" onFile={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Drop your file here",
    );
  });

  it("zone has aria-label with a custom label", () => {
    render(
      <FileDropZone accept=".csv" onFile={() => {}} label="Upload CSV file" />,
    );
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Upload CSV file",
    );
  });
});
