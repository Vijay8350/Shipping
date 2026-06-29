/**
 * Estimated delivery date math (pure, unit-tested). Given a base date and a transit-day
 * window, produce the EDD range. Used by the storefront EDD surface (CLAUDE.md §10).
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** Format as "DD MMM YYYY" (the storefront default). */
export function formatEddDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  return `${dd} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export interface EddRange {
  minDays: number;
  maxDays: number;
  minDate: string;
  maxDate: string;
  label: string;
}

export function eddRange(base: Date, minDays: number, maxDays: number): EddRange {
  const lo = Math.max(0, Math.min(minDays, maxDays));
  const hi = Math.max(minDays, maxDays);
  const minDate = formatEddDate(addDays(base, lo));
  const maxDate = formatEddDate(addDays(base, hi));
  return {
    minDays: lo,
    maxDays: hi,
    minDate,
    maxDate,
    label: lo === hi ? `Arrives by ${maxDate}` : `Arrives ${minDate} – ${maxDate}`,
  };
}
