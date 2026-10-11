import Link from "next/link";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { getDailyAssessmentAnalysis, listDailyAssessmentYears, type DailyAssessmentAnalysisRow } from "../../../../modules/analytics/service";
import { getTeacherClassScope } from "../../../../services/scope/teacher-scope-service";
import { PASS_COLOR, FAIL_COLOR } from "../../../../modules/examination/service";
import { LineTrendChart, StatCard, BarChart, type ChartDatum, type LineSeries } from "../../../components/charts/ResultCharts";
import { seriesColor, CHART_SERIES } from "../../../components/charts/series";
import PrintButton from "../../../components/PrintButton";
import { formatDateIST } from "../../../../services/datetime/ist";

/** §Daily-assessment-analytics — "only a button with the title Daily
 *  assessments 2026-27, if clicked it will take to the page where all daily
 *  assessments' results are available month-wise, latest on top - oldest at
 *  the bottom order. there should be a chart that shows growth and fall".
 *
 *  Daily Assessment registers never reach `results`, so they can't live on
 *  the main Result Analysis page's tabs (see getDailyAssessmentAnalysis's
 *  comment). This page is their home: one academic year at a time (year
 *  pills, defaulting to the current year), a month-over-month trend line
 *  (chronological left→right — a trend chart has to read in time order even
 *  though the LIST below is newest-first, per the ask), then one card per
 *  monthly register, latest on top, with its class-wise and subject-wise
 *  breakdowns. Same teacher-scope rule as /analytics: anyone without broad
 *  result access only sees their own assigned classes. */
function pct(obtained: number, max: number): number | null {
  return max > 0 ? Math.round((obtained / max) * 10000) / 100 : null;
}
function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}
function monthLabelOf(row: { examination_name: string; start_date: string | null }): string {
  return row.start_date ? formatDateIST(row.start_date, { month: "short", year: "numeric" }) : row.examination_name;
}

interface MonthAgg {
  examination_id: string; examination_name: string; start_date: string | null;
  sessions: number; marks_count: number; total_obtained: number; total_max: number;
  byClass: Map<string, { class_id: string; class_name: string; total_obtained: number; total_max: number; sessions: number }>;
  bySubject: Map<string, { subject_id: string; subject_name: string; total_obtained: number; total_max: number; sessions: number }>;
}

export default async function DailyAssessmentsAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ academicYearId?: string }>;
}) {
  const { academicYearId: yearParam = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const canView = can(ctx.permissions, "reports.view");
  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Daily assessments</h1>
        <p className="text-sm text-zinc-500">You don&apos;t have permission to view Result Analysis.</p>
      </div>
    );
  }

  const hasBroadResultAccess = ctx.isSuperAdmin || can(ctx.permissions, "marks.approve") || can(ctx.permissions, "settings.manage");
  const [years, teacherScope] = await Promise.all([
    listDailyAssessmentYears(institutionId, authUserId),
    hasBroadResultAccess ? null : getTeacherClassScope(institutionId, authUserId, ctx.userId),
  ]);
  const year = years.find((y) => y.id === yearParam) ?? years.find((y) => y.is_current) ?? years[0] ?? null;

  const rawRows: DailyAssessmentAnalysisRow[] = year ? await getDailyAssessmentAnalysis(institutionId, authUserId, year.id) : [];
  const allowedClassIds = teacherScope ? teacherScope.classIds : null;
  const rows = allowedClassIds ? rawRows.filter((r) => allowedClassIds.has(r.class_id)) : rawRows;

  // Aggregate (register, class, subject) rows up to one bucket per monthly
  // register, keeping class-wise and subject-wise sub-totals for the cards.
  const months = new Map<string, MonthAgg>();
  for (const r of rows) {
    let m = months.get(r.examination_id);
    if (!m) {
      m = {
        examination_id: r.examination_id, examination_name: r.examination_name, start_date: r.start_date,
        sessions: 0, marks_count: 0, total_obtained: 0, total_max: 0, byClass: new Map(), bySubject: new Map(),
      };
      months.set(r.examination_id, m);
    }
    m.sessions += r.sessions; m.marks_count += r.marks_count; m.total_obtained += r.total_obtained; m.total_max += r.total_max;
    const c = m.byClass.get(r.class_id) ?? { class_id: r.class_id, class_name: r.class_name, total_obtained: 0, total_max: 0, sessions: 0 };
    c.total_obtained += r.total_obtained; c.total_max += r.total_max; c.sessions += r.sessions; m.byClass.set(r.class_id, c);
    const s = m.bySubject.get(r.subject_id) ?? { subject_id: r.subject_id, subject_name: r.subject_name, total_obtained: 0, total_max: 0, sessions: 0 };
    s.total_obtained += r.total_obtained; s.total_max += r.total_max; s.sessions += r.sessions; m.bySubject.set(r.subject_id, s);
  }
  // Newest first for the list (SQL already orders registers start_date desc,
  // and Map preserves insertion order); chronological copy for the chart.
  const monthsNewestFirst = Array.from(months.values());
  const monthsChrono = [...monthsNewestFirst].reverse();

  const yearTotals = monthsNewestFirst.reduce(
    (acc, m) => ({ obtained: acc.obtained + m.total_obtained, max: acc.max + m.total_max, sessions: acc.sessions + m.sessions }),
    { obtained: 0, max: 0, sessions: 0 }
  );

  // Trend chart: institution-wide line always; one line per class on top
  // when the class count fits the fixed categorical palette (8 slots —
  // never a 9th generated hue, per the dataviz rule), else classes stay in
  // the per-month tables only.
  const classIndex = new Map<string, { class_id: string; class_name: string }>();
  for (const m of monthsChrono) for (const c of m.byClass.values()) classIndex.set(c.class_id, { class_id: c.class_id, class_name: c.class_name });
  const classList = Array.from(classIndex.values()).sort((a, b) => a.class_name.localeCompare(b.class_name));
  const showClassLines = classList.length > 1 && classList.length <= 7;
  const xLabels = monthsChrono.map(monthLabelOf);
  const series: LineSeries[] = [
    {
      label: "All classes",
      color: seriesColor(0),
      points: monthsChrono.map((m, i) => ({ x: xLabels[i], y: pct(m.total_obtained, m.total_max) })),
    },
    ...(showClassLines
      ? classList.map((c, ci) => ({
          label: c.class_name,
          color: seriesColor(ci + 1),
          points: monthsChrono.map((m, i) => {
            const bc = m.byClass.get(c.class_id);
            return { x: xLabels[i], y: bc ? pct(bc.total_obtained, bc.total_max) : null };
          }),
        }))
      : []),
  ];

  function yearHref(id: string): string {
    return `/analytics/daily-assessments?${new URLSearchParams({ academicYearId: id }).toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-zinc-500">
            <Link href="/analytics" className="underline hover:text-zinc-700">Result Analysis</Link> / Daily assessments
          </p>
          <h1 className="text-2xl font-semibold text-[var(--heading)]">
            Daily assessments{year ? ` ${year.name}` : ""}
          </h1>
        </div>
        <PrintButton label="Print this report" />
      </div>

      {years.length > 1 ? (
        <div className="no-print flex flex-wrap gap-1.5">
          {years.map((y) => (
            <Link
              key={y.id}
              href={yearHref(y.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                year?.id === y.id ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {y.name}
            </Link>
          ))}
        </div>
      ) : null}

      {!year ? (
        <section className="rounded-card border bg-white p-5">
          <p className="text-sm text-zinc-500">No Daily Assessment register has been created yet. Create one from Examinations with the Daily Assessment exam type.</p>
        </section>
      ) : null}

      {year ? (
        <section className="print-area rounded-card border bg-white p-5">
          {!hasBroadResultAccess ? <p className="mb-3 text-xs text-zinc-500">Showing your own assigned classes only.</p> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Months with assessments" value={String(monthsNewestFirst.length)} />
            <StatCard label="Sessions conducted" value={String(yearTotals.sessions)} sub="class × subject × day" />
            <StatCard label="Marks recorded" value={String(monthsNewestFirst.reduce((a, m) => a + m.marks_count, 0))} />
            <StatCard label="Year average" value={fmtPct(pct(yearTotals.obtained, yearTotals.max))} accent={PASS_COLOR} />
          </div>

          <h2 className="mb-2 mt-6 section-label">Growth and fall — average % by month</h2>
          {monthsChrono.length >= 2 ? (
            <LineTrendChart series={series} xLabels={xLabels} height={220} maxY={100} showAxes yAxisSuffix="%" />
          ) : (
            <p className="text-sm text-zinc-500">
              {monthsChrono.length === 1 ? "Only one month so far — the trend line appears once a second month has marks." : "No daily assessment marks entered yet this year."}
            </p>
          )}
        </section>
      ) : null}

      {monthsNewestFirst.map((m, idx) => {
        const avg = pct(m.total_obtained, m.total_max);
        const prev = monthsNewestFirst[idx + 1]; // list is newest-first, so the previous month is the NEXT item
        const prevAvg = prev ? pct(prev.total_obtained, prev.total_max) : null;
        const delta = avg !== null && prevAvg !== null ? Math.round((avg - prevAvg) * 100) / 100 : null;
        const classRows = Array.from(m.byClass.values()).sort((a, b) => a.class_name.localeCompare(b.class_name));
        const subjectRows = Array.from(m.bySubject.values())
          .map((s) => ({ ...s, avg: pct(s.total_obtained, s.total_max) }))
          .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
        const classChart: ChartDatum[] = classRows.map((c) => ({ label: c.class_name, value: pct(c.total_obtained, c.total_max) ?? 0, color: CHART_SERIES[0] }));
        return (
          <section key={m.examination_id} className="print-area rounded-card border bg-white p-5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[var(--heading)]">{monthLabelOf(m)}</h2>
                <p className="text-xs text-zinc-500">
                  {m.examination_name} · {m.sessions} session{m.sessions === 1 ? "" : "s"} · {m.marks_count} marks
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold" style={{ color: avg !== null && avg < 40 ? FAIL_COLOR : undefined }}>{fmtPct(avg)}</p>
                {delta !== null ? (
                  <p className={`text-xs ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-zinc-500"}`}>
                    {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)} pts vs {prev ? monthLabelOf(prev) : "previous"}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-500">first month</p>
                )}
                <Link href={`/examinations/${m.examination_id}`} className="no-print text-xs text-zinc-600 underline">Open register</Link>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 section-label">Class-wise</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                      <tr><th className="py-1.5">Class</th><th className="py-1.5">Sessions</th><th className="py-1.5">Marks</th><th className="py-1.5">Average %</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {classRows.map((c) => (
                        <tr key={c.class_id}>
                          <td className="py-1.5">{c.class_name}</td>
                          <td className="py-1.5">{c.sessions}</td>
                          <td className="py-1.5">{c.total_obtained} / {c.total_max}</td>
                          <td className="py-1.5">{fmtPct(pct(c.total_obtained, c.total_max))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {classChart.length > 1 ? (
                  <div className="mt-3">
                    <BarChart data={classChart} orientation="horizontal" valueFormat={(v) => `${v}%`} />
                  </div>
                ) : null}
              </div>
              <div>
                <h3 className="mb-2 section-label">Subject-wise (best first)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                      <tr><th className="py-1.5">Rank</th><th className="py-1.5">Subject</th><th className="py-1.5">Sessions</th><th className="py-1.5">Average %</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {subjectRows.map((s, i) => (
                        <tr key={s.subject_id}>
                          <td className="py-1.5 text-zinc-500">#{i + 1}</td>
                          <td className="py-1.5">{s.subject_name}</td>
                          <td className="py-1.5">{s.sessions}</td>
                          <td className="py-1.5" style={{ color: s.avg !== null && s.avg < 40 ? FAIL_COLOR : undefined }}>{fmtPct(s.avg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {year && monthsNewestFirst.length === 0 ? (
        <section className="rounded-card border bg-white p-5">
          <p className="text-sm text-zinc-500">Registers exist for {year.name}, but no marks have been entered in any completed session yet.</p>
        </section>
      ) : null}
    </div>
  );
}
