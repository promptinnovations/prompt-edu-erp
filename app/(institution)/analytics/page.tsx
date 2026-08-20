import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { listExaminations } from "../../../modules/examination/service";
import {
  getSubjectComparison, getSubjectPerformanceIndicators, getExaminationClassification,
  getClassAttendanceTrend, getClassificationRule,
  getResultSchoolSummary, getResultsBySection, getResultsByClass, getResultsByGrade, getResultsByTeacher,
} from "../../../modules/analytics/service";
import ExaminationPicker from "./ExaminationPicker";
import AttendanceTrendPicker from "./AttendanceTrendPicker";
import ClassificationRuleForm from "./ClassificationRuleForm";
import RefreshButton from "./RefreshButton";

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 7);
}

function formatGradeCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "—";
  return entries.map(([label, count]) => `${label}: ${count}`).join(", ");
}

/** Plain-CSS-bar grade distribution — same no-library convention as the
 *  Dashboard's pass-rate-trend/attendance-trend widgets. */
function GradeDistributionBar({ distribution }: { distribution: Array<{ grade_label: string; student_count: number }> }) {
  if (distribution.every((d) => d.student_count === 0)) {
    return <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">No computed results for this examination yet.</p>;
  }
  const max = Math.max(1, ...distribution.map((d) => d.student_count));
  return (
    <div className="mt-3 flex items-end gap-3" style={{ height: 90 }}>
      {distribution.map((d) => (
        <div key={d.grade_label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{d.student_count}</span>
          <div className="w-full rounded-t bg-[var(--brand)]/70" style={{ height: `${Math.max(4, (d.student_count / max) * 60)}px` }} />
          <span className="max-w-full truncate text-[10px] text-zinc-400 dark:text-zinc-500">{d.grade_label}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    examinationId?: string; trendClassId?: string; trendSectionId?: string;
    fromMonth?: string; toMonth?: string;
  }>;
}) {
  const {
    examinationId = "", trendClassId = "", trendSectionId = "",
    fromMonth = monthsAgo(2), toMonth = monthsAgo(0),
  } = await searchParams;

  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const canView = can(ctx.permissions, "reports.view");
  const canManage = can(ctx.permissions, "settings.manage");

  const [classes, sections, examinations, rule] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listExaminations(institutionId, authUserId),
    getClassificationRule(institutionId, authUserId),
  ]);

  const [subjectComparison, indicators, classification, schoolSummary, bySection, byClass, byGrade, byTeacher] = examinationId
    ? await Promise.all([
        getSubjectComparison(institutionId, authUserId, examinationId),
        getSubjectPerformanceIndicators(institutionId, authUserId, examinationId),
        getExaminationClassification(institutionId, authUserId, examinationId),
        getResultSchoolSummary(institutionId, authUserId, examinationId),
        getResultsBySection(institutionId, authUserId, examinationId),
        getResultsByClass(institutionId, authUserId, examinationId),
        getResultsByGrade(institutionId, authUserId, examinationId),
        getResultsByTeacher(institutionId, authUserId, examinationId),
      ])
    : [[], [], [], null, [], [], [], []];

  const attendanceTrend = trendClassId && trendSectionId
    ? await getClassAttendanceTrend(institutionId, authUserId, trendClassId, trendSectionId, fromMonth, toMonth)
    : [];

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Analytics</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">You don&apos;t have permission to view analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Analytics</h1>
        <RefreshButton />
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Figures are read from a periodically-refreshed rollup, not computed live on every load — use
        &ldquo;Refresh analytics&rdquo; after bulk mark approval or attendance close-out to see the latest data immediately.
      </p>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Examination performance</h2>
        <ExaminationPicker
          examinations={examinations}
          examinationId={examinationId}
          trendClassId={trendClassId}
          trendSectionId={trendSectionId}
          fromMonth={fromMonth}
          toMonth={toMonth}
        />

        {examinationId ? (
          <div className="mt-4 space-y-6">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Subject comparison (subject wise)</h3>
              <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
                Rank is by average marks, highest first — a neutral signal, not a scored verdict.
              </p>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-1.5">Rank</th>
                    <th className="py-1.5">Subject</th>
                    <th className="py-1.5">Marked</th>
                    <th className="py-1.5">Average</th>
                    <th className="py-1.5">Pass %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {[...subjectComparison]
                    .sort((a, b) => (b.avg_marks ?? -1) - (a.avg_marks ?? -1))
                    .map((s, idx) => (
                    <tr key={s.subject_id}>
                      <td className="py-1.5 text-zinc-400 dark:text-zinc-500">#{idx + 1}</td>
                      <td className="py-1.5">{s.subject_name}</td>
                      <td className="py-1.5">{s.marked_count}</td>
                      <td className="py-1.5">{s.avg_marks !== null ? Number(s.avg_marks).toFixed(2) : "—"}</td>
                      <td className="py-1.5">{s.pass_percentage !== null ? `${s.pass_percentage}%` : "—"}</td>
                    </tr>
                  ))}
                  {subjectComparison.length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No approved marks yet for this examination.</td></tr>
                  ) : null}
                </tbody>
              </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Subject-level performance indicators
              </h3>
              <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
                Performance indicator — requires management interpretation. Not attributed to an individual
                teacher (per-teacher attribution needs the staff/subject-assignment mapping, planned for a
                later phase).
              </p>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-1.5">Subject</th>
                    <th className="py-1.5">Division avg</th>
                    <th className="py-1.5">Division pass %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {indicators.map((i, idx) => (
                    <tr key={`${i.subject_id}-${i.class_id}-${i.section_id}-${idx}`}>
                      <td className="py-1.5">{i.subject_name}</td>
                      <td className="py-1.5">{i.average_performance !== null ? Number(i.average_performance).toFixed(2) : "—"}</td>
                      <td className="py-1.5">{i.pass_percentage !== null ? `${i.pass_percentage}%` : "—"}</td>
                    </tr>
                  ))}
                  {indicators.length === 0 ? (
                    <tr><td colSpan={3} className="py-4 text-center text-zinc-400 dark:text-zinc-500">—</td></tr>
                  ) : null}
                </tbody>
              </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Student classification {rule ? `(≥${rule.high_threshold}% high, <${rule.low_threshold}% low)` : "(no rule configured)"}
              </h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-1.5">Student</th>
                    <th className="py-1.5">Percentage</th>
                    <th className="py-1.5">Band</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {classification.map((c) => (
                    <tr key={c.student_id}>
                      <td className="py-1.5">{c.student_name}</td>
                      <td className="py-1.5">{c.percentage}%</td>
                      <td className="py-1.5 capitalize">{c.band.replace("_", " ")}</td>
                    </tr>
                  ))}
                  {classification.length === 0 ? (
                    <tr><td colSpan={3} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No computed results for this examination yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-500">Select an examination to see subject and student analytics.</p>
        )}
      </section>

      {examinationId && schoolSummary ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Result Analysis</h2>

          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">School-wide</h3>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Students with a result</p>
                  <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{schoolSummary.total_students}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Average %</p>
                  <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {schoolSummary.average_percent !== null ? `${schoolSummary.average_percent}%` : "—"}
                  </p>
                </div>
              </div>
              <GradeDistributionBar distribution={schoolSummary.grade_distribution} />
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Division wise</h3>
              <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">Ranked by average %, highest first.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="py-1.5">Rank</th>
                      <th className="py-1.5">Class</th>
                      <th className="py-1.5">Division</th>
                      <th className="py-1.5">Students</th>
                      <th className="py-1.5">Average %</th>
                      <th className="py-1.5">Grade spread</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {bySection.map((r, idx) => (
                      <tr key={r.id}>
                        <td className="py-1.5 text-zinc-400 dark:text-zinc-500">#{idx + 1}</td>
                        <td className="py-1.5">{r.parent_name}</td>
                        <td className="py-1.5">{r.name}</td>
                        <td className="py-1.5">{r.student_count}</td>
                        <td className="py-1.5">{r.average_percent !== null ? `${r.average_percent}%` : "—"}</td>
                        <td className="py-1.5 text-xs text-zinc-500 dark:text-zinc-400">{formatGradeCounts(r.grade_counts)}</td>
                      </tr>
                    ))}
                    {bySection.length === 0 ? (
                      <tr><td colSpan={6} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No computed results for this examination yet.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Class wise</h3>
              <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">Ranked by average %, highest first.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="py-1.5">Rank</th>
                      <th className="py-1.5">Class</th>
                      <th className="py-1.5">Students</th>
                      <th className="py-1.5">Average %</th>
                      <th className="py-1.5">Grade spread</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {byClass.map((r, idx) => (
                      <tr key={r.id}>
                        <td className="py-1.5 text-zinc-400 dark:text-zinc-500">#{idx + 1}</td>
                        <td className="py-1.5">{r.name}</td>
                        <td className="py-1.5">{r.student_count}</td>
                        <td className="py-1.5">{r.average_percent !== null ? `${r.average_percent}%` : "—"}</td>
                        <td className="py-1.5 text-xs text-zinc-500 dark:text-zinc-400">{formatGradeCounts(r.grade_counts)}</td>
                      </tr>
                    ))}
                    {byClass.length === 0 ? (
                      <tr><td colSpan={5} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No computed results for this examination yet.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Grade wise</h3>
              {byGrade.length === 0 ? (
                <p className="text-sm text-zinc-400 dark:text-zinc-500">No grade scale configured for this examination.</p>
              ) : (
                <div className="space-y-3">
                  {byGrade.map((g) => (
                    <div key={g.grade_band_id} className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          {g.grade_label} <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">({g.min_percent}–{g.max_percent}%)</span>
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{g.student_count} student{g.student_count === 1 ? "" : "s"}</span>
                      </div>
                      {g.top_students.length > 0 ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Top: {g.top_students.map((t) => `${t.student_name} (${t.percentage}%)`).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Teacher wise</h3>
              <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
                Attributed via Staff &gt; Teacher Assignments for this exam&apos;s academic year — a neutral signal, not a scored verdict.
                Ranked by average marks, highest first.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="py-1.5">Rank</th>
                      <th className="py-1.5">Teacher</th>
                      <th className="py-1.5">Subject</th>
                      <th className="py-1.5">Marked</th>
                      <th className="py-1.5">Average</th>
                      <th className="py-1.5">Pass %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {byTeacher.map((t, idx) => (
                      <tr key={`${t.teacher_user_id}-${t.subject_id}`}>
                        <td className="py-1.5 text-zinc-400 dark:text-zinc-500">#{idx + 1}</td>
                        <td className="py-1.5">{t.teacher_name}</td>
                        <td className="py-1.5">{t.subject_name}</td>
                        <td className="py-1.5">{t.marked_count}</td>
                        <td className="py-1.5">{t.average_marks !== null ? Number(t.average_marks).toFixed(2) : "—"}</td>
                        <td className="py-1.5">{t.pass_percentage !== null ? `${t.pass_percentage}%` : "—"}</td>
                      </tr>
                    ))}
                    {byTeacher.length === 0 ? (
                      <tr><td colSpan={6} className="py-4 text-center text-zinc-400 dark:text-zinc-500">
                        No teacher assignments cover this examination&apos;s subjects/classes yet.
                      </td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Class attendance trend</h2>
        <AttendanceTrendPicker
          classes={classes}
          sections={sections}
          classId={trendClassId}
          sectionId={trendSectionId}
          fromMonth={fromMonth}
          toMonth={toMonth}
          examinationId={examinationId}
        />
        {trendClassId && trendSectionId ? (
          <div className="overflow-x-auto">
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1.5">Month</th>
                <th className="py-1.5">Present days</th>
                <th className="py-1.5">Late days</th>
                <th className="py-1.5">Total days</th>
                <th className="py-1.5">Present %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {attendanceTrend.map((t) => (
                <tr key={t.month}>
                  <td className="py-1.5">{t.month}</td>
                  <td className="py-1.5">{t.present_days}</td>
                  <td className="py-1.5">{t.late_days}</td>
                  <td className="py-1.5">{t.total_days}</td>
                  <td className="py-1.5">{t.present_percent}%</td>
                </tr>
              ))}
              {attendanceTrend.length === 0 ? (
                <tr><td colSpan={5} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No attendance data in this range.</td></tr>
              ) : null}
            </tbody>
          </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-500">Select a class and section to see the attendance trend.</p>
        )}
      </section>

      {canManage ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Classification thresholds (percentage)</h2>
          <ClassificationRuleForm
            highThreshold={rule?.high_threshold ?? 75}
            lowThreshold={rule?.low_threshold ?? 40}
          />
        </section>
      ) : null}
    </div>
  );
}
