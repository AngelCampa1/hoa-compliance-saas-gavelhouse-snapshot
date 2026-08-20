import { z } from "zod";

/**
 * Returns the number of days in the given month of the given year,
 * accounting for leap years.
 */
function daysInMonth(year: number, month: number): number {
  // Using day=0 of next month gives the last day of this month
  return new Date(year, month, 0).getDate();
}

/**
 * Zod schema for a year-month string in YYYY-MM format where month is
 * a real calendar month (01–12).
 */
export const yearMonthString = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Must be in YYYY-MM format")
  .refine((val) => {
    const month = parseInt(val.slice(5, 7), 10);
    return month >= 1 && month <= 12;
  }, "Month must be between 01 and 12");

/**
 * Zod schema for a calendar date string in YYYY-MM-DD format where the
 * date is a real calendar date (e.g. rejects Feb 30, month 13, day 0).
 * Does NOT rely solely on Date rollover — validates month and day bounds
 * directly.
 */
export const calendarDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format")
  .refine((val) => {
    const year = parseInt(val.slice(0, 4), 10);
    const month = parseInt(val.slice(5, 7), 10);
    const day = parseInt(val.slice(8, 10), 10);
    if (month < 1 || month > 12) return false;
    if (day < 1) return false;
    return day <= daysInMonth(year, month);
  }, "Must be a valid calendar date");
