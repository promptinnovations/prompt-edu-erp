import Link from "next/link";
import type { ReactNode } from "react";
import type { AcademicInsights, ExamOutcome } from "../../../../modules/portal/student-insights";
import { formatDateIST } from "../../../../services/datetime/ist";
import { PageHeader, Panel, StatTile, EmptyNote } from "../viz/blocks";
import { LineChart, HBars, RadarChart, GradeChips, RingGauge } from "../viz/charts";
import { NEUTRAL, seriesColor, tint } from "../viz/palette";
import { AREA } from "./areas";

function avg(xs: number[]): number | null {
  return xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

/** §Student-portal-visual-redesign — Academics: everything about exam
 *  performance, and only here. Progress line across exams, subject bars
 *  (latest vs previous), a strengths radar, grade distribution, a subject
 *  × exam heat table, daily assessments and the consolidated score. */
export default function AcademicsView({ data, reportCardHref, dailyHref, headerExtra }: {
  data: AcademicInsights; reportCardHref: (examinationId: string) => string;
  /** §Portal-daily-assessment-detail — each month's chip opens that month in full. */
  dailyHref?: (examinationId: string) => string;
  headerExtra?: ReactNode;
}) {
  const dailyLink = dailyHref ?? ((id: string) => `/portal/student/exams/daily/${id}`);
  const exams = data.exams;
  const latest: ExamOutcome | null = exams[exams.length - 1] ?? null;
  const previous: ExamOutcome | null = exams.length > 1 ? exams[exams.length - 2] : null;
  const overallAvg = avg(exams.map((e) => e.percent));
  const change = latest && previous ? Math.round((latest.percent - previous.percent) * 10) / 10 : null;

  // Subjects across every exam, in a stable order (latest exam's order first).
  const subjectNames: string[] = [];
  for (const e of [...exams].reverse()) for (const s of e.subjects) if (!subjectNames.includes(s.subject_name)) subjectNames.push(s.subject_name);
  const subjectAvg = subjectNames.map((n) => ({
    name: n,
    avg: avg(exams.flatMap((e) => e.subjects.filter((s) => s.subject_name === n && s.percent != null).map((s) => s.percent as number))),
  }));
  const latestSubjects = latest ? latest.subjects.filter((s) => s.percent != null) : [];
  const best = [...latestSubjects].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0] ?? null;
  const focus = [...latestSubjects].sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))[0] ?? null;
  const gradeCounts: Record<string, number> = {};
  for (const s of latestSubjects) if (s.grade_label) gradeCounts[s.grade_label] = (gradeCounts[s.grade_label] ?? 0) + 1;

  const breakdown = Object.entries(data.consolidated?.breakdown_jsonb ?? {});

  return (
    <div className="space-y-6">
      <PageHeader title="Academics" subtitle="Performance in every published exam and subject." icon={AREA.academics.icon} color={AREA.academics.color}>{headerExtra}</PageHeader>

      {exams.length === 0 ? (
        <Panel title="No published results yet" color={AREA.academics.color}>
          <EmptyNote>Results will appear here as soon as the school publishes them.</EmptyNote>
        </Panel>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label={`Average across ${exams.length} exam${exams.length === 1 ? "" : "s"}`} icon="📈" color={AREA.academics.color} value={overallAvg != null ? `${overallAvg}%` : "—"}>
              <RingGauge value={overallAvg} color={AREA.academics.color} size={56} stroke={7} center=" " />
            </StatTile>
            <StatTile
              label="Change since last exam" icon={change != null && change < 0 ? "📉" : "🚀"} color={change != null && change < 0 ? seriesColor(7) : seriesColor(2)}
              value={change == null ? "—" : `${change > 0 ? "+" : ""}${change}%`}
              sub={previous && latest ? `${previous.name} → ${latest.name}` : "Needs two exams"}
            />
            <StatTile label="Strongest subject" icon="⭐" color={seriesColor(3)} value={best ? best.subject_name : "—"} sub={best ? `${best.percent}% in ${latest?.name}` : undefined} />
            <StatTile label="Give extra attention to" icon="🎯" color={seriesColor(4)} value={focus && focus !== best ? focus.subject_name : "—"} sub={focus && focus !== best ? `${focus.percent}% in ${latest?.name}` : undefined} />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Progress across exams" subtitle="Your overall percentage in each published exam, oldest to newest." color={AREA.academics.color}>
              <LineChart labels={exams.map((e) => e.name)} series={[{ name: "Overall %", color: AREA.academics.color, values: exams.map((e) => e.percent) }]} />
            </Panel>

            <Panel
              title={`Subject-wise · ${latest?.name ?? ""}`}
              subtitle={previous ? `Bar = this exam, grey line underneath = ${previous.name}.` : "Your percentage in each subject (TE + CE)."}
              color={AREA.academics.color}
            >
              <HBars
                rows={(latest?.subjects ?? []).map((s) => ({
                  label: s.subject_name,
                  value: s.absent ? null : s.percent,
                  previous: previous?.subjects.find((p) => p.subject_id === s.subject_id)?.percent ?? null,
                  color: s.grade_color || AREA.academics.color,
                  note: s.absent ? "Absent" : s.grade_label ? `Grade ${s.grade_label}` : undefined,
                }))}
                currentLabel={latest?.name}
                previousLabel={previous?.name}
              />
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-5">
            <Panel title="Strengths map" subtitle="Each spoke is a subject — the further out, the stronger." color={AREA.academics.color} className="xl:col-span-3">
              {subjectNames.length >= 3 ? (
                <RadarChart
                  axes={subjectNames}
                  unit="%"
                  series={[
                    { name: "Average of all exams", color: seriesColor(1), values: subjectAvg.map((s) => s.avg) },
                    ...(exams.length > 1 && latest ? [{ name: latest.name, color: AREA.academics.color, values: subjectNames.map((n) => latest.subjects.find((s) => s.subject_name === n)?.percent ?? null) }] : []),
                  ]}
                />
              ) : (
                <EmptyNote>The strengths map appears once you have marks in three or more subjects.</EmptyNote>
              )}
            </Panel>
            <Panel title={`Grades · ${latest?.name ?? ""}`} subtitle="How many subjects reached each grade." color={AREA.academics.color} className="xl:col-span-2">
              {data.bands.length > 0 ? (
                <GradeChips bands={data.bands} counts={gradeCounts} />
              ) : (
                <EmptyNote>Your school hasn&rsquo;t set up grades for this exam.</EmptyNote>
              )}
            </Panel>
          </div>

          {exams.length > 1 ? (
            <Panel title="Subject mastery" subtitle="Every subject in every exam, coloured by grade." color={AREA.academics.color}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] border-separate border-spacing-1 text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500">
                      <th className="px-2 py-1 font-medium">Subject</th>
                      {exams.map((e) => <th key={e.examination_id} className="px-2 py-1 text-center font-medium">{e.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {subjectNames.map((n) => (
                      <tr key={n}>
                        <td className="whitespace-nowrap px-2 py-1 text-zinc-700">{n}</td>
                        {exams.map((e) => {
                          const s = e.subjects.find((x) => x.subject_name === n);
                          const c = s?.grade_color || AREA.academics.color;
                          const p = s?.percent;
                          return (
                            <td
                              key={e.examination_id}
                              className="rounded-md px-2 py-1.5 text-center tabular-nums"
                              style={p != null ? { backgroundColor: tint(c, 0.1 + (p / 100) * 0.45), color: "var(--foreground)", fontWeight: 600 } : { backgroundColor: "#f7f4ee" }}
                              title={s ? `${n} · ${e.name}: ${s.absent ? "Absent" : p != null ? `${p}%${s.grade_label ? ` (${s.grade_label})` : ""}` : "—"}` : `${n} not in ${e.name}`}
                            >
                              {s ? (s.absent ? "AB" : p != null ? `${Math.round(p)}` : "—") : ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}

          <Panel title="Exam results" subtitle="Open any exam for its subject marks and printable report card." color={AREA.academics.color}>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[...exams].reverse().map((e) => (
                <li key={e.examination_id}>
                  <Link
                    href={reportCardHref(e.examination_id)}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] p-3 transition-all hover:-translate-y-0.5 hover:shadow-raised"
                    style={{ borderLeft: `4px solid ${e.grade_color || NEUTRAL}` }}
                  >
                    <RingGauge value={e.percent} color={e.grade_color || AREA.academics.color} size={56} stroke={6} center={e.grade_label ?? " "} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--foreground)]">{e.name}</span>
                      <span className="block text-xs text-zinc-500">
                        {e.percent}% · {e.total}/{e.max_total}{e.date ? ` · ${formatDateIST(e.date)}` : ""}
                      </span>
                      {e.is_pass != null ? (
                        <span className={`mt-0.5 inline-block text-xs font-medium ${e.is_pass ? "text-emerald-700" : "text-rose-700"}`}>{e.is_pass ? "✓ Passed" : "Needs improvement"}</span>
                      ) : null}
                    </span>
                    <span aria-hidden className="text-zinc-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      {data.dailyAssessments.length > 0 ? (
        <Panel title="Daily assessments" subtitle="Month-by-month total of class-work tests. Tap a month to see every test." color={seriesColor(5)}>
          {(() => {
            const rows = [...data.dailyAssessments].reverse();
            const pct = (r: (typeof rows)[number]) => Number(r.cumulative_max_marks) > 0 ? Math.round((Number(r.cumulative_marks_obtained) / Number(r.cumulative_max_marks)) * 1000) / 10 : null;
            return (
              <div className="space-y-4">
                {rows.length > 1 ? (
                  <LineChart labels={rows.map((r) => r.examination_name.replace(/daily assessments?\s*[—-]?\s*/i, ""))} series={[{ name: "Monthly %", color: seriesColor(5), values: rows.map(pct) }]} height={200} />
                ) : null}
                <ul className="flex flex-wrap gap-2">
                  {[...rows].reverse().map((r) => (
                    <li key={r.examination_id}>
                      <Link
                        href={dailyLink(r.examination_id)}
                        className="group inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm shadow-card transition-all hover:-translate-y-0.5 hover:border-[var(--brand)] hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                      >
                        <span className="text-zinc-700">{r.examination_name}</span>
                        <span className="font-semibold tabular-nums text-[var(--foreground)]">{pct(r) ?? "—"}%</span>
                        {r.grade_label ? <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: r.grade_color || NEUTRAL }}>{r.grade_label}</span> : null}
                        <span aria-hidden className="text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--brand)]">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </Panel>
      ) : null}

      {breakdown.length > 0 && data.consolidated ? (
        <Panel title="Consolidated score" subtitle={`${data.consolidated.period} · overall ${data.consolidated.score}`} color={seriesColor(6)}>
          <HBars
            unit=""
            max={Math.max(100, ...breakdown.map(([, v]) => Number(v) || 0))}
            rows={breakdown.map(([k, v], i) => ({ label: k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), value: Number(v) || 0, color: seriesColor(i) }))}
          />
        </Panel>
      ) : null}
    </div>
  );
}
