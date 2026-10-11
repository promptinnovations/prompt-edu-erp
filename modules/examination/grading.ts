/**
 * PROMPT EDU ERP — pure grade-band resolution.
 *
 * Split out of modules/examination/service.ts (which re-exports it, so every
 * existing import keeps working) so a CLIENT component — the marks-entry
 * grid's live Grade column — can resolve a band with the exact same rule
 * the report card and results use, without pulling the DB layer into the
 * browser bundle. No imports, no I/O.
 */

export interface GradeBandLike { min_percent: string | number; max_percent: string | number }

/** Resolves a percentage to a band, treating bands as half-open intervals
 *  [min_percent, next band's min_percent): the band with the greatest
 *  min_percent <= pct wins. This closes the gap an inclusive
 *  `pct between min and max` match leaves between stored boundaries like
 *  [80, 89.99] and [90, 100] (89.995 matched nothing). pct is first rounded
 *  to 2dp — the precision results.percentage is stored at — so the grade
 *  always agrees with the percentage printed next to it. Returns null only
 *  when pct is below every band's minimum (or there are no bands). */
export function resolveGradeBand<T extends GradeBandLike>(bands: readonly T[], pct: number): T | null {
  const p = Math.round(pct * 100) / 100;
  let best: T | null = null;
  for (const b of bands) {
    if (p >= Number(b.min_percent) && (best == null || Number(b.min_percent) > Number(best.min_percent))) best = b;
  }
  return best;
}

export interface GradeUnit { max: number; obtained: number | null; absent: boolean }

/** A subject's percentage from its units (TE plus any CE components), with
 *  the report card's rule: an absent unit drops out of BOTH numerator and
 *  denominator, and a unit with nothing entered yet is left out of the
 *  numerator only. Null when no unit has a mark yet. */
export function subjectPercentFromUnits(units: readonly GradeUnit[]): number | null {
  const sat = units.filter((u) => !u.absent && u.obtained != null);
  if (sat.length === 0) return null;
  const obtained = sat.reduce((a, u) => a + (u.obtained ?? 0), 0);
  const max = units.filter((u) => !u.absent).reduce((a, u) => a + u.max, 0);
  return max > 0 ? (obtained / max) * 100 : null;
}
