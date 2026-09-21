/**
 * PROMPT EDU ERP — Result Analysis cache tags.
 *
 * Small, dependency-free module (no DB/Next imports beyond tag strings) so
 * it can be imported by both modules/analytics/service.ts (the reader side,
 * which wraps its report queries in Next's Data Cache using these tags) and
 * modules/examination/service.ts (the writer side, which revalidates them
 * the moment marks are approved/locked/corrected) without creating a
 * circular import between the two service files.
 *
 * Cost-minimization rule (Muhsin, Sept 2026): Result Analysis reads must be
 * cached and reused until the underlying data actually changes — never
 * re-queried on every tab click/filter re-render. These tags are the exact
 * "until there's a change" boundary: a cached report is invalidated only
 * when one of these tags is revalidated, never on a timer.
 */
import { revalidateTag } from "next/cache";

/** Live `results`/`marks`-backed Result Analysis reports (School/Section/
 *  Grade/Class/Subject/Teacher-wise, classification, histogram, track
 *  summary) for one examination. Revalidated by computeResults() the
 *  instant marks are (re)approved/locked/corrected for that examination —
 *  see modules/examination/service.ts. */
export function resultAnalysisTag(institutionId: string, examinationId: string): string {
  return `result-analysis:${institutionId}:${examinationId}`;
}

/** classification_rules is institution-wide configuration, not tied to one
 *  examination — getExaminationClassification() also carries this tag (in
 *  addition to resultAnalysisTag) so a threshold change invalidates every
 *  cached classification for the institution, not just one exam. */
export function classificationTag(institutionId: string): string {
  return `result-classification:${institutionId}`;
}

/** mv_exam_subject_stats is a periodically-refreshed rollup spanning every
 *  institution (refreshAnalyticsViews() is a whole-database maintenance
 *  action, not per-tenant — see that function's own comment), so its
 *  cache-dependent readers (Subject comparison / performance indicators)
 *  share one global tag rather than a per-institution one. */
export const ANALYTICS_VIEWS_TAG = "analytics-matviews";

/** Thin wrapper around Next's revalidateTag() that swallows the "static
 *  generation store missing" invariant it throws when called outside a
 *  Next.js request/action scope — e.g. a Vitest integration test that
 *  calls approveMarks()/computeResults() directly, or any other script
 *  that imports these service functions outside the Next.js runtime.
 *  Every real production caller (server actions, route handlers) always
 *  runs inside that scope, so this is a no-op there; the try/catch only
 *  matters where there's no Data Cache to invalidate in the first place. */
export function safeRevalidateTag(tag: string): void {
  try {
    revalidateTag(tag);
  } catch {
    // No request-scoped Data Cache outside Next's runtime — nothing to do.
  }
}
