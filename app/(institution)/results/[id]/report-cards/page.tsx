import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../services/request-context";
import { getExamination, getResults } from "../../../../../modules/examination/service";

/** "Result > Report Cards" — one link per student into their own printable
 *  report card (app/(institution)/results/[id]/report-cards/[studentId]).
 *  Built on getResults() (already-computed totals/%/grade/rank) rather
 *  than re-deriving them, so the ranking shown here always matches what
 *  ComputeResultsButton on the examination detail page produced. */
export default async function ReportCardsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound();

  const results = await getResults(institutionId, authUserId, id);

  return (
    <div className="space-y-6">
      <Link href="/results" className="text-sm text-zinc-500 dark:text-zinc-400 underline">← Back to Results</Link>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Report Cards — {examination.name}</h1>
      {results.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          No results computed yet for this examination — compute results from its{" "}
          <Link href={`/examinations/${id}`} className="underline">detail page</Link> first.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2">Student</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Grade</th>
                <th className="px-4 py-2">Rank</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {results.map((r) => (
                <tr key={r.student_id}>
                  <td className="px-4 py-2">{r.student_name}</td>
                  <td className="px-4 py-2">{r.total_marks} / {r.max_total_marks}</td>
                  <td className="px-4 py-2">{r.grade_label ?? "—"}</td>
                  <td className="px-4 py-2">{r.rank ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/results/${id}/report-cards/${r.student_id}`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">
                      View / print
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
