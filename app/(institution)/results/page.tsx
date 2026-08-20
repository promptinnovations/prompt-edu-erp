import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { listExaminations } from "../../../modules/examination/service";

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "Result" group landing — a distinct top-level section from "Examination"
 *  (which is about SETTING UP exams/entering marks); this is about
 *  CONSUMING the outcome: view computed results, the consolidated
 *  subject-by-subject marksheet, or per-student report cards, for any
 *  examination. §Page-6 follow-up "date in sequential order" — rows are
 *  sorted chronologically by start date here (undated exams last), a
 *  display-only re-sort of listExaminations()'s own "most recently
 *  created" ordering, which other pages (Examination setup, Home widgets)
 *  still rely on unchanged. */
export default async function ResultsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");

  const examinations = [...await listExaminations(institutionId, authUserId)].sort((a, b) => {
    if (!a.start_date && !b.start_date) return 0;
    if (!a.start_date) return 1;
    if (!b.start_date) return -1;
    return a.start_date.localeCompare(b.start_date);
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Results</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Pick an examination to view its computed results, consolidated marksheet, or print report cards.
      </p>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2">Examination</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {examinations.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2">{e.name}</td>
                  <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                    {formatDate(e.start_date)}{e.end_date && e.end_date !== e.start_date ? ` – ${formatDate(e.end_date)}` : ""}
                  </td>
                  <td className="px-4 py-2 capitalize">{e.status}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/examinations/${e.id}`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">Results</Link>
                      <Link href={`/results/${e.id}/consolidated`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">Consolidated marks</Link>
                      <Link href={`/results/${e.id}/report-cards`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">Report cards</Link>
                      <Link href={`/analytics?examinationId=${e.id}`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">Analysis</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {examinations.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-zinc-400 dark:text-zinc-500">
                  No examinations yet — create one under Examination &gt; Create Exam.
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
