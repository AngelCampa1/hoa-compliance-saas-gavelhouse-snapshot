/**
 * Utility functions for computing common date period presets.
 * All dates returned as ISO 8601 strings (YYYY-MM-DD).
 */

export type PeriodPreset = {
  label: string;
  from: string;
  to: string;
};

export type SingleDatePreset = {
  label: string;
  asOf: string;
};

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns period presets relative to the provided reference date.
 * Defaults to today if no reference date is provided.
 */
export function getPeriodPresets(now: Date = new Date()): PeriodPreset[] {
  const year = now.getFullYear();
  const month = now.getMonth();

  // This month
  const thisMonthStart = new Date(year, month, 1);
  const thisMonthEnd = now;

  // Last month
  const lastMonthStart = new Date(year, month - 1, 1);
  const lastMonthEnd = new Date(year, month, 0); // last day of previous month

  // This quarter
  const quarterStartMonth = Math.floor(month / 3) * 3;
  const thisQuarterStart = new Date(year, quarterStartMonth, 1);
  const thisQuarterEnd = now;

  // Year to date
  const ytdStart = new Date(year, 0, 1);
  const ytdEnd = now;

  return [
    {
      label: "This Month",
      from: toISO(thisMonthStart),
      to: toISO(thisMonthEnd),
    },
    {
      label: "Last Month",
      from: toISO(lastMonthStart),
      to: toISO(lastMonthEnd),
    },
    {
      label: "This Quarter",
      from: toISO(thisQuarterStart),
      to: toISO(thisQuarterEnd),
    },
    {
      label: "YTD",
      from: toISO(ytdStart),
      to: toISO(ytdEnd),
    },
  ];
}

/**
 * Returns single-date presets (as-of date) relative to the provided reference date.
 */
export function getSingleDatePresets(
  now: Date = new Date(),
): SingleDatePreset[] {
  const year = now.getFullYear();
  const month = now.getMonth();

  // End of last month
  const endOfLastMonth = new Date(year, month, 0);

  return [
    {
      label: "This Month",
      asOf: toISO(now),
    },
    {
      label: "Last Month",
      asOf: toISO(endOfLastMonth),
    },
    {
      label: "This Quarter",
      asOf: toISO(now),
    },
    {
      // Year-to-date is an as-of date that runs through today, mirroring the
      // YTD range preset's end bound (getPeriodPresets uses `now`). Returning
      // last year's close would exclude the entire current year — the opposite
      // of year-to-date.
      label: "YTD",
      asOf: toISO(now),
    },
  ];
}
