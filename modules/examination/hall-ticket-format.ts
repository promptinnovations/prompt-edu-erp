/** Pure display helpers for hall tickets — no database code, so client components may import this. */

/** "10:00" -> "10:00 AM". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
