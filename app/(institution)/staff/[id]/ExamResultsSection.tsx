import type { ExaminationRecord } from "../../../../modules/examination/service";
import type { TeacherExamReport, TeacherPerformanceTrendPoint } from "../../../../modules/analytics/service";
import { TeacherPerformanceTrendChart } from "./ProfileCharts";

/**
 * §Teacher-Profile feature ("their exam results of each exam with
 * analysis... similar to image 1... a curve that shows growth and fall").
 * The reference table's header ("HASANATH BEEVI — Overall: 75.2% · Pass
 * 88%") is the `report.overall_*` summary shown above the table; each row
 * is one (class/division, subject) combination this teacher covers, with
 * Students/Average/Pass%/Full Marks and per-grade-band counts, matching the
 * reference's Class/Subject/Students/Average/Pass %/Full Marks/A+/A/Failed
 * columns. A plain GET form drives the examination picker so the page stays
 * fully server-rendered (?examId=...&tab=results, read by staff/[id]/page.tsx).
 */
export default function ExamResultsSection({
  examinations, selectedExamId, report, trend,
}: {
  examinations: ExaminationRecord[];
  selectedExamId: string | null;
  report: TeacherExamReport | null;
  trend: TeacherPerformanceTrendPoint[];
}) {
  const gradeLabels = Array.from(
    new Set(report?.rows.flatMap((r) => Object.keys(r.grade_counts)) ?? [])
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Performance trend</h2>
        <TeacherPerformanceTrendChart points={trend} />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="results" />
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Examination</label>
            <select
              name="examId"
              defaultValue={selectedExamId ?? ""}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            >
              {examinations.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
            View
          </button>
        </form>

        {!report ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No examinations found.</p>
        ) : report.rows.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No subject-teacher assignments cover this examination yet.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{report.examination_name}</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                Overall: <span className="font-medium text-zinc-900 dark:text-zinc-50">{report.overall_percentage ?? "—"}%</span>
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">
                Pass <span className="font-medium text-zinc-900 dark:text-zinc-50">{report.overall_pass_percentage ?? "—"}%</span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-1.5 pr-3">Class</th>
                    <th className="py-1.5 pr-3">Subject</th>
                    <th className="py-1.5 pr-3">Students</th>
                    <th className="py-1.5 pr-3">Average</th>
                    <th className="py-1.5 pr-3">Pass %</th>
                    <th className="py-1.5 pr-3">Full Marks</th>
                    {gradeLabels.map((g) => <th key={g} className="py-1.5 pr-3">{g}</th>)}
                    <th className="py-1.5 pr-3">Failed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {report.rows.map((r) => (
                    <tr key={`${r.class_id}-${r.section_id ?? "all"}-${r.subject_id}`}>
                      <td className="py-1.5 pr-3 text-zinc-900 dark:text-zinc-50">
                        {r.class_name}{r.section_name ? ` · ${r.section_name}` : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">{r.subject_name}</td>
                      <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">{r.students}</td>
                      <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">
                        {r.average_marks !== null ? `${r.average_marks}/${r.full_marks}` : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">{r.pass_percentage !== null ? `${r.pass_percentage}%` : "—"}</td>
                      <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">{r.full_marks}</td>
                      {gradeLabels.map((g) => (
                        <td key={g} className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">{r.grade_counts[g] ?? 0}</td>
                      ))}
                      <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">{r.failed_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
