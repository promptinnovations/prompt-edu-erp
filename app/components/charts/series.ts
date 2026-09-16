/**
 * Chart series palette — Prompt Innovations UI standard.
 *
 * Eight fixed, CVD-validated slots, mirrored from globals.css's
 * --color-chart-1..8. Any series colour a chart chooses for itself comes
 * from here: assigned in order (series 0 -> slot 1), never cycled, and
 * never substituted with brand colours. A ninth-or-later series gets the
 * neutral muted tone rather than silently reusing slot 1's colour, so two
 * different series can never look like the same one.
 *
 * Not for colours that carry meaning set elsewhere: grade-band colours
 * (grade_bands.color, institution config) and the PASS_COLOR/FAIL_COLOR
 * pair (modules/examination/service.ts, §K) are passed through unchanged.
 */
export const CHART_SERIES = [
  "#2A78D6", // 1 blue
  "#EB6834", // 2 orange
  "#1BAF7A", // 3 aqua
  "#EDA100", // 4 yellow
  "#E87BA4", // 5 magenta
  "#008300", // 6 green
  "#4A3AA7", // 7 violet
  "#E34948", // 8 red
] as const;

/** Colour for series beyond the eighth slot (and for "no colour" fallbacks). */
export const CHART_OVERFLOW = "#79839A";

export function seriesColor(index: number): string {
  return CHART_SERIES[index] ?? CHART_OVERFLOW;
}
