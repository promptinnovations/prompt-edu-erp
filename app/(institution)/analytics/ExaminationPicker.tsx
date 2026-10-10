import Link from "next/link";

/** §Print/Analytics follow-up "give all exams here as a button so we can
 *  see results by clicking exam name" — was a <select> + "Load" submit
 *  button; now every examination is its own pill link (same pattern as the
 *  Result Analysis tabs and the class-histogram picker further down this
 *  page), so clicking a name jumps straight to that exam's analytics with
 *  no extra click needed. Plain <Link>s, not a client component — no local
 *  state, just URL navigation. */
export default function ExaminationPicker({
  examinations,
  examinationId,
  trendClassId,
  trendSectionId,
  fromMonth,
  toMonth,
}: {
  examinations: Array<{ id: string; name: string }>;
  examinationId: string;
  trendClassId: string;
  trendSectionId: string;
  fromMonth: string;
  toMonth: string;
}) {
  function hrefFor(id: string): string {
    const params = new URLSearchParams({ examinationId: id, trendClassId, trendSectionId, fromMonth, toMonth });
    return `?${params.toString()}`;
  }

  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">Examination</label>
      {examinations.length === 0 ? (
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
        </div>
      )}
    </div>
  );
}
