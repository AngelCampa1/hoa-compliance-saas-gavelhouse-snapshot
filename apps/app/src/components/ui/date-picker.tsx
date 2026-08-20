/**
 * DatePicker — styled <input type="date"> wrapper using the Shadcn Input and Label.
 * date-fns and react-day-picker are not installed, so a full calendar widget is
 * deferred. This component provides consistent styling and accessibility today.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  error?: string;
  id?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
}

function DatePicker({
  value,
  onChange,
  label,
  error,
  id: idProp,
  disabled,
  min,
  max,
  className,
}: DatePickerProps) {
  const generatedId = React.useId();
  const id = idProp ?? generatedId;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange?.(e.target.value);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label !== undefined && <Label htmlFor={id}>{label}</Label>}
      <Input
        id={id}
        type="date"
        value={value ?? ""}
        onChange={handleChange}
        disabled={disabled}
        min={min}
        max={max}
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        className={cn(
          error && "border-destructive focus-visible:ring-destructive",
        )}
      />
      {error !== undefined && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export { DatePicker };
