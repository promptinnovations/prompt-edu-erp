import Link from "next/link";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { listExaminations, getMarkEntryStatus } from "../../../../modules/examination/service";

/** "Examination > Mark entry status" — pick an examination, see per-subject
 *  entered/pending counts, so an admin can spot which subjects still need
 *  marks entered instead of opening each subject's grid one at a time. */
export default async function MarkEntryStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ examinationId?: string }>;
}) {
  const { examinationId = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");

  const examinations = await listExaminations(institutionId, authUserId);
  const effectiveExamId = examinationId || examinations[0]?.id || "";
  const status = effectiveExamId ? await getMarkEntryStatus(institutionId, authUserId, effectiveExamId) : [];
  const examination = examinations.find((e) => e.id === effectiveExamId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Mark Entry Status</h1>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Examination</label>
            <select
              name="examinationId"
              defaultValue={effectiveExamId}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            >
              {examinations.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
            Load
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">Entered</th>
                <th className="px-4 py-2">Expected</th>
                <th className="px-4 py-2">Progress</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {status.map((s) => {
                const pct = s.expected > 0 ? Math.round((s.entered / s.expected) * 100) : 0;
                const done = s.expected > 0 && s.entered >= s.expected;
                return (
                  <tr key={s.exam_subject_id}>
                    <td className="px-4 py-2">{s.subject_name}</td>
                    <td className="px-4 py-2">{s.entered}</td>
                    <td className="px-4 py-2">{s.expected}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-amber-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={`text-xs ${done ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                          {done ? "Complete" : `${pct}%`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {examination ? (
                        <Link href={`/examinations/${examination.id}/marks/${s.exam_subject_id}`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">
                          Enter marks
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {status.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-zinc-400 dark:text-zinc-500">
                  {examinations.length === 0 ? "No examinations yet." : "No subjects/classes configured for this examination yet."}
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
