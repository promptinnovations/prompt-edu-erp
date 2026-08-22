import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { listExaminations, PASS_COLOR, FAIL_COLOR } from "../../../modules/examination/service";
import {
  getSubjectComparison, getSubjectPerformanceIndicators, getExaminationClassification,
  getClassAttendanceTrend, getClassificationRule,
  getResultSchoolSummary, getResultsBySection, getResultsByClass, getResultsByTeacher,
  getResultsByStage, getSubjectWiseByGrade, getClassMarksHistogram,
  type ResultGroupRow, type TeacherResultRow, type SubjectGradeGroupRow,
} from "../../../modules/analytics/service";
import { getTeacherClassScope } from "../../../services/scope/teacher-scope-service";
import { getStaffSectionScope } from "../../../services/scope/section-head-scope-service";
import { Donut, BarChart, StackedBarChart, Histogram, StatCard, type ChartDatum, type StackedBarGroup } from "../../components/charts/ResultCharts";
import PrintButton from "../../components/PrintButton";
import ExaminationPicker from "./ExaminationPicker";
import AttendanceTrendPicker from "./AttendanceTrendPicker";
import ClassificationRuleForm from "./ClassificationRuleForm";
import RefreshButton from "./RefreshButton";

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 7);
}

const RESULT_TABS = [
  { key: "school", label: "School-wide" },
  { key: "section", label: "Section-wise" },
  { key: "grade", label: "Grade-wise" },
  { key: "class", label: "Class-wise" },
  { key: "subject", label: "Subject-wise" },
  { key: "teacher", label: "Teacher-wise" },
] as const;
type ResultTabKey = (typeof RESULT_TABS)[number]["key"];

function fmtPct(v: number | null): string {
  return v !== null && v !== undefined ? `${v}%` : "—";
}

function gradeCountsToChart(counts: Record<string, number>): ChartDatum[] {
  // No institution-config color available at this call site (a bare
  // grade_label -> count map, e.g. ResultGroupRow.grade_counts, doesn't
  // carry grade_bands.color) — falls back to a neutral series color, never
  // a literal "meaningful" color per band (§K only binds actual grading
  // colors, not this best-effort small-multiple).
  const palette = ["#4f46e5", "#0891b2", "#c026d3", "#ea580c", "#65a30d", "#0d9488", "#9333ea", "#dc2626", "#2563eb"];
  return Object.entries(counts).map(([label, value], i) => ({ label, value, color: palette[i % palette.length] }));
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    examinationId?: string; trendClassId?: string; trendSectionId?: string;
    fromMonth?: string; toMonth?: string; tab?: string; classId?: string;
  }>;
}) {
  const {
    examinationId = "", trendClassId = "", trendSectionId = "",
    fromMonth = monthsAgo(2), toMonth = monthsAgo(0),
    tab: rawTab = "school", classId: selectedClassId = "",
  } = await searchParams;
  const tab: ResultTabKey = RESULT_TABS.some((t) => t.key === rawTab) ? (rawTab as ResultTabKey) : "school";

  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const canView = can(ctx.permissions, "reports.view");
  const canManage = can(ctx.permissions, "settings.manage");

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Analytics</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">You don&apos;t have permission to view analytics.</p>
      </div>
    );
  }

  // Result Analysis spec "role-scoped defaults": School-wide/management-tier
  // roles (marks.approve, settings.manage, or a Super Admin) see every
  // report unrestricted. Everyone else reaching this page (teacher,
  // section_head — reports.view alone) is scoped to their own
  // teacher_assignments / section_head_assignments — Grade-wise/Class-wise/
  // Subject-wise/Teacher-wise rows outside that scope are filtered out
  // rather than merely defaulted-to, since a narrow role has no "drill in"
  // option (per the spec: drill-in is only for broader access).
  const hasBroadResultAccess = ctx.isSuperAdmin || can(ctx.permissions, "marks.approve") || canManage;
  const [teacherScope, staffStageScope] = await Promise.all([
    hasBroadResultAccess ? null : getTeacherClassScope(institutionId, authUserId, ctx.userId),
    hasBroadResultAccess ? null : getStaffSectionScope(institutionId, authUserId, ctx.userId),
  ]);

  const [classes, sections, examinations, rule] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listExaminations(institutionId, authUserId),
    getClassificationRule(institutionId, authUserId),
  ]);

  const [subjectComparison, indicators, classification, schoolSummary] = examinationId
    ? await Promise.all([
        getSubjectComparison(institutionId, authUserId, examinationId),
        getSubjectPerformanceIndicators(institutionId, authUserId, examinationId),
        getExaminationClassification(institutionId, authUserId, examinationId),
        getResultSchoolSummary(institutionId, authUserId, examinationId),
      ])
    : [[], [], [], null];

  const [byStage, byClass, bySection, bySubject, byTeacher] = examinationId
    ? await Promise.all([
        getResultsByStage(institutionId, authUserId, examinationId),
        getResultsByClass(institutionId, authUserId, examinationId),
        getResultsBySection(institutionId, authUserId, examinationId),
        getSubjectWiseByGrade(institutionId, authUserId, examinationId),
        getResultsByTeacher(institutionId, authUserId, examinationId),
      ])
    : [[], [], [], [], []];

  const allowedClassIds = teacherScope ? teacherScope.classIds : null;
  const scopedByClass: ResultGroupRow[] = allowedClassIds
    ? byClass.filter((r) => r.class_id && allowedClassIds.has(r.class_id))
    : byClass;
  const scopedBySection: ResultGroupRow[] = allowedClassIds
    ? bySection.filter((r) => r.class_id && allowedClassIds.has(r.class_id))
    : bySection;
  const scopedBySubject: SubjectGradeGroupRow[] = allowedClassIds
    ? bySubject.filter((r) => {
        if (!allowedClassIds.has(r.class_id)) return false;
        const allowedSubjects = teacherScope!.subjectIdsByClass.get(r.class_id);
        return !allowedSubjects || allowedSubjects.size === 0 || allowedSubjects.has(r.subject_id);
      })
    : bySubject;
  const scopedByStage = staffStageScope && staffStageScope.stages.size > 0
    ? byStage.filter((r) => staffStageScope.stages.has(r.name))
    : byStage;
  const scopedByTeacher: TeacherResultRow[] = !hasBroadResultAccess
    ? byTeacher.filter((r) => r.teacher_user_id === ctx.userId)
    : byTeacher;

  const classOptions = allowedClassIds ? classes.filter((c) => allowedClassIds.has(c.id)) : classes;
  const histogramClassId = selectedClassId || scopedBySection[0]?.class_id || classOptions[0]?.id || "";
  const histogram = examinationId && tab === "class" && histogramClassId
    ? await getClassMarksHistogram(institutionId, authUserId, examinationId, histogramClassId)
    : [];

  const attendanceTrend = trendClassId && trendSectionId
    ? await getClassAttendanceTrend(institutionId, authUserId, trendClassId, trendSectionId, fromMonth, toMonth)
    : [];

  function tabHref(key: string, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({
      examinationId, trendClassId, trendSectionId, fromMonth, toMonth, tab: key, ...extra,
    });
    return `?${params.toString()}`;
  }

  const gradeDonutSegments: ChartDatum[] = (schoolSummary?.grade_distribution ?? [])
    .filter((g) => g.student_count > 0)
    .map((g) => ({ label: g.grade_label, value: g.student_count, color: g.color ?? "#94a3b8" }));
  const passFailSegments: ChartDatum[] = schoolSummary
    ? [
        { label: "Pass", value: schoolSummary.pass_count, color: PASS_COLOR },
        { label: "Fail", value: schoolSummary.fail_count, color: FAIL_COLOR },
      ]
    : [];
  const subjectRankChart: ChartDatum[] = [...subjectComparison]
    .filter((s) => s.avg_marks !== null)
    .sort((a, b) => (b.avg_marks ?? 0) - (a.avg_marks ?? 0))
    .map((s) => ({ label: s.subject_name, value: Number(s.avg_marks), color: "#4f46e5" }));
  const topTeacher = scopedByTeacher[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Analytics</h1>
        <RefreshButton />
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Subject comparison/indicators below read a periodically-refreshed rollup — use &ldquo;Refresh
        analytics&rdquo; after bulk mark approval to see the latest data there. The Result Analysis tabs further
        down read the live `results` table, recomputed automatically the moment marks are approved/locked — no
        refresh needed for those.
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
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Subject comparison</h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <tr><th className="py-1.5">Rank</th><th className="py-1.5">Subject</th><th className="py-1.5">Marked</th><th className="py-1.5">Average</th><th className="py-1.5">Pass %</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {[...subjectComparison].sort((a, b) => (b.avg_marks ?? -1) - (a.avg_marks ?? -1)).map((s, idx) => (
                    <tr key={s.subject_id}>
                      <td className="py-1.5 text-zinc-400 dark:text-zinc-500">#{idx + 1}</td>
                      <td className="py-1.5">{s.subject_name}</td>
                      <td className="py-1.5">{s.marked_count}</td>
                      <td className="py-1.5">{s.avg_marks !== null ? Number(s.avg_marks).toFixed(2) : "—"}</td>
                      <td className="py-1.5">{fmtPct(s.pass_percentage)}</td>
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
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Subject-level performance indicators</h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <tr><th className="py-1.5">Subject</th><th className="py-1.5">Division avg</th><th className="py-1.5">Division pass %</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {indicators.map((i, idx) => (
                    <tr key={`${i.subject_id}-${i.class_id}-${i.section_id}-${idx}`}>
                      <td className="py-1.5">{i.subject_name}</td>
                      <td className="py-1.5">{i.average_performance !== null ? Number(i.average_performance).toFixed(2) : "—"}</td>
                      <td className="py-1.5">{fmtPct(i.pass_percentage)}</td>
                    </tr>
                  ))}
                  {indicators.length === 0 ? (<tr><td colSpan={3} className="py-4 text-center text-zinc-400 dark:text-zinc-500">—</td></tr>) : null}
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
                  <tr><th className="py-1.5">Student</th><th className="py-1.5">Percentage</th><th className="py-1.5">Band</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {classification.map((c) => (
                    <tr key={c.student_id}><td className="py-1.5">{c.student_name}</td><td className="py-1.5">{c.percentage}%</td><td className="py-1.5 capitalize">{c.band.replace("_", " ")}</td></tr>
                  ))}
                  {classification.length === 0 ? (<tr><td colSpan={3} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No computed results for this examination yet.</td></tr>) : null}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-500">Select an examination to see subject and student analytics.</p>
        )}
      </section>

      {examinationId ? (
        <section className="print-area rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Result Analysis</h2>
            <PrintButton label="Print this report" />
          </div>
          {!hasBroadResultAccess ? (
            <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
              Showing your own assigned classes/subjects only{staffStageScope && staffStageScope.stages.size > 0 ? ` (section: ${[...staffStageScope.stages].join(", ")})` : ""}.
            </p>
          ) : null}

          <nav className="no-print mb-4 flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800 pb-2">
            {RESULT_TABS.map((t) => (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === t.key ? "bg-[var(--brand)] text-white" : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {tab === "school" && schoolSummary ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard label="Students with a result" value={String(schoolSummary.total_students)} />
                <StatCard label="School average %" value={fmtPct(schoolSummary.average_percent)} />
                <StatCard label="School pass %" value={fmtPct(schoolSummary.pass_percent)} accent={PASS_COLOR} />
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Grade distribution</h3>
                  <Donut segments={gradeDonutSegments} centerLabel={String(schoolSummary.total_students)} centerSubLabel="students" />
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Pass / fail</h3>
                  <Donut segments={passFailSegments} centerLabel={fmtPct(schoolSummary.pass_percent)} centerSubLabel="pass rate" />
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Subjects ranked by average marks</h3>
                {subjectRankChart.length > 0 ? <BarChart data={subjectRankChart} orientation="horizontal" /> : <p className="text-sm text-zinc-400 dark:text-zinc-500">No approved marks yet.</p>}
              </div>
              {topTeacher ? (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">Top-performing teacher (this exam)</p>
                  <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{topTeacher.teacher_name} <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">— {topTeacher.subject_name}</span></p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Average {topTeacher.average_marks}/{topTeacher.max_marks} · Pass {fmtPct(topTeacher.pass_percentage)}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {tab === "school" && !schoolSummary ? <p className="text-sm text-zinc-400 dark:text-zinc-500">No computed results for this examination yet.</p> : null}

          {tab === "section" ? (
            <ResultGroupSection
              rows={scopedByStage}
              nameHeader="Section (stage)"
              showParent={false}
              emptyText="No computed results for this examination yet."
            />
          ) : null}

          {tab === "grade" ? (
            <div className="space-y-6">
              <ResultGroupSection rows={scopedByClass} nameHeader="Grade" showParent={false} emptyText="No computed results for this examination yet." />
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Division comparison within each grade</h3>
                <div className="space-y-4">
                  {scopedByClass.map((g) => {
                    const divisions = scopedBySection.filter((s) => s.parent_name === g.name);
                    if (divisions.length === 0) return null;
                    const chart: ChartDatum[] = divisions.map((d, i) => ({
                      label: d.name, value: d.average_percent ?? 0,
                      color: ["#4f46e5", "#0891b2", "#c026d3", "#ea580c", "#65a30d"][i % 5],
                    }));
                    return (
                      <div key={g.id}>
                        <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">{g.name}</p>
                        <BarChart data={chart} orientation="horizontal" valueFormat={(v) => `${v}%`} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "class" ? (
            <div className="space-y-6">
              <ResultGroupSection rows={scopedBySection} nameHeader="Division" showParent emptyText="No computed results for this examination yet." />
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Marks-distribution histogram</h3>
                <div className="no-print mb-3 flex flex-wrap gap-1">
                  {classOptions.map((c) => (
                    <Link
                      key={c.id}
                      href={tabHref("class", { classId: c.id })}
                      className={`rounded-lg px-2.5 py-1 text-xs ${histogramClassId === c.id ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
                {histogram.length > 0 ? <Histogram buckets={histogram.map((h) => ({ label: h.label, value: h.count, color: h.color }))} /> : <p className="text-sm text-zinc-400 dark:text-zinc-500">Select a division above.</p>}
              </div>
            </div>
          ) : null}

          {tab === "subject" ? (
            <SubjectWiseSection rows={scopedBySubject} />
          ) : null}

          {tab === "teacher" ? (
            <TeacherWiseSection rows={scopedByTeacher} />
          ) : null}
        </section>
      ) : (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Result Analysis</h2>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Select an examination above to see School/Section/Grade/Class/Subject/Teacher-wise reports.</p>
        </section>
      )}

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
              <tr><th className="py-1.5">Month</th><th className="py-1.5">Present days</th><th className="py-1.5">Late days</th><th className="py-1.5">Total days</th><th className="py-1.5">Present %</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {attendanceTrend.map((t) => (
                <tr key={t.month}><td className="py-1.5">{t.month}</td><td className="py-1.5">{t.present_days}</td><td className="py-1.5">{t.late_days}</td><td className="py-1.5">{t.total_days}</td><td className="py-1.5">{t.present_percent}%</td></tr>
              ))}
              {attendanceTrend.length === 0 ? (<tr><td colSpan={5} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No attendance data in this range.</td></tr>) : null}
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
          <ClassificationRuleForm highThreshold={rule?.high_threshold ?? 75} lowThreshold={rule?.low_threshold ?? 40} />
        </section>
      ) : null}
    </div>
  );
}

/** Shared table + comparison bar chart for Section/Grade/Class-wise tabs —
 *  every color here is the fixed PASS_COLOR (never a per-band color, since
 *  this is one flat average-% comparison, not a grade breakdown). */
function ResultGroupSection({
  rows, nameHeader, showParent, emptyText,
}: { rows: ResultGroupRow[]; nameHeader: string; showParent: boolean; emptyText: string }) {
  const chart: ChartDatum[] = rows.map((r) => ({ label: r.name, value: r.average_percent ?? 0, color: PASS_COLOR }));
  const stacked: StackedBarGroup[] = rows.map((r) => ({ label: r.name, segments: gradeCountsToChart(r.grade_counts) }));
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Rank</th>
              {showParent ? <th className="py-1.5">Class</th> : null}
              <th className="py-1.5">{nameHeader}</th>
              <th className="py-1.5">Students</th>
              <th className="py-1.5">Average %</th>
              <th className="py-1.5">Pass</th>
              <th className="py-1.5">Fail</th>
              <th className="py-1.5">Pass %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r, idx) => (
              <tr key={r.id}>
                <td className="py-1.5 text-zinc-400 dark:text-zinc-500">#{idx + 1}</td>
                {showParent ? <td className="py-1.5">{r.parent_name}</td> : null}
                <td className="py-1.5">{r.name}</td>
                <td className="py-1.5">{r.student_count}</td>
                <td className="py-1.5">{fmtPct(r.average_percent)}</td>
                <td className="py-1.5" style={{ color: PASS_COLOR }}>{r.pass_count}</td>
                <td className="py-1.5" style={{ color: FAIL_COLOR }}>{r.fail_count}</td>
                <td className="py-1.5">{fmtPct(r.pass_percent)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (<tr><td colSpan={showParent ? 8 : 7} className="py-4 text-center text-zinc-400 dark:text-zinc-500">{emptyText}</td></tr>) : null}
          </tbody>
        </table>
      </div>
      {rows.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Average % comparison</p>
          <BarChart data={chart} orientation="horizontal" valueFormat={(v) => `${v}%`} />
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Grade distribution</p>
          <StackedBarChart groups={stacked} />
        </div>
      ) : null}
    </div>
  );
}

function SubjectWiseSection({ rows }: { rows: SubjectGradeGroupRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-zinc-400 dark:text-zinc-500">No computed marks for this examination yet.</p>;
  const byClass = new Map<string, SubjectGradeGroupRow[]>();
  for (const r of rows) {
    if (!byClass.has(r.class_name)) byClass.set(r.class_name, []);
    byClass.get(r.class_name)!.push(r);
  }
  return (
    <div className="space-y-8">
      {Array.from(byClass.entries()).map(([className, subjects]) => {
        const chart: ChartDatum[] = subjects
          .filter((s) => s.average_percent !== null)
          .sort((a, b) => (b.average_percent ?? 0) - (a.average_percent ?? 0))
          .map((s) => ({ label: s.subject_name, value: s.average_percent ?? 0, color: "#4f46e5" }));
        return (
          <div key={className}>
            <h3 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{className}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-1.5">Subject</th><th className="py-1.5">Count</th><th className="py-1.5">Avg %</th>
                    <th className="py-1.5">Max</th><th className="py-1.5">Min</th>
                    <th className="py-1.5">Pass %</th><th className="py-1.5">Fail %</th><th className="py-1.5">Top bands</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {subjects.map((s) => (
                    <tr key={s.subject_id}>
                      <td className="py-1.5">{s.subject_name}</td>
                      <td className="py-1.5">{s.count}</td>
                      <td className="py-1.5">{fmtPct(s.average_percent)}</td>
                      <td className="py-1.5">{s.max_obtained ?? "—"}</td>
                      <td className="py-1.5">{s.min_obtained ?? "—"}</td>
                      <td className="py-1.5" style={{ color: PASS_COLOR }}>{fmtPct(s.pass_percentage)}</td>
                      <td className="py-1.5" style={{ color: FAIL_COLOR }}>{s.count > 0 ? fmtPct(Math.round((s.fail_count / s.count) * 10000) / 100) : "—"}</td>
                      <td className="py-1.5 text-xs">
                        {s.top_band_counts.map((b) => (
                          <span key={b.grade_label} className="mr-1.5 inline-flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: b.color ?? "#94a3b8" }} />
                            {b.grade_label}: {b.count}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {chart.length > 0 ? (
              <div className="mt-3">
                <BarChart data={chart} orientation="horizontal" valueFormat={(v) => `${v}%`} />
              </div>
            ) : null}
            {subjects.some((s) => s.below_threshold.length > 0) ? (
              <div className="mt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Students below pass threshold (weakest first)</p>
                <div className="space-y-2 text-xs">
                  {subjects.filter((s) => s.below_threshold.length > 0).map((s) => (
                    <div key={s.subject_id}>
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">{s.subject_name}: </span>
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {s.below_threshold.map((b) => `${b.student_name} (${b.percentage}%)`).join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TeacherWiseSection({ rows }: { rows: TeacherResultRow[] }) {
  const chart: ChartDatum[] = rows
    .filter((r) => r.average_marks !== null)
    .map((r) => ({ label: `${r.teacher_name} (${r.subject_name})`, value: r.average_marks ?? 0, color: "#4f46e5" }));
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Rank</th><th className="py-1.5">Teacher</th><th className="py-1.5">Subject</th>
              <th className="py-1.5">Marked</th><th className="py-1.5">Max</th><th className="py-1.5">Avg</th>
              <th className="py-1.5">Median</th><th className="py-1.5">Highest</th><th className="py-1.5">Lowest</th>
              <th className="py-1.5">Pass %</th><th className="py-1.5">Full marks</th><th className="py-1.5">Fail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((t, idx) => (
              <tr key={`${t.teacher_user_id}-${t.subject_id}`}>
                <td className="py-1.5 text-zinc-400 dark:text-zinc-500">#{idx + 1}</td>
                <td className="py-1.5">{t.teacher_name}</td>
                <td className="py-1.5">{t.subject_name}</td>
                <td className="py-1.5">{t.marked_count}</td>
                <td className="py-1.5">{t.max_marks}</td>
                <td className="py-1.5">{t.average_marks ?? "—"}</td>
                <td className="py-1.5">{t.median_marks ?? "—"}</td>
                <td className="py-1.5">{t.highest_marks ?? "—"}</td>
                <td className="py-1.5">{t.lowest_marks ?? "—"}</td>
                <td className="py-1.5" style={{ color: PASS_COLOR }}>{fmtPct(t.pass_percentage)}</td>
                <td className="py-1.5">{t.full_marks_count}</td>
                <td className="py-1.5" style={{ color: FAIL_COLOR }}>{t.fail_count}</td>
              </tr>
            ))}
            {rows.length === 0 ? (<tr><td colSpan={12} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No teacher assignments cover this examination&apos;s subjects/classes yet.</td></tr>) : null}
          </tbody>
        </table>
      </div>
      {chart.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Top-performing teachers (ranked by average marks)</p>
          <BarChart data={chart} orientation="horizontal" />
        </div>
      ) : null}
    </div>
  );
}
