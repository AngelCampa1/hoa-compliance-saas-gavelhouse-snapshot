import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Sentinel used internally so Radix Select doesn't reject an empty string value. */
const ALL_FUND_TYPES = "__all__";

type Props = {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  accountId: string;
  onAccountIdChange: (v: string) => void;
  fundType: string;
  onFundTypeChange: (v: string) => void;
};

export function LedgerFilters({
  from,
  to,
  onFromChange,
  onToChange,
  accountId,
  onAccountIdChange,
  fundType,
  onFundTypeChange,
}: Props) {
  // Map empty string → sentinel for Radix; map sentinel → empty string on change
  const selectValue = fundType === "" ? ALL_FUND_TYPES : fundType;

  function handleFundTypeChange(v: string) {
    onFundTypeChange(v === ALL_FUND_TYPES ? "" : v);
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <DatePicker label="From" value={from} onChange={onFromChange} />
      <DatePicker label="To" value={to} onChange={onToChange} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ledger-account">Account ID</Label>
        <Input
          id="ledger-account"
          type="text"
          value={accountId}
          onChange={(e) => onAccountIdChange(e.target.value)}
          placeholder="Account ID"
          className="max-w-48"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ledger-fund-type-trigger">Fund Type</Label>
        <Select value={selectValue} onValueChange={handleFundTypeChange}>
          <SelectTrigger
            id="ledger-fund-type-trigger"
            className="w-40"
            aria-label="Fund Type"
          >
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FUND_TYPES}>All</SelectItem>
            <SelectItem value="operating">Operating</SelectItem>
            <SelectItem value="reserve">Reserve</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
