/**
 * §Report-card-one-page ("a report card should never exceed to another
 * page for any reason, in case of excessive data, adjust spacing and font
 * size — never exceed more than a page").
 *
 * The density tiers in ReportCardDocument handle the normal range by
 * choosing tighter spacing and smaller type. This is the guarantee on top:
 * after layout, measure the card's real content height at its printed
 * width and, if it is taller than the sheet's frame, scale the whole body
 * down with CSS `zoom` until it fits. Zoom (unlike transform: scale)
 * shrinks the layout box too, so the card genuinely fits the page instead
 * of only looking smaller. The CSS that applies the zoom lives in
 * globals.css (`.report-fit`), screen ≥640px and print only.
 *
 * Pure DOM, no React — shared by FitToPage.tsx and the render-test harness.
 */

/** Printed content box of the frame: A4 210×297mm minus the sheet's 10mm
 *  padding, the frame's 1.2pt border and 8mm padding, each side. The CSS in
 *  globals.css uses the same two numbers. */
export const FIT_WIDTH_MM = 173;
export const FIT_HEIGHT_MM = 259;
/** A sliver of headroom for sub-pixel rounding in the print rasteriser. */
const SAFETY_MM = 1.5;
const PX_PER_MM = 96 / 25.4;
/** Below this the text is no longer legible; the print clip in globals.css
 *  is the backstop for anything beyond it. */
const MIN_ZOOM = 0.4;

/** Rendered height (mm) of the card body with the flex column collapsed
 *  to its content (the remarks box at its minimum), either unzoomed at the
 *  printed width (`zoom` null) or at a trial zoom. */
function contentHeightMm(el: HTMLElement, zoom: number | null): number {
  const prev = { width: el.style.width, flex: el.style.flex, minHeight: el.style.minHeight };
  if (zoom == null) {
    el.style.removeProperty("--fit-zoom");
    el.style.width = `${FIT_WIDTH_MM}mm`;
  } else {
    el.style.setProperty("--fit-zoom", String(zoom));
  }
  el.style.flex = "none";
  el.style.minHeight = "0";
  const mm = el.getBoundingClientRect().height / PX_PER_MM;
  el.style.width = prev.width;
  el.style.flex = prev.flex;
  el.style.minHeight = prev.minHeight;
  return mm;
}

/** Returns the zoom applied (1 = the card already fits). */
export function fitReportSheet(el: HTMLElement): number {
  const limit = FIT_HEIGHT_MM - SAFETY_MM;
  const natural = contentHeightMm(el, null);
  if (!(natural > limit)) {
    el.style.removeProperty("--fit-zoom");
    return 1;
  }
  // Zooming out also gives the text proportionally MORE width, so lines
  // wrap less and the body ends up shorter than a straight ratio predicts.
  // limit/natural is therefore a zoom that certainly fits; binary-search
  // upward from it for the largest zoom that still fits, so the card is
  // shrunk only as much as it has to be.
  let lo = Math.max(MIN_ZOOM, limit / natural);
  let hi = 1;
  for (let i = 0; i < 7 && hi - lo > 0.004; i++) {
    const mid = (lo + hi) / 2;
    if (contentHeightMm(el, mid) <= limit) lo = mid; else hi = mid;
  }
  const zoom = Math.floor(lo * 1000) / 1000;
  el.style.setProperty("--fit-zoom", String(zoom));
  return zoom;
}

export function fitAllReportSheets(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(".report-fit").forEach((el) => fitReportSheet(el));
}
