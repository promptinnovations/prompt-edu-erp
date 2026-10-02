import Link from "next/link";
import { getStudent360 } from "../../../../../modules/portfolio/service";
import { getPublishedDailyAssessmentResultsForStudent, listStudentResultHistory } from "../../../../../modules/examination/service";
import { requireOwnStudentId, NotLinkedNotice, Card } from "../_lib";

function fmt(n: string | number | null) {
  if (n === null) return "—";
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** Exam performance — §"this page should show details of examination +
 *  exam wise results + consolidated marks of the child + report card +
 *  cumulative marks, not attendance, it can be a different page with a
 *  button from the home page of student portal": attendance now lives on
 *  its own /portal/student/attendance page (linked from the dashboard's
 *  stat card), and this page instead lists every published exam the
 *  student has a result for, each linking to a combined consolidated-marks
 *  + printable report-card detail page. "Cumulative marks" is the average
 *  percentage across every published exam below, shown as its own stat.
 *  §"how we will publish daily assessment result" — Daily Assessment
 *  registers never write to the `results` table listStudentResultHistory()
 *  reads from (they have their own live monthly-consolidated math), so a
 *  published register is surfaced here as its own section instead of
 *  folding into the exam-wise list above. Gated on published_at exactly
 *  like the exam-wise list is (getPublishedDailyAssessmentResultsForStudent()
 *  only ever returns registers with published_at set). */
export default async function StudentExamsPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const [summary, results] = await Promise.all([
    getStudent360(institutionId, authUserId, ownStudentId, 10, undefined, true),
    listStudentResultHistory(institutionId, authUserId, ownStudentId),
  ]);
  const classId = summary.enrollment?.class_id;
  const dailyAssessments = classId
    ? await getPublishedDailyAssessmentResultsForStudent(institutionId, authUserId, ownStudentId, classId)
    : [];
  const breakdown = summary.latestConsolidatedScore?.breakdown_jsonb ?? {};
  const breakdownEntries = Object.entries(breakdown);
  const maxValue = Math.max(1, ...breakdownEntries.map(([, v]) => Number(v) || 0));
  const cumulativePercent = results.length > 0
    ? results.reduce((a, r) => a + Number(r.percentage), 0) / results.length
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Exam performance</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Exam-wise results, consolidated marks, report cards and cumulative score.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-card">
          <div className="text-2xl font-semibold text-[var(--foreground)]">
            {summary.latestResult ? `${summary.latestResult.percentage}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {summary.latestResult ? `${summary.latestResult.examination_name}${summary.latestResult.grade_label ? ` · Grade ${summary.latestResult.grade_label}` : ""}` : "No results yet"}
          </div>
        </div>
        <div className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-card">
          <div className="text-2xl font-semibold text-[var(--foreground)]">
            {cumulativePercent !== null ? `${cumulativePercent.toFixed(2)}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">Cumulative marks across {results.length} published exam{results.length === 1 ? "" : "s"}</div>
        </div>
        <div className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-card">
          <div className="text-2xl font-semibold text-[var(--foreground)]">
            {summary.latestConsolidatedScore ? summary.latestConsolidatedScore.score : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {summary.latestConsolidatedScore ? `Consolidated · ${summary.latestConsolidatedScore.period}` : "Consolidated score"}
          </div>
        </div>
      </div>

      <Card title="Exam-wise results" subtitle="Tap an exam for consolidated marks and a printable report card.">
        <ul className="divide-y divide-[var(--border-subtle)] text-sm">
          {results.map((r) => (
            <li key={r.examination_id}>
              <Link
                href={`/portal/student/exams/${r.examination_id}`}
                className="flex items-center justify-between py-2 transition-colors hover:text-[var(--brand)]"
              >
                <span className="text-[var(--foreground)]">{r.examination_name}{r.grade_label ? ` — Grade ${r.grade_label}` : ""}</span>
                <span className="text-zinc-500">{r.percentage}% →</span>
              </Link>
            </li>
          ))}
          {results.length === 0 ? <li className="py-2 text-zinc-500">No published results yet.</li> : null}
        </ul>
      </Card>

      {breakdownEntries.length > 0 ? (
        <Card title="Score breakdown" subtitle={summary.latestConsolidatedScore?.period}>
          <div className="space-y-3">
            {breakdownEntries.map(([label, value]) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span className="capitalize text-[var(--foreground)]">{label.replace(/_/g, " ")}</span>
                  <span>{value}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)]"
                    style={{ width: `${Math.min(100, (Number(value) / maxValue) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {dailyAssessments.length > 0 ? (
        <Card title="Daily Assessment">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                <tr>
                  <th className="py-1.5 pr-4">Register</th>
                  <th className="py-1.5 pr-4">Latest mark</th>
                  <th className="py-1.5 pr-4">Cumulative mark</th>
                  <th className="py-1.5 pr-4">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dailyAssessments.map((d) => (
                  <tr key={d.examination_id}>
                    <td className="py-1.5 pr-4 text-[var(--foreground)]">{d.examination_name}</td>
                    <td className="py-1.5 pr-4">{d.latest_marks_obtained !== null ? `${fmt(d.latest_marks_obtained)}/${fmt(d.latest_max_marks)}` : "—"}</td>
                    <td className="py-1.5 pr-4">{fmt(d.cumulative_marks_obtained)}/{fmt(d.cumulative_max_marks)}</td>
                    <td className="py-1.5 pr-4">
                      {d.grade_label ? (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: d.grade_color ?? "#71717a" }}>{d.grade_label}</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
