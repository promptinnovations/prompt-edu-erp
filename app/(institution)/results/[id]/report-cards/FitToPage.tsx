"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { fitReportSheet } from "./fit-report-sheet";

/** Wraps a report card's body and shrinks it to one A4 page when its
 *  content would otherwise overflow (see fit-report-sheet.ts). Re-fits once
 *  web fonts have loaded (they change line wrapping) and right before
 *  printing. */
export default function FitToPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => { fitReportSheet(el); };
    fit();
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) fit(); });
    window.addEventListener("beforeprint", fit);
    return () => { alive = false; window.removeEventListener("beforeprint", fit); };
  }, []);
  return <div ref={ref} className={`report-fit ${className}`}>{children}</div>;
}
