import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { listExaminations } from "../../../modules/examination/service";
import {
  getSubjectComparison, getSubjectPerformanceIndicators, getExaminationClassification,
  getClassAttendanceTrend, getClassificationRule,
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

  const [subjectComparison, indicators, classification] = examinationId
    ? await Promise.all([
        getSubjectComparison(institutionId, authUserId, examinationId),
        getSubjectPerformanceIndicators(institutionId, authUserId, examinationId),
        getExaminationClassification(institutionId, authUserId, examinationId),
      ])
    : [[], [], []];

  const attendanceTrend = trendClassId && trendSectionId
    ? await getClassAttendanceTrend(institutionId, authUserId, trendClassId, trendSectionId, fromMonth, toMonth)
    : [];

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Analytics</h1>
        <p className="text-sm text-zinc-500">You don&apos;t have permission to view analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">Analytics</h1>
        <RefreshButton />
      </div>
      <p className="text-xs text-zinc-400">
        Figures are read from a periodically-refreshed rollup, not computed live on every load — use
        &ldquo;Refresh analytics&rdquo; after bulk mark approval or attendance close-out to see the latest data immediately.
      </p>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Examination performance</h2>
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
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Subject comparison</h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-1.5">Subject</th>
                    <th className="py-1.5">Marked</th>
                    <th className="py-1.5">Average</th>
                    <th className="py-1.5">Pass %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {subjectComparison.map((s) => (
                    <tr key={s.subject_id}>
                      <td className="py-1.5">{s.subject_name}</td>
                      <td className="py-1.5">{s.marked_count}</td>
                      <td className="py-1.5">{s.avg_marks !== null ? Number(s.avg_marks).toFixed(2) : "—"}</td>
                      <td className="py-1.5">{s.pass_percentage !== null ? `${s.pass_percentage}%` : "—"}</td>
                    </tr>
                  ))}
                  {subjectComparison.length === 0 ? (
                    <tr><td colSpan={4} className="py-4 text-center text-zinc-400">No approved marks yet for this examination.</td></tr>
                  ) : null}
                </tbody>
              </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Subject-level performance indicators
              </h3>
              <p className="mb-2 text-xs text-zinc-400">
                Performance indicator — requires management interpretation. Not attributed to an individual
                teacher (per-teacher attribution needs the staff/subject-assignment mapping, planned for a
                later phase).
              </p>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-1.5">Subject</th>
                    <th className="py-1.5">Section avg</th>
                    <th className="py-1.5">Section pass %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {indicators.map((i, idx) => (
                    <tr key={`${i.subject_id}-${i.class_id}-${i.section_id}-${idx}`}>
                      <td className="py-1.5">{i.subject_name}</td>
                      <td className="py-1.5">{i.average_performance !== null ? Number(i.average_performance).toFixed(2) : "—"}</td>
                      <td className="py-1.5">{i.pass_percentage !== null ? `${i.pass_percentage}%` : "—"}</td>
                    </tr>
                  ))}
                  {indicators.length === 0 ? (
                    <tr><td colSpan={3} className="py-4 text-center text-zinc-400">—</td></tr>
                  ) : null}
                </tbody>
              </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Student classification {rule ? `(≥${rule.high_threshold}% high, <${rule.low_threshold}% low)` : "(no rule configured)"}
              </h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-1.5">Student</th>
                    <th className="py-1.5">Percentage</th>
                    <th className="py-1.5">Band</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {classification.map((c) => (
                    <tr key={c.student_id}>
                      <td className="py-1.5">{c.student_name}</td>
                      <td className="py-1.5">{c.percentage}%</td>
                      <td className="py-1.5 capitalize">{c.band.replace("_", " ")}</td>
                    </tr>
                  ))}
                  {classification.length === 0 ? (
                    <tr><td colSpan={3} className="py-4 text-center text-zinc-400">No computed results for this examination yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">Select an examination to see subject and student analytics.</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Class attendance trend</h2>
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
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-1.5">Month</th>
                <th className="py-1.5">Present days</th>
                <th className="py-1.5">Late days</th>
                <th className="py-1.5">Total days</th>
                <th className="py-1.5">Present %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
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
                <tr><td colSpan={5} className="py-4 text-center text-zinc-400">No attendance data in this range.</td></tr>
              ) : null}
            </tbody>
          </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">Select a class and section to see the attendance trend.</p>
        )}
      </section>

      {canManage ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">Classification thresholds (percentage)</h2>
          <ClassificationRuleForm
            highThreshold={rule?.high_threshold ?? 75}
            lowThreshold={rule?.low_threshold ?? 40}
          />
        </section>
      ) : null}
    </div>
  );
}
