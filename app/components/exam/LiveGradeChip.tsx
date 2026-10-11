"use client";

import { resolveGradeBand, subjectPercentFromUnits, type GradeUnit } from "../../../modules/examination/grading";

export interface LiveGradeBand { min_percent: string; max_percent: string; grade_label: string; color: string | null }

/** Parses a marks <input> value: blank or non-numeric -> not entered yet. */
export function parseMarkInput(v: string): number | null {
  return v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v);
}

/** §"grade should be automatically entered when each mark is added" — the
 *  grade for one row of a marks-entry grid, re-resolved on every keystroke
 *  by the same rule the report card uses (subjectPercentFromUnits +
 *  resolveGradeBand, modules/examination/grading.ts) against the
 *  examination's own grade scale. Display only: nothing here is saved —
 *  the stored grade is still computed server-side from the saved marks. */
export default function LiveGradeChip({ units, bands }: { units: GradeUnit[]; bands: LiveGradeBand[] }) {
  if (units.length > 0 && units.every((u) => u.absent)) return <span className="text-xs font-medium text-zinc-500">AB</span>;
  const pct = subjectPercentFromUnits(units);
  if (pct == null) return <span className="text-zinc-300">—</span>;
  if (pct > 100 || units.some((u) => u.obtained != null && (u.obtained > u.max || u.obtained < 0))) {
    return <span className="text-xs font-medium text-red-600">Check marks</span>;
  }
  const band = resolveGradeBand(bands, pct);
  if (!band) return <span className="text-zinc-300" title={`${pct.toFixed(1)}% — no grade band covers this`}>—</span>;
  return (
    <span
      title={`${pct.toFixed(1)}%`}
      className="inline-flex min-w-[2.75rem] items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-800"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: band.color || "#a1a1aa" }} />
      {band.grade_label}
    </span>
  );
}
