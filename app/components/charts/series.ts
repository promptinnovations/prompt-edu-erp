/**
 * Chart series palette — Prompt Innovations UI standard.
 *
 * Eight slots, mirrored from globals.css's --color-chart-1..8. Any series colour a chart chooses for itself comes
 * from here: assigned in order (series 0 -> slot 1), never cycled, and
 * never substituted with brand colours. A ninth-or-later series gets the
 * neutral muted tone rather than silently reusing slot 1's colour, so two
 * different series can never look like the same one.
 *
 * Not for colours that carry meaning set elsewhere: grade-band colours
 * (grade_bands.color, institution config) and the PASS_COLOR/FAIL_COLOR
 * pair (modules/examination/service.ts, §K) are passed through unchanged.
 */
/** §Palette-matching charts ("icons, charts, cards etc. in the app also
 *  need to match the new colour combinations"): the eight slots now follow
 *  the institution's colour theme — slot 1 is its brand colour, slot 2 its
 *  accent, then six companion hues picked for that theme (services/
 *  branding/palettes.ts → --chart-N-rgb, set on every page). Each value is
 *  an rgb(var(…)) colour with the Scholar Teal default built in, so it
 *  works in SVG fill/stroke, inline styles and gradients alike; tint()
 *  (viz/palette.ts) turns it into a translucent fill. */
const slot = (n: number, fallback: string) => `rgb(var(--chart-${n}-rgb, ${fallback}))`;
export const CHART_SERIES = [
  slot(1, "15, 118, 110"), // brand
  slot(2, "234, 88, 12"), // accent
  slot(3, "37, 99, 235"),
  slot(4, "124, 58, 237"),
  slot(5, "219, 39, 119"),
  slot(6, "22, 163, 74"),
  slot(7, "101, 163, 13"),
  slot(8, "71, 85, 105"),
] as const;

/** Decorative accents (stat tiles, quick links, panel edges) — the
 *  theme's own colour family (brand, accent, deep brand, light brand),
 *  cycled, so dashboards look like the chosen theme rather than a rainbow. */
const DECOR = [
  "rgb(var(--decor-1-rgb, 15, 118, 110))",
  "rgb(var(--decor-2-rgb, 234, 88, 12))",
  "rgb(var(--decor-3-rgb, 14, 83, 83))",
  "rgb(var(--decor-4-rgb, 101, 167, 162))",
] as const;

export function decorColor(index: number): string {
  return DECOR[((index % DECOR.length) + DECOR.length) % DECOR.length];
}

/** Colour for series beyond the eighth slot (and for "no colour" fallbacks). */
export const CHART_OVERFLOW = "#79839A";

export function seriesColor(index: number): string {
  return CHART_SERIES[index] ?? CHART_OVERFLOW;
}
