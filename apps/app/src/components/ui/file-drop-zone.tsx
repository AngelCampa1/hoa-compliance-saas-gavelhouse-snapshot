import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface FileDropZoneProps {
  accept: string;
  onFile: (file: File) => void;
  label?: string;
  sublabel?: string;
  disabled?: boolean;
  className?: string;
}

export function FileDropZone({
  accept,
  onFile,
  label = "Drop your file here",
  sublabel = "or click to browse",
  disabled,
  className,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    if (!disabled) {
      inputRef.current?.click();
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      onFile(file);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onFile(file);
    }
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={label ?? "Drop your file here"}
      onClick={handleClick}
      onKeyDown={(e) => {
        // Only activate on Enter or Space — the two standard activation keys
        // for button-role elements per ARIA authoring practices. Broader
        // patterns ("Unidentified", falsy key, "Spacebar") caused the OS file
        // picker to open on Tab navigation in some browsers (HIGH-APP-5).
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        isDragging ? "border-primary" : "border-muted-foreground/30",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:border-muted-foreground/50",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        aria-hidden="true"
      />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{sublabel}</p>
    </div>
  );
}
