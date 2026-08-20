export function getCurrentYear(): number {
  return new Date().getFullYear();
}

export function formatArticleDate(dateString: string): string {
  // Append T00:00:00 for date-only strings to prevent UTC-to-local timezone shift
  const normalized = dateString.includes("T")
    ? dateString
    : `${dateString}T00:00:00`;
  return new Date(normalized).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function normalizeDateInput(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return value;
}
