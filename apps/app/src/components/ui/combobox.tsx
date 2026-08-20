/**
 * Combobox — searchable dropdown.
 * cmdk is not installed, so this is implemented with a controlled Input +
 * filtered dropdown list in a positioned div. Full cmdk/Popover+Command
 * variant can replace this once cmdk is added to the project.
 */
import * as React from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled = false,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  // Index of the keyboard-active option within `filtered`; -1 means none.
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const baseId = React.useId();

  const selectedLabel = options.find((o) => o.value === value)?.label;

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const optionId = (index: number) => `${baseId}-option-${index}`;
  const activeOptionId =
    activeIndex >= 0 && activeIndex < filtered.length
      ? optionId(activeIndex)
      : undefined;

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // Keep the keyboard-active option scrolled into view.
  React.useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(
      `#${CSS.escape(optionId(activeIndex))}`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function openMenu() {
    setSearch("");
    // Pre-highlight the current value so keyboard users start from it.
    const selectedIndex = options.findIndex((o) => o.value === value);
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setSearch("");
    setActiveIndex(-1);
  }

  function handleSelect(option: ComboboxOption) {
    onChange?.(option.value);
    closeMenu();
  }

  function handleSearchChange(next: string) {
    setSearch(next);
    // Filtering changes the option set; drop the stale active index.
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      closeMenu();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        filtered.length === 0 ? -1 : (prev + 1) % filtered.length,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        filtered.length === 0 ? -1 : (prev <= 0 ? filtered.length : prev) - 1,
      );
    } else if (e.key === "Home") {
      if (filtered.length === 0) return;
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      if (filtered.length === 0) return;
      e.preventDefault();
      setActiveIndex(filtered.length - 1);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < filtered.length) {
        e.preventDefault();
        handleSelect(filtered[activeIndex]);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        className={cn(
          "flex min-h-11 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn(!selectedLabel && "text-muted-foreground")}>
          {selectedLabel ?? placeholder}
        </span>
        <ChevronDown
          className="h-4 w-4 opacity-50 shrink-0"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="p-1">
            <Input
              autoFocus
              aria-controls={`${baseId}-listbox`}
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="text-sm"
            />
          </div>
          <ul
            ref={listRef}
            id={`${baseId}-listbox`}
            role="listbox"
            className="max-h-60 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li className="py-2 px-2 text-sm text-muted-foreground text-center">
                No results found.
              </li>
            ) : (
              filtered.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => handleSelect(option)}
                  onPointerMove={() => setActiveIndex(index)}
                  className={cn(
                    "relative flex min-h-11 cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none",
                    index === activeIndex && "bg-accent text-accent-foreground",
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export { Combobox };
