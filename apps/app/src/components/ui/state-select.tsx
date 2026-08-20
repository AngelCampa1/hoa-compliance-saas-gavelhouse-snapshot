import { US_STATES } from "@boardstack/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface StateSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * Sentinel value used internally so Radix Select can represent an empty / no
 * selection without crashing (Radix forbids empty-string item values). When the
 * user picks this item the component emits "" to the caller.
 */
const CLEAR_SENTINEL = "__clear__";

export function StateSelect({
  value,
  onValueChange,
  placeholder = "Select a state",
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: StateSelectProps) {
  const selectValue = value === "" ? CLEAR_SENTINEL : value;

  function handleValueChange(v: string) {
    onValueChange(v === CLEAR_SENTINEL ? "" : v);
  }

  return (
    <Select
      value={selectValue}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CLEAR_SENTINEL}>{placeholder}</SelectItem>
        {US_STATES.map((state) => (
          <SelectItem key={state.value} value={state.value}>
            {state.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
