/**
 * Pure helpers for the calendar view. No React, no imports — easy to unit-test.
 *
 * - Weeks start on Monday (Danish convention).
 * - All `YYYY-MM-DD` strings are interpreted in local time to match the rest of
 *   the codebase (ApiClubNight.date is a local-day string, never with offset).
 */

export type CalDay = {
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  /** True for every cell in the linear layout — kept for API compatibility. */
  inMonth: boolean;
  /** Day of week, 0 = Mon … 6 = Sun (Danish week order). */
  dow: number;
};

const MONTH_NAMES_DA = [
  "Januar",
  "Februar",
  "Marts",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "December",
];

const DAY_HEADERS_DA = ["M", "T", "O", "T", "F", "L", "S"];

const QUARTER_LABELS_DA = ["Q1", "Q2", "Q3", "Q4"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Sunday-is-0 → Monday-is-0 conversion. */
function dowMonFirst(d: Date): number {
  const sundayFirst = d.getDay();
  return (sundayFirst + 6) % 7;
}

/**
 * Linear day list for a given month — one entry per actual calendar day, from
 * the 1st through the last. Days are returned in order; `dow` is Monday-first
 * (0 = Mon … 6 = Sun).
 */
export function buildMonthDays(year: number, monthIdx: number): CalDay[] {
  const days: CalDay[] = [];
  // Day-0 of the next month is the last day of this month — gives the count.
  const last = new Date(year, monthIdx + 1, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, monthIdx, day);
    days.push({ date: toIsoDate(d), inMonth: true, dow: dowMonFirst(d) });
  }
  return days;
}

/**
 * ISO 8601 week number. Mirrors the algorithm used by Danish printed calendars.
 */
export function isoWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Thursday in current week decides the year of the ISO week.
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
}

export function getQuarter(d: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

export function quarterMonths(q: 1 | 2 | 3 | 4): [number, number, number] {
  const start = (q - 1) * 3;
  return [start, start + 1, start + 2];
}

export function monthNameDa(monthIdx: number): string {
  return MONTH_NAMES_DA[monthIdx];
}

export function quarterLabelDa(q: 1 | 2 | 3 | 4): string {
  return QUARTER_LABELS_DA[q - 1];
}

export function dayHeadersDa(): readonly string[] {
  return DAY_HEADERS_DA;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** 0 = Mon … 5 = Sat, 6 = Sun. True for Sat/Sun. */
export function isWeekendDow(dow: number): boolean {
  return dow >= 5;
}
