/**
 * Colour roles for the student/parent portal visuals (§Student-portal-
 * visual-redesign). Categorical colours come from the app's validated
 * chart palette (app/components/charts/series.ts, fixed slot order — a
 * colour follows the entity, never its rank). Grade colours always come
 * from the institution's own grade_bands.color, passed in as data.
 */
import { CHART_SERIES, seriesColor } from "../../charts/series";

export { CHART_SERIES, seriesColor };

/** Attendance states — reserved for status, never reused as a series
 *  colour, and always shown with a text label / legend. */
export const STATUS_COLOR = {
  present: "#1baf7a",
  late: "#eda100",
  absent: "#e34948",
  holiday: "#c7bda9",
  none: "#efeae0",
} as const;

/** Neutral used when an institution's grade band has no colour set. */
export const NEUTRAL = "#79839a";

/** `#rrggbb` + alpha → `rgba(...)`, for soft tinted fills behind a mark. */
export function tint(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/** Stable colour for a named category (achievement category, book genre,
 *  activity type) — the same name gets the same slot on every page. */
export function colorForName(name: string, order: readonly string[]): string {
  const i = order.indexOf(name);
  return i >= 0 && i < CHART_SERIES.length ? CHART_SERIES[i] : NEUTRAL;
}
