/**
 * Central IST (India Standard Time, UTC+5:30, no DST) time handling.
 *
 * Every institution on this system is in India, so "what date/time is it
 * right now" must always mean IST — regardless of where the Node process
 * actually runs (production is UTC) or what timezone a browser is set to.
 * Before this module existed, code called `new Date()` directly and read
 * calendar components off it (or sliced `toISOString()`), which silently
 * used the *server's* timezone. On a UTC server that makes "today" wrong
 * for the whole IST morning (00:00-05:29 IST is still "yesterday" in UTC) -
 * e.g. attendance/assessment date defaults, dashboard "today" markers, and
 * month-picker defaults would all be one day behind for roughly 5.5 hours
 * every single day.
 *
 * Two separate concerns, two separate fixes:
 *
 *  1. "What calendar date/month/year is it right now?" — use `todayIST()`,
 *     `currentMonthIST()`, `nowISTYear()`, `daysAgoIST()`, `monthsAgoIST()`,
 *     `istWeekday()`. These anchor "now" to IST before reading any
 *     calendar component, so the result is correct no matter where the
 *     code runs.
 *
 *  2. "How should this stored timestamp be shown to a user?" — stored
 *     timestamps are (correctly) absolute instants in UTC ISO-8601; only
 *     the *display* needs to render in IST. Use `formatDateIST()` /
 *     `formatDateTimeIST()` / `formatTimeIST()`, which pin
 *     `timeZone: "Asia/Kolkata"` via Intl so the same instant always
 *     displays the same way for every reader, regardless of their own
 *     device's timezone.
 *
 * India does not observe DST, so IST's offset from UTC is always exactly
 * +5:30 - that fixed-offset fact is what makes the simple
 * `Date.now() + IST_OFFSET_MS` trick below safe and exact (no timezone
 * database needed for date-math; Intl is still used for display so that
 * locale-correct formatting - month names, 12h clock, etc. - comes for
 * free).
 */

const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * A Date object whose UTC-* getters (getUTCFullYear, getUTCMonth,
 * getUTCDate, getUTCDay, getUTCHours, getUTCMinutes) read as IST
 * wall-clock time for "now". Internal building block - prefer the
 * named helpers below at call sites; only reach for this directly when
 * doing date arithmetic (e.g. "N months before now") that isn't covered
 * yet. Never call its local getters (getFullYear, getMonth, ...) - those
 * still reflect the server/browser's own timezone, defeating the point.
 */
export function nowAsISTWallClock(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/** Today's date in IST, as "YYYY-MM-DD" - independent of server/browser timezone. */
export function todayIST(): string {
  const d = nowAsISTWallClock();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** The current month in IST, as "YYYY-MM". */
export function currentMonthIST(): string {
  const d = nowAsISTWallClock();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** The current year in IST. */
export function nowISTYear(): number {
  return nowAsISTWallClock().getUTCFullYear();
}

/** Day of week in IST for "now": 0=Sunday .. 6=Saturday (same convention as Date#getDay). */
export function istWeekday(): number {
  return nowAsISTWallClock().getUTCDay();
}

/** The date N days before today, in IST, as "YYYY-MM-DD". Use a negative n for "N days from now". */
export function daysAgoIST(n: number): string {
  const d = new Date(Date.now() + IST_OFFSET_MS - n * 86400000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** The month N months before the current IST month, as "YYYY-MM". Use a negative n for "N months from now". */
export function monthsAgoIST(n: number): string {
  const d = nowAsISTWallClock();
  d.setUTCMonth(d.getUTCMonth() - n);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** The most recent Monday on/before today, in IST, as "YYYY-MM-DD" (ISO week start). */
export function startOfWeekIST(): string {
  const d = nowAsISTWallClock();
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // ISO: Monday=1..Sunday=7
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** The 1st of the current IST month, as "YYYY-MM-DD". */
export function startOfMonthIST(): string {
  const d = nowAsISTWallClock();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
}

/**
 * Parses a value for IST-timezone-pinned formatting.
 * - A bare "YYYY-MM-DD" is a calendar date with no time component (attendance
 *   date, DOB, exam date, ...) and is always meant as an IST calendar date -
 *   it's parsed as IST midnight (`T00:00:00+05:30`) rather than routed
 *   through any ambient local timezone, so it renders as the same date
 *   everywhere regardless of server/browser timezone.
 * - Anything else (a full ISO timestamp, or a Date) is already an absolute
 *   instant and is used as-is; Intl + timeZone below handles the IST
 *   conversion for display.
 */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+05:30`);
  return new Date(value);
}

/** Format a date-only value for display in IST, e.g. "21 Sep 2026". */
export function formatDateIST(
  value: string | Date,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, ...opts }).format(toDate(value));
}

/** Format a timestamp for display in IST, e.g. "21 Sep 2026, 5:42 pm". */
export function formatDateTimeIST(
  value: string | Date,
  opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  },
): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, ...opts }).format(toDate(value));
}

/** Format only the time portion of a timestamp in IST, e.g. "5:42 pm". */
export function formatTimeIST(
  value: string | Date,
  opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true },
): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, ...opts }).format(toDate(value));
}
