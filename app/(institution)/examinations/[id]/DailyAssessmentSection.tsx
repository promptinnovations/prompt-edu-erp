import Link from "next/link";
import AddDailyAssessmentForm, { type ClassOption, type SubjectOption } from "./AddDailyAssessmentForm";
import DailyAssessmentFilters from "./DailyAssessmentFilters";
import type {
  DailyAssessmentRow, DailyConsolidatedRow, DailyAssessmentSubjectAnalysisRow,
  DailyAssessmentClassAnalysisRow, DailyAssessmentStudentAnalysisRow,
} from "../../../../modules/examination/service";

function fmt(n: string | number | null) {
  if (n === null) return "—";
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** The whole Daily Assessment register for one month — everything the spec
 *  asks for lives on this one page (register, consolidated result, monthly
 *  analysis) rather than spread across several new routes, matching "avoid
 *  unnecessary separate tables or modules" applied to the UI too. */
export default function DailyAssessmentSection({
  examinationId, canManage, classes, subjectsByClass, allSubjects, entries,
  classParam, subjectParam, consolidated, subjectAnalysis, classAnalysis, studentAnalysis,
}: {
  examinationId: string;
  canManage: boolean;
  classes: ClassOption[];
  subjectsByClass: Record<string, SubjectOption[]>;
  allSubjects: SubjectOption[];
  entries: DailyAssessmentRow[];
  classParam: string;
  subjectParam: string;
  consolidated: DailyConsolidatedRow[];
  subjectAnalysis: DailyAssessmentSubjectAnalysisRow[];
  classAnalysis: DailyAssessmentClassAnalysisRow[];
  studentAnalysis: DailyAssessmentStudentAnalysisRow[];
}) {
  return (
    <div className="space-y-6">
      {canManage ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add today&apos;s assessment</h2>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            Conducted based on the portion completed that day — the same subject can be assessed again on a later day.
          </p>
          <AddDailyAssessmentForm examinationId={examinationId} classes={classes} subjectsByClass={subjectsByClass} allSubjects={allSubjects} />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <h2 className="px-5 pt-5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Register</h2>
        <div className="overflow-x-auto p-5 pt-3">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1.5 pr-4">Date</th>
                <th className="py-1.5 pr-4">Class</th>
                <th className="py-1.5 pr-4">Subject</th>
                <th className="py-1.5 pr-4">Portion</th>
                <th className="py-1.5 pr-4">Max mark</th>
                <th className="py-1.5 pr-4">Status</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5 pr-4">{new Date(e.assessment_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="py-1.5 pr-4">{e.class_name}</td>
                  <td className="py-1.5 pr-4">{e.subject_name}</td>
                  <td className="py-1.5 pr-4 max-w-xs truncate" title={e.portion}>{e.portion}</td>
                  <td className="py-1.5 pr-4">{fmt(e.max_marks)}</td>
                  <td className="py-1.5 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                      {e.status === "completed" ? "Completed" : "Pending"}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    <Link href={`/examinations/${examinationId}/daily/${e.id}`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">
                      {e.status === "completed" ? "View marks" : "Enter marks"}
                    </Link>
                  </td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr><td colSpan={7} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No assessments recorded yet this month.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Monthly consolidated result</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">Updates automatically as each day&apos;s marks are entered.</p>
        <div className="mb-3">
          <DailyAssessmentFilters classes={classes} subjects={allSubjects} classParam={classParam} subjectParam={subjectParam} />
        </div>
        {classParam ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1.5 pr-4">Student</th>
                  <th className="py-1.5 pr-4">Daily mark</th>
                  <th className="py-1.5 pr-4">Cumulative mark</th>
                  <th className="py-1.5 pr-4">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {consolidated.map((r) => (
                  <tr key={r.student_id}>
                    <td className="py-1.5 pr-4 text-zinc-900 dark:text-zinc-50">{r.student_name}</td>
                    <td className="py-1.5 pr-4">{r.latest_marks_obtained !== null ? `${fmt(r.latest_marks_obtained)}/${fmt(r.latest_max_marks)}` : "—"}</td>
                    <td className="py-1.5 pr-4">{fmt(r.cumulative_marks_obtained)}/{fmt(r.cumulative_max_marks)}</td>
                    <td className="py-1.5 pr-4">
                      {r.grade_label ? (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: r.grade_color ?? "#71717a" }}>{r.grade_label}</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
                {consolidated.length === 0 ? (
                  <tr><td colSpan={4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No completed sessions for this class yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Choose a class above to see its consolidated result.</p>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Monthly analysis — subject-wise</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1.5 pr-4">Subject</th>
                <th className="py-1.5 pr-4">Sessions</th>
                <th className="py-1.5 pr-4">Portions conducted</th>
                <th className="py-1.5 pr-4">Avg %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {subjectAnalysis.map((s) => (
                <tr key={s.subject_id}>
                  <td className="py-1.5 pr-4 text-zinc-900 dark:text-zinc-50">{s.subject_name}</td>
                  <td className="py-1.5 pr-4">{s.sessions_conducted}</td>
                  <td className="py-1.5 pr-4 max-w-md truncate" title={s.portions.join(", ")}>{s.portions.join(", ") || "—"}</td>
                  <td className="py-1.5 pr-4">{s.avg_percent}%</td>
                </tr>
              ))}
              {subjectAnalysis.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No completed sessions yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Monthly analysis — class-wise</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1.5 pr-4">Class</th>
                <th className="py-1.5 pr-4">Sessions</th>
                <th className="py-1.5 pr-4">Avg %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {classAnalysis.map((c) => (
                <tr key={c.class_id}>
                  <td className="py-1.5 pr-4 text-zinc-900 dark:text-zinc-50">{c.class_name}</td>
                  <td className="py-1.5 pr-4">{c.sessions_conducted}</td>
                  <td className="py-1.5 pr-4">{c.avg_percent}%</td>
                </tr>
              ))}
              {classAnalysis.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No completed sessions yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Monthly analysis — student-wise</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">Uses the class selected above.</p>
        {classParam ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1.5 pr-4">Student</th>
                  <th className="py-1.5 pr-4">Sessions taken</th>
                  <th className="py-1.5 pr-4">Cumulative mark</th>
                  <th className="py-1.5 pr-4">Avg %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {studentAnalysis.map((s) => (
                  <tr key={s.student_id}>
                    <td className="py-1.5 pr-4 text-zinc-900 dark:text-zinc-50">{s.student_name}</td>
                    <td className="py-1.5 pr-4">{s.sessions_taken}</td>
                    <td className="py-1.5 pr-4">{fmt(s.cumulative_marks_obtained)}/{fmt(s.cumulative_max_marks)}</td>
                    <td className="py-1.5 pr-4">{s.avg_percent}%</td>
                  </tr>
                ))}
                {studentAnalysis.length === 0 ? (
                  <tr><td colSpan={4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No completed sessions for this class yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Choose a class above to see student-wise analysis.</p>
        )}
      </section>
    </div>
  );
}
