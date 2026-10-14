import Link from "next/link";
import type { ReactNode } from "react";
import type { DailyAssessmentMonthDetail, DailyTest } from "../../../../modules/portal/student-insights";
import { PageHeader, Panel, StatTile, EmptyNote } from "../viz/blocks";
import { LineChart, HBars, RingGauge } from "../viz/charts";
import { Legend } from "../viz/legend";
import { NEUTRAL, seriesColor, tint } from "../viz/palette";

const COLOR = seriesColor(5);

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

function MarksCell({ t }: { t: DailyTest }) {
  if (t.absent) return <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Absent</span>;
  if (t.obtained == null) return <span className="text-zinc-500">—</span>;
  return <span className="font-semibold tabular-nums text-[var(--foreground)]">{num(t.obtained)}</span>;
}

function PercentBar({ t, color }: { t: DailyTest; color: string }) {
  if (t.percent == null) return <span className="text-zinc-500">—</span>;
  return (
    <div className="flex min-w-[7rem] items-center gap-2">
      <div className="relative h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: tint(color, 0.15) }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, t.percent)}%`, backgroundColor: color }} />
        {t.class_avg_percent != null ? (
          <div className="absolute inset-y-0 w-0.5 bg-zinc-700/60" style={{ left: `calc(${Math.min(100, t.class_avg_percent)}% - 1px)` }} title={`Class average ${t.class_avg_percent}%`} />
        ) : null}
      </div>
      <span className="w-12 text-right text-xs font-semibold tabular-nums text-[var(--foreground)]">{num(t.percent)}%</span>
    </div>
  );
}

/** §Portal-daily-assessment-detail — one Daily Assessment month in full,
 *  for a student (and, through the parent route, their parent): the
 *  month's score and grade, tests taken, comparison with the class
 *  average, a test-by-test trend, subject-wise results, and every test
 *  with date, subject, topic, marks, total and percentage. */
export default function DailyAssessmentMonthView({ data, backHref, headerExtra }: {
  data: DailyAssessmentMonthDetail; backHref: string; headerExtra?: ReactNode;
}) {
  const month = data.name.replace(/^\s*daily assessments?\s*[—–-]?\s*/i, "") || data.name;
  const subjectColor = new Map(data.subjects.map((s, i) => [s.subject_id, seriesColor(i % 8)]));
  const taken = data.tests.filter((t) => t.obtained != null).length;
  const absent = data.tests.filter((t) => t.absent).length;
  const best = [...data.subjects].filter((s) => s.percent != null).sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0] ?? null;
  const vsClass = data.percent != null && data.class_avg_percent != null ? Math.round((data.percent - data.class_avg_percent) * 10) / 10 : null;

  return (
    <div className="space-y-6">
      <Link href={backHref} className="text-sm text-zinc-500 underline">← Back to Academics</Link>

      <PageHeader title={month} subtitle="Daily assessment — every class-work test this month." icon="📝" color={COLOR}>{headerExtra}</PageHeader>

      {!data.published ? (
        <p role="status" className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: tint(COLOR, 0.35), backgroundColor: tint(COLOR, 0.07) }}>
          <b>This month is still in progress.</b> Tests appear as soon as marks are entered. The month&rsquo;s final grade is given when the school publishes the result.
        </p>
      ) : null}

      {data.tests.length === 0 ? (
        <Panel title="No tests yet" color={COLOR}><EmptyNote>Tests appear here once teachers enter their marks.</EmptyNote></Panel>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title={data.published ? "This month" : "So far this month"} color={COLOR}>
              <div className="flex flex-col items-center gap-2">
                <RingGauge
                  value={data.percent} color={data.grade_color || COLOR} size={160} stroke={18}
                  center={data.percent != null ? `${num(data.percent)}%` : "—"}
                  sub={data.grade_label ? `Grade ${data.grade_label}` : "score"}
                  title={data.percent != null ? `${data.percent}% this month` : "No score yet"}
                />
                <p className="text-sm text-zinc-600">{num(data.obtained)} of {num(data.max)} marks</p>
              </div>
            </Panel>
            <div className="grid grid-cols-2 gap-4 lg:col-span-2">
              <StatTile label="Tests taken" icon="✏️" color={seriesColor(0)} value={`${taken} / ${data.tests.length}`} sub={`${data.subjects.length} subject${data.subjects.length === 1 ? "" : "s"}`} />
              <StatTile label="Absent" icon="🚫" color={absent > 0 ? seriesColor(7) : seriesColor(2)} value={absent} sub={absent > 0 ? "Not counted in the total" : "Present for every test"} />
              <StatTile
                label="Class average" icon="👥" color={seriesColor(6)}
                value={data.class_avg_percent != null ? `${num(data.class_avg_percent)}%` : "—"}
                sub={vsClass == null ? "Not available" : vsClass >= 0 ? `${num(vsClass)} points above` : `${num(Math.abs(vsClass))} points below`}
              />
              <StatTile label="Best subject" icon="⭐" color={seriesColor(3)} value={best ? best.subject_name : "—"} sub={best?.percent != null ? `${num(best.percent)}%` : undefined} />
            </div>
          </div>

          {data.tests.length > 1 ? (
            <Panel title="Test by test" subtitle="Score in each test, in date order, with the class average." color={COLOR}>
              <LineChart
                labels={data.tests.map((t) => shortDate(t.date))}
                series={[
                  { name: "Score", color: COLOR, values: data.tests.map((t) => t.percent) },
                  { name: "Class average", color: NEUTRAL, dashed: true, values: data.tests.map((t) => t.class_avg_percent) },
                ]}
                height={230}
              />
            </Panel>
          ) : null}

          <Panel title="By subject" subtitle="Total in each subject this month, against the class average." color={COLOR}>
            <HBars
              previousLabel="Class average" currentLabel="Score"
              rows={data.subjects.map((s) => ({
                label: s.subject_name,
                value: s.percent,
                previous: s.class_avg_percent,
                color: subjectColor.get(s.subject_id) ?? COLOR,
                note: `${num(s.obtained)}/${num(s.max)} · ${s.sat} of ${s.tests} test${s.tests === 1 ? "" : "s"}`,
              }))}
            />
          </Panel>

          <Panel title="All tests" subtitle={`${data.tests.length} test${data.tests.length === 1 ? "" : "s"} · the marker on each bar is the class average.`} color={COLOR}>
            <div className="mb-3">
              <Legend items={data.subjects.map((s) => ({ label: s.subject_name, color: subjectColor.get(s.subject_id) ?? COLOR }))} />
            </div>
            {/* Desktop / tablet: table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                  <tr>
                    <th className="py-1.5">Date</th>
                    <th className="py-1.5">Subject</th>
                    <th className="py-1.5">Topic</th>
                    <th className="py-1.5 text-right">Marks</th>
                    <th className="py-1.5 text-right">Total</th>
                    <th className="py-1.5 pl-4">Percentage</th>
                    <th className="py-1.5 text-right">Class avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.tests.map((t) => {
                    const c = subjectColor.get(t.subject_id) ?? COLOR;
                    return (
                      <tr key={t.id}>
                        <td className="whitespace-nowrap py-2 text-zinc-700">{longDate(t.date)}</td>
                        <td className="whitespace-nowrap py-2">
                          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />{t.subject_name}</span>
                        </td>
                        <td className="py-2 text-zinc-700">{t.portion}</td>
                        <td className="py-2 text-right"><MarksCell t={t} /></td>
                        <td className="py-2 text-right tabular-nums text-zinc-600">{num(t.max)}</td>
                        <td className="py-2 pl-4"><PercentBar t={t} color={c} /></td>
                        <td className="py-2 text-right tabular-nums text-zinc-500">{t.class_avg_percent != null ? `${num(t.class_avg_percent)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Phone: cards */}
            <ul className="space-y-3 md:hidden">
              {data.tests.map((t) => {
                const c = subjectColor.get(t.subject_id) ?? COLOR;
                return (
                  <li key={t.id} className="rounded-xl border border-[var(--border-subtle)] p-3" style={{ borderLeft: `4px solid ${c}` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--foreground)]">{t.subject_name}</div>
                        <div className="text-xs text-zinc-500">{longDate(t.date)}</div>
                      </div>
                      <div className="shrink-0 text-right text-sm">
                        <MarksCell t={t} /> <span className="text-zinc-500">/ {num(t.max)}</span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-sm text-zinc-700">{t.portion}</p>
                    <div className="mt-2"><PercentBar t={t} color={c} /></div>
                    {t.class_avg_percent != null ? <p className="mt-1 text-[11px] text-zinc-500">Class average {num(t.class_avg_percent)}%</p> : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
