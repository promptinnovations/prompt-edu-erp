import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { listExaminations, listExamTypes, examinationWorkflowStatus, PASS_COLOR, FAIL_COLOR } from "../../../modules/examination/service";
import {
  getSubjectComparison, getSubjectPerformanceIndicators, getExaminationClassification,
  getClassAttendanceTrend, getClassificationRule,
  getResultSchoolSummary, getResultsBySection, getResultsByClass, getResultsByTeacher,
  getResultsByStage, getSubjectWiseByGrade, getClassMarksHistogram, getTrackWiseSummary,
  listDailyAssessmentYears,
  type ResultGroupRow, type TeacherResultRow, type SubjectGradeGroupRow, type TrackResultSummary,
} from "../../../modules/analytics/service";
import { getTeacherClassScope } from "../../../services/scope/teacher-scope-service";
import { getStaffSectionScope } from "../../../services/scope/section-head-scope-service";
import { getInstitution, institutionNoun } from "../../../services/institution/institution-service";
import { Donut, BarChart, StackedBarChart, Histogram, StatCard, LineTrendChart, type ChartDatum, type StackedBarGroup, type LineSeries } from "../../components/charts/ResultCharts";
import PrintButton from "../../components/PrintButton";
import ExaminationPicker from "./ExaminationPicker";
import AttendanceTrendPicker from "./AttendanceTrendPicker";
import ClassificationRuleForm from "./ClassificationRuleForm";
import RefreshButton from "./RefreshButton";
import { CHART_SERIES, CHART_OVERFLOW, seriesColor } from "../../components/charts/series";
import { monthsAgoIST } from "../../../services/datetime/ist";
import { formatMarks } from "../../../services/format/marks";

function monthsAgo(n: number): string {
  return monthsAgoIST(n);
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
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

/** §Analytics follow-up: "when opens, latest exam should be there as
 *  default, other exams shall be selected from the button row" — previously
 *  `examinationId` defaulted to `""` (nothing selected) until the admin
 *  picked one and pressed Load, and even after that it just picked
 *  whichever exam had the latest `start_date` regardless of whether marks
 *  had actually been entered for it yet (so a freshly-created future exam
 *  with zero marks could "win" and the page would open to an empty
 *  "Students with a result: 0" screen). Now prefers the latest-dated exam
 *  among those whose mark entry is actually done (examinationWorkflowStatus
 *  past "open" — i.e. Closed/Published/Archived, meaning the admin closed
 *  mark entry for it), falling back to the old "latest exam overall" logic
 *  only when no exam has closed mark entry yet. An exam with no start_date
 *  falls back to `examinations`' own order (listExaminations() sorts
 *  `created_at desc`, so index 0 is still "most recent" among undated
 *  exams) within whichever pool (completed vs. all) is in play. */
function pickDefaultExaminationId(
  exams: Array<{ id: string; start_date: string | null; marks_closed_at?: string | null; published_at?: string | null; finalized_at?: string | null }>
): string {
  if (exams.length === 0) return "";
  const completed = exams.filter((e) => examinationWorkflowStatus(e) !== "open");
  const pool = completed.length > 0 ? completed : exams;
  const dated = pool.filter((e) => e.start_date);
  if (dated.length > 0) {
    return dated.reduce((latest, e) => (e.start_date! > latest.start_date! ? e : latest)).id;
  }
  return pool[0].id;
}

function gradeCountsToChart(counts: Record<string, number>): ChartDatum[] {
  // No institution-config color available at this call site (a bare
  // grade_label -> count map, e.g. ResultGroupRow.grade_counts, doesn't
  // carry grade_bands.color) — falls back to a neutral series color, never
  // a literal "meaningful" color per band (§K only binds actual grading
  // colors, not this best-effort small-multiple).
  return Object.entries(counts).map(([label, value], i) => ({ label, value, color: seriesColor(i) }));
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    examinationId?: string; trendClassIds?: string | string[]; trendSectionId?: string;
    trendMonths?: string | string[]; tab?: string; classId?: string;
  }>;
}) {
  const {
    examinationId: examinationIdParam = "", trendClassIds: trendClassIdsParam, trendSectionId = "",
    trendMonths: trendMonthsParam,
    tab: rawTab = "school", classId: selectedClassId = "",
  } = await searchParams;
  // The trend picker is a GET form with checkbox groups, so these arrive as
  // REPEATED params (?trendClassIds=a&trendClassIds=b -> string[]); links
  // elsewhere on this page still build them comma-joined. Accept both.
  const toList = (v: string | string[] | undefined): string[] =>
    (Array.isArray(v) ? v : v ? v.split(",") : []).map((x) => x.trim()).filter(Boolean);
  const requestedTrendClassIds = toList(trendClassIdsParam);
  // §Attendance-trend-redesign follow-up — default to the last 3 months
  // (same window the old fromMonth/toMonth default covered) only when the
  // admin hasn't picked any months yet, so the picker opens pre-populated
  // with something to look at rather than a blank chart.
  const requestedTrendMonths = toList(trendMonthsParam);
  const trendMonths = requestedTrendMonths.length > 0
    ? requestedTrendMonths
    : [monthsAgo(2), monthsAgo(1), monthsAgo(0)];
  const tab: ResultTabKey = RESULT_TABS.some((t) => t.key === rawTab) ? (rawTab as ResultTabKey) : "school";

  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const canView = can(ctx.permissions, "reports.view");
  const canManage = can(ctx.permissions, "settings.manage");

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Result Analysis</h1>
        <p className="text-sm text-zinc-500">You don&apos;t have permission to view Result Analysis.</p>
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

  const [classes, sections, allExaminations, examTypes, dailyYears, rule, institution] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listExaminations(institutionId, authUserId),
    listExamTypes(institutionId, authUserId),
    listDailyAssessmentYears(institutionId, authUserId),
    getClassificationRule(institutionId, authUserId),
    getInstitution(institutionId, authUserId),
  ]);
  // §Daily-assessment-analytics — Daily Assessment registers never write to
  // `results` (their marks live in daily_assessment_marks), so every tab on
  // this page is structurally empty for them; worse, pickDefaultExaminationId
  // was happily defaulting to one ("Daily Assessment — August 2026 ... Students
  // with a result: 0"). They're removed from the pill row and the default
  // pick, and replaced by ONE "Daily assessments <year>" button that opens
  // their own month-wise page (/analytics/daily-assessments).
  const dailyTypeIds = new Set(examTypes.filter((t) => t.is_daily_assessment).map((t) => t.id));
  const examinations = allExaminations.filter((e) => !dailyTypeIds.has(e.exam_type_id));
  const dailyYear = dailyYears.find((y) => y.is_current) ?? dailyYears[0] ?? null;
  // §Attendance-trend revision ("default latest must be open first") — with
  // nothing selected the trend used to render an empty "select at least one
  // class" prompt; it now opens on the first class (the months already
  // default to the latest three above), so the section is useful on arrival
  // and the Load button is for CHANGING that, not for seeing anything at all.
  const trendClassIds = requestedTrendClassIds.length > 0
    ? requestedTrendClassIds
    : (classes[0] ? [classes[0].id] : []);
  const dailyAssessmentsLink = dailyYear
    ? { label: `Daily assessments ${dailyYear.name}`, href: `/analytics/daily-assessments?academicYearId=${encodeURIComponent(dailyYear.id)}` }
    : null;
  // §"if a tenant type is Madrasa, use madrasa everywhere ... if it is a
  // college, use college instead ... for school, school only" — the word
  // this page uses in place of the generic "School" in tab/stat labels.
  const noun = institutionNoun(institution?.type ?? "school");

  const examinationId = examinationIdParam || pickDefaultExaminationId(examinations);

  const [subjectComparison, indicators, classification, schoolSummary, trackSummaries] = examinationId
    ? await Promise.all([
        getSubjectComparison(institutionId, authUserId, examinationId),
        getSubjectPerformanceIndicators(institutionId, authUserId, examinationId),
        getExaminationClassification(institutionId, authUserId, examinationId),
        getResultSchoolSummary(institutionId, authUserId, examinationId),
        getTrackWiseSummary(institutionId, authUserId, examinationId),
      ])
    : [[], [], [], null, []];

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

  // §Attendance-trend-redesign follow-up ("all classes, months should be
  // buttons — selected, details comes") — one getClassAttendanceTrend call
  // per selected class (sectionId "" means "all divisions" -> null, the
  // aggregate option), fetched across the min..max of the selected months
  // so a non-contiguous selection (e.g. Jan + Mar, skipping Feb) still
  // returns both ends in one query per class, then filtered down to just
  // the selected months for charting/the table.
  const sortedTrendMonths = [...trendMonths].sort();
  const attendanceTrendByClass = trendClassIds.length > 0 && sortedTrendMonths.length > 0
    ? await Promise.all(
        trendClassIds.map(async (cid) => {
          const cls = classes.find((c) => c.id === cid);
          const rows = await getClassAttendanceTrend(
            institutionId, authUserId, cid, trendSectionId || null,
            sortedTrendMonths[0], sortedTrendMonths[sortedTrendMonths.length - 1]
          );
          const byMonth = new Map(rows.map((r) => [r.month.slice(0, 7), r]));
          return { classId: cid, className: cls?.name ?? cid, rows: sortedTrendMonths.map((m) => byMonth.get(m) ?? null) };
        })
      )
    : [];

  function tabHref(key: string, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({
      examinationId, trendClassIds: trendClassIds.join(","), trendSectionId, trendMonths: trendMonths.join(","), tab: key, ...extra,
    });
    return `?${params.toString()}`;
  }

  const gradeDonutSegments: ChartDatum[] = (schoolSummary?.grade_distribution ?? [])
    .filter((g) => g.student_count > 0)
    .map((g) => ({ label: g.grade_label, value: g.student_count, color: g.color ?? CHART_OVERFLOW }));
  const passFailSegments: ChartDatum[] = schoolSummary
    ? [
        { label: "Pass", value: schoolSummary.pass_count, color: PASS_COLOR },
        { label: "Fail", value: schoolSummary.fail_count, color: FAIL_COLOR },
      ]
    : [];
  const subjectRankChart: ChartDatum[] = [...subjectComparison]
    .filter((s) => s.avg_marks !== null)
    .sort((a, b) => (b.avg_marks ?? 0) - (a.avg_marks ?? 0))
    .map((s) => ({ label: s.subject_name, value: Number(s.avg_marks), color: CHART_SERIES[0] }));
  const topTeacher = scopedByTeacher[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Result Analysis</h1>
        <RefreshButton />
      </div>
      <p className="text-xs text-zinc-500">
        Subject comparison/indicators below read a periodically-refreshed rollup — use &ldquo;Refresh
        analytics&rdquo; after bulk mark approval to see the latest data there. The Result Analysis tabs further
        down read the live `results` table, recomputed automatically the moment marks are approved/locked — no
        refresh needed for those.
      </p>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Examination performance</h2>
        <ExaminationPicker
          examinations={examinations}
          examinationId={examinationId}
          trendClassIds={trendClassIds}
          trendSectionId={trendSectionId}
          trendMonths={trendMonths}
          dailyAssessmentsLink={dailyAssessmentsLink}
        />

        {examinationId && schoolSummary ? (
          // §Analytics-layout-audit: the school-wide headline numbers now
          // sit right under the exam picker, unconditional on which Result
          // Analysis tab is open below — previously they only appeared
          // inside the "School-wide" tab, so switching to Subject-wise/
          // Class-wise/etc. hid them entirely even though they're the
          // single most useful "how did this exam go" glance.
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Students with a result" value={String(schoolSummary.total_students)} />
            <StatCard label={`${noun} average %`} value={fmtPct(schoolSummary.average_percent)} />
            <StatCard label={`${noun} pass %`} value={fmtPct(schoolSummary.pass_percent)} accent={PASS_COLOR} />
          </div>
        ) : examinationId ? (
          <p className="mt-4 text-sm text-zinc-500">No computed results for this examination yet.</p>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">Select an examination to see subject and student analytics.</p>
        )}
      </section>

      {examinationId ? (
        <section className="print-area rounded-card border bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--heading)]">Result Analysis</h2>
            <PrintButton label="Print this report" />
          </div>
          {!hasBroadResultAccess ? (
            <p className="mb-3 text-xs text-zinc-500">
              Showing your own assigned classes/subjects only{staffStageScope && staffStageScope.stages.size > 0 ? ` (section: ${[...staffStageScope.stages].join(", ")})` : ""}.
            </p>
          ) : null}

          <nav className="no-print mb-4 flex flex-wrap gap-1 border-b pb-2">
            {RESULT_TABS.map((t) => (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${tab === t.key ? "bg-[var(--brand)] text-white" : "text-zinc-500 hover:bg-zinc-100"}`}
              >
                {t.key === "school" ? `${noun}-wide` : t.label}
              </Link>
            ))}
          </nav>

          {tab === "school" && schoolSummary ? (
            <div className="space-y-6">
              {trackSummaries.length > 0 ? (
                <div>
                  <h3 className="mb-2 section-label">
                    Academic vs Islamic (analyzed separately)
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {trackSummaries.map((t: TrackResultSummary) => (
                      <div key={t.track} className="rounded-card border p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 capitalize">{t.track}</p>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-lg font-semibold text-zinc-900">{t.total_students}</div>
                            <div className="text-[11px] text-zinc-500">Students</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold text-zinc-900">{fmtPct(t.average_percent)}</div>
                            <div className="text-[11px] text-zinc-500">Average</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold" style={{ color: PASS_COLOR }}>{fmtPct(t.pass_percent)}</div>
                            <div className="text-[11px] text-zinc-500">Pass rate</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 section-label">Grade distribution</h3>
                  <Donut segments={gradeDonutSegments} centerLabel={String(schoolSummary.total_students)} centerSubLabel="students" />
                </div>
                <div>
                  <h3 className="mb-2 section-label">Pass / fail</h3>
                  <Donut segments={passFailSegments} centerLabel={fmtPct(schoolSummary.pass_percent)} centerSubLabel="pass rate" />
                </div>
              </div>
              <div>
                <h3 className="mb-2 section-label">Subjects ranked by average marks</h3>
                {subjectRankChart.length > 0 ? <BarChart data={subjectRankChart} orientation="horizontal" /> : <p className="text-sm text-zinc-500">No approved marks yet.</p>}
              </div>
              {topTeacher ? (
                <div className="rounded-card border p-4">
                  <p className="text-xs text-zinc-500">Top-performing teacher (this exam)</p>
                  <p className="mt-1 text-lg font-semibold text-zinc-900">{topTeacher.teacher_name} <span className="text-sm font-normal text-zinc-500">— {topTeacher.subject_name}</span></p>
                  <p className="text-xs text-zinc-500">Average {formatMarks(topTeacher.average_marks)}/{formatMarks(topTeacher.max_marks)} · Pass {fmtPct(topTeacher.pass_percentage)}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {tab === "school" && !schoolSummary ? <p className="text-sm text-zinc-500">No computed results for this examination yet.</p> : null}

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
                <h3 className="mb-2 section-label">Division comparison within each grade</h3>
                <div className="space-y-4">
                  {scopedByClass.map((g) => {
                    const divisions = scopedBySection.filter((s) => s.parent_name === g.name);
                    if (divisions.length === 0) return null;
                    const chart: ChartDatum[] = divisions.map((d, i) => ({
                      label: d.name, value: d.average_percent ?? 0,
                      color: seriesColor(i),
                    }));
                    return (
                      <div key={g.id}>
                        <p className="mb-1 text-xs font-medium text-zinc-600">{g.name}</p>
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
                <h3 className="mb-2 section-label">Marks-distribution histogram</h3>
                <div className="no-print mb-3 flex flex-wrap gap-1">
                  {classOptions.map((c) => (
                    <Link
                      key={c.id}
                      href={tabHref("class", { classId: c.id })}
                      className={`rounded-full px-2.5 py-1 text-xs ${histogramClassId === c.id ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600"}`}
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
                {histogram.length > 0 ? <Histogram buckets={histogram.map((h) => ({ label: h.label, value: h.count, color: h.color }))} /> : <p className="text-sm text-zinc-500">Select a division above.</p>}
              </div>

              {/* §Analytics-layout-audit: student classification moved here
                  (class-wise) from the always-open "Examination performance"
                  block above, and behind a <details> disclosure so it's
                  opt-in rather than always taking up page space. */}
              <details className="no-print rounded-card border">
                <summary className="cursor-pointer select-none rounded-card px-4 py-2.5 text-sm font-medium text-[var(--heading)] hover:bg-zinc-50">
                  Student classification {rule ? `(≥${rule.high_threshold}% high, <${rule.low_threshold}% low)` : "(no rule configured)"}
                </summary>
                <div className="overflow-x-auto border-t px-4 py-3">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                      <tr><th className="py-1.5">Student</th><th className="py-1.5">Percentage</th><th className="py-1.5">Band</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {classification.map((c) => (
                        <tr key={c.student_id}><td className="py-1.5">{c.student_name}</td><td className="py-1.5">{c.percentage}%</td><td className="py-1.5 capitalize">{c.band.replace("_", " ")}</td></tr>
                      ))}
                      {classification.length === 0 ? (<tr><td colSpan={3} className="py-4 text-center text-zinc-500">No computed results for this examination yet.</td></tr>) : null}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          ) : null}

          {tab === "subject" ? (
            <div className="space-y-8">
              <div>
                <h3 className="mb-2 section-label">Subject comparison</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                      <tr><th className="py-1.5">Rank</th><th className="py-1.5">Subject</th><th className="py-1.5">Marked</th><th className="py-1.5">Average</th><th className="py-1.5">Pass %</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...subjectComparison].sort((a, b) => (b.avg_marks ?? -1) - (a.avg_marks ?? -1)).map((s, idx) => (
                        <tr key={s.subject_id}>
                          <td className="py-1.5 text-zinc-500">#{idx + 1}</td>
                          <td className="py-1.5">{s.subject_name}</td>
                          <td className="py-1.5">{s.marked_count}</td>
                          <td className="py-1.5">{s.avg_marks !== null ? Number(s.avg_marks).toFixed(2) : "—"}</td>
                          <td className="py-1.5">{fmtPct(s.pass_percentage)}</td>
                        </tr>
                      ))}
                      {subjectComparison.length === 0 ? (
                        <tr><td colSpan={5} className="py-4 text-center text-zinc-500">No approved marks yet for this examination.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="mb-2 section-label">Subject-level performance indicators</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                      <tr><th className="py-1.5">Subject</th><th className="py-1.5">Division avg</th><th className="py-1.5">Division pass %</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {indicators.map((i, idx) => (
                        <tr key={`${i.subject_id}-${i.class_id}-${i.section_id}-${idx}`}>
                          <td className="py-1.5">{i.subject_name}</td>
                          <td className="py-1.5">{i.average_performance !== null ? Number(i.average_performance).toFixed(2) : "—"}</td>
                          <td className="py-1.5">{fmtPct(i.pass_percentage)}</td>
                        </tr>
                      ))}
                      {indicators.length === 0 ? (<tr><td colSpan={3} className="py-4 text-center text-zinc-500">—</td></tr>) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <SubjectWiseSection rows={scopedBySubject} />
            </div>
          ) : null}

          {tab === "teacher" ? (
            <TeacherWiseSection rows={scopedByTeacher} />
          ) : null}
        </section>
      ) : (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Result Analysis</h2>
          <p className="text-sm text-zinc-500">Select an examination above to see School/Section/Grade/Class/Subject/Teacher-wise reports.</p>
        </section>
      )}

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Class attendance trend</h2>
        <AttendanceTrendPicker
          classes={classes}
          sections={sections}
          classIds={trendClassIds}
          sectionId={trendSectionId}
          months={trendMonths}
          examinationId={examinationId}
          tab={tab}
        />
        {attendanceTrendByClass.length > 0 ? (
          <div className="mt-4 space-y-4">
            <LineTrendChart
              series={attendanceTrendByClass.map((c, i): LineSeries => ({
                label: c.className,
                color: seriesColor(i),
                points: c.rows.map((r, ri): { x: string; y: number | null } => ({
                  x: monthLabel(sortedTrendMonths[ri]),
                  y: r ? r.present_percent : null,
                })),
              }))}
              xLabels={sortedTrendMonths.map(monthLabel)}
              height={200}
              maxY={100}
              showAxes
              yAxisSuffix="%"
            />{/* LineTrendChart already renders its own color-keyed legend below the SVG when there's more than one series. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                  <tr><th className="py-1.5">Class</th><th className="py-1.5">Month</th><th className="py-1.5">Present days</th><th className="py-1.5">Late days</th><th className="py-1.5">Total days</th><th className="py-1.5">Present %</th></tr>
                </thead>
                <tbody className="divide-y">
                  {attendanceTrendByClass.flatMap((c) =>
                    c.rows.map((r, i) => (
                      <tr key={`${c.classId}-${sortedTrendMonths[i]}`}>
                        <td className="py-1.5">{c.className}</td>
                        <td className="py-1.5">{monthLabel(sortedTrendMonths[i])}</td>
                        <td className="py-1.5">{r ? r.present_days : "—"}</td>
                        <td className="py-1.5">{r ? r.late_days : "—"}</td>
                        <td className="py-1.5">{r ? r.total_days : "—"}</td>
                        <td className="py-1.5">{r ? `${r.present_percent}%` : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">Select at least one class and month to see the attendance trend.</p>
        )}
      </section>

      {canManage ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Classification thresholds (percentage)</h2>
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
          <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
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
          <tbody className="divide-y">
            {rows.map((r, idx) => (
              <tr key={r.id}>
                <td className="py-1.5 text-zinc-500">#{idx + 1}</td>
                {showParent ? <td className="py-1.5">{r.parent_name}</td> : null}
                <td className="py-1.5">{r.name}</td>
                <td className="py-1.5">{r.student_count}</td>
                <td className="py-1.5">{fmtPct(r.average_percent)}</td>
                <td className="py-1.5" style={{ color: PASS_COLOR }}>{r.pass_count}</td>
                <td className="py-1.5" style={{ color: FAIL_COLOR }}>{r.fail_count}</td>
                <td className="py-1.5">{fmtPct(r.pass_percent)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (<tr><td colSpan={showParent ? 8 : 7} className="py-4 text-center text-zinc-500">{emptyText}</td></tr>) : null}
          </tbody>
        </table>
      </div>
      {rows.length > 0 ? (
        <div>
          <p className="mb-2 section-label">Average % comparison</p>
          <BarChart data={chart} orientation="horizontal" valueFormat={(v) => `${v}%`} />
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div>
          <p className="mb-2 section-label">Grade distribution</p>
          <StackedBarChart groups={stacked} />
        </div>
      ) : null}
    </div>
  );
}

function SubjectWiseSection({ rows }: { rows: SubjectGradeGroupRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-zinc-500">No computed marks for this examination yet.</p>;
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
          .map((s) => ({ label: s.subject_name, value: s.average_percent ?? 0, color: CHART_SERIES[0] }));
        return (
          <div key={className}>
            <h3 className="mb-2 text-sm font-semibold text-[var(--heading)]">{className}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                  <tr>
                    <th className="py-1.5">Subject</th>
                    {subjects.some((s) => s.track) ? <th className="py-1.5">Track</th> : null}
                    <th className="py-1.5">Count</th><th className="py-1.5">Avg %</th>
                    <th className="py-1.5">Max</th><th className="py-1.5">Min</th>
                    <th className="py-1.5">Pass %</th><th className="py-1.5">Fail %</th><th className="py-1.5">Top bands</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {subjects.map((s) => (
                    <tr key={s.subject_id}>
                      <td className="py-1.5">{s.subject_name}</td>
                      {subjects.some((s2) => s2.track) ? (
                        <td className="py-1.5 text-xs capitalize text-zinc-500">{s.track ?? "—"}</td>
                      ) : null}
                      <td className="py-1.5">{s.count}</td>
                      <td className="py-1.5">{fmtPct(s.average_percent)}</td>
                      <td className="py-1.5">{s.max_obtained ?? "—"}</td>
                      <td className="py-1.5">{s.min_obtained ?? "—"}</td>
                      <td className="py-1.5" style={{ color: PASS_COLOR }}>{fmtPct(s.pass_percentage)}</td>
                      <td className="py-1.5" style={{ color: FAIL_COLOR }}>{s.count > 0 ? fmtPct(Math.round((s.fail_count / s.count) * 10000) / 100) : "—"}</td>
                      <td className="py-1.5 text-xs">
                        {s.top_band_counts.map((b) => (
                          <span key={b.grade_label} className="mr-1.5 inline-flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: b.color ?? CHART_OVERFLOW }} />
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
                <p className="mb-1 section-label">Students below pass threshold (weakest first)</p>
                <div className="space-y-2 text-xs">
                  {subjects.filter((s) => s.below_threshold.length > 0).map((s) => (
                    <div key={s.subject_id}>
                      <span className="font-medium text-zinc-600">{s.subject_name}: </span>
                      <span className="text-zinc-500">
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
    .map((r) => ({ label: `${r.teacher_name} (${r.subject_name})`, value: r.average_marks ?? 0, color: CHART_SERIES[0] }));
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
            <tr>
              <th className="py-1.5">Rank</th><th className="py-1.5">Teacher</th><th className="py-1.5">Subject</th>
              <th className="py-1.5">Marked</th><th className="py-1.5">Max</th><th className="py-1.5">Avg</th>
              <th className="py-1.5">Median</th><th className="py-1.5">Highest</th><th className="py-1.5">Lowest</th>
              <th className="py-1.5">Pass %</th><th className="py-1.5">Full marks</th><th className="py-1.5">Fail</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((t, idx) => (
              <tr key={`${t.teacher_user_id}-${t.subject_id}`}>
                <td className="py-1.5 text-zinc-500">#{idx + 1}</td>
                <td className="py-1.5">{t.teacher_name}</td>
                <td className="py-1.5">{t.subject_name}</td>
                <td className="py-1.5">{t.marked_count}</td>
                <td className="py-1.5">{formatMarks(t.max_marks)}</td>
                <td className="py-1.5">{t.average_marks != null ? formatMarks(t.average_marks) : "—"}</td>
                <td className="py-1.5">{t.median_marks != null ? formatMarks(t.median_marks) : "—"}</td>
                <td className="py-1.5">{t.highest_marks != null ? formatMarks(t.highest_marks) : "—"}</td>
                <td className="py-1.5">{t.lowest_marks != null ? formatMarks(t.lowest_marks) : "—"}</td>
                <td className="py-1.5" style={{ color: PASS_COLOR }}>{fmtPct(t.pass_percentage)}</td>
                <td className="py-1.5">{t.full_marks_count}</td>
                <td className="py-1.5" style={{ color: FAIL_COLOR }}>{t.fail_count}</td>
              </tr>
            ))}
            {rows.length === 0 ? (<tr><td colSpan={12} className="py-4 text-center text-zinc-500">No teacher assignments cover this examination&apos;s subjects/classes yet.</td></tr>) : null}
          </tbody>
        </table>
      </div>
      {chart.length > 0 ? (
        <div>
          <p className="mb-2 section-label">Top-performing teachers (ranked by average marks)</p>
          <BarChart data={chart} orientation="horizontal" />
        </div>
      ) : null}
    </div>
  );
}
