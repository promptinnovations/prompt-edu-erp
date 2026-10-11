import Link from "next/link";

/** §Print/Analytics follow-up "give all exams here as a button so we can
 *  see results by clicking exam name" — was a <select> + "Load" submit
 *  button; now every examination is its own pill link (same pattern as the
 *  Result Analysis tabs and the class-histogram picker further down this
 *  page), so clicking a name jumps straight to that exam's analytics with
 *  no extra click needed. Plain <Link>s, not a client component — no local
 *  state, just URL navigation.
 *
 *  §Daily-assessment-analytics — `examinations` here already excludes Daily
 *  Assessment registers (page.tsx filters them out: they have no `results`
 *  rows to analyse). In their place, `dailyAssessmentsLink` renders ONE
 *  outlined pill ("Daily assessments 2026-27") that goes to their own
 *  month-wise page, visually distinct from the exam pills because it
 *  navigates away rather than selecting. */
export default function ExaminationPicker({
  examinations,
  examinationId,
  trendClassIds,
  trendSectionId,
  trendMonths,
  dailyAssessmentsLink,
}: {
  examinations: Array<{ id: string; name: string }>;
  examinationId: string;
  trendClassIds: string[];
  trendSectionId: string;
  trendMonths: string[];
  dailyAssessmentsLink?: { label: string; href: string } | null;
}) {
  function hrefFor(id: string): string {
    const params = new URLSearchParams({
      examinationId: id, trendClassIds: trendClassIds.join(","), trendSectionId, trendMonths: trendMonths.join(","),
    });
    return `?${params.toString()}`;
  }

  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">Examination</label>
      {examinations.length === 0 && !dailyAssessmentsLink ? (
        <p className="text-sm text-zinc-500">No examinations yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {examinations.map((e) => (
            <Link
              key={e.id}
              href={hrefFor(e.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                examinationId === e.id ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {e.name}
            </Link>
          ))}
          {dailyAssessmentsLink ? (
            <Link
              href={dailyAssessmentsLink.href}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white"
            >
              {dailyAssessmentsLink.label}
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
