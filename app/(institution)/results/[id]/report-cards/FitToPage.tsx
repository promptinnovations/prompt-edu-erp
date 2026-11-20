"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { fitReportSheet } from "./fit-report-sheet";

/** A4 width in CSS px (96dpi). */
const SHEET_WIDTH_PX = (210 * 96) / 25.4;

/** Wraps a report card's body and shrinks it to one A4 page when its
 *  content would otherwise overflow (see fit-report-sheet.ts). Re-fits once
 *  web fonts have loaded (they change line wrapping) and right before
 *  printing.
 *
 *  §Mobile-overflow: on a screen narrower than an A4 sheet it also scales
 *  the whole sheet (the enclosing `.report-sheet`) down to the screen width
 *  via --screen-zoom (globals.css), so a phone shows the real A4 layout
 *  instead of a table running off the side of the page. The screen zoom is
 *  always cleared before measuring and before printing, so the one-page fit
 *  and the printout are exactly what they were. */
export default function FitToPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sheet = el.closest<HTMLElement>(".report-sheet");
    const clearScreenFit = () => { sheet?.style.removeProperty("--screen-zoom"); };
    const screenFit = () => {
      if (!sheet) return;
      const available = sheet.parentElement?.clientWidth ?? 0;
      if (available > 0 && available < SHEET_WIDTH_PX - 1) {
        sheet.style.setProperty("--screen-zoom", String(Math.floor((available / SHEET_WIDTH_PX) * 1000) / 1000));
      } else {
        clearScreenFit();
      }
    };
    let printing = false;
    const fit = () => { clearScreenFit(); fitReportSheet(el); if (!printing) screenFit(); };
    fit();
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) fit(); });
    const beforePrint = () => { printing = true; fit(); };
    const afterPrint = () => { printing = false; screenFit(); };
    const onResize = () => { if (!printing) screenFit(); };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return <div ref={ref} className={`report-fit ${className}`}>{children}</div>;
}
