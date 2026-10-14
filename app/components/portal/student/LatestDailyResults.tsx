import Link from "next/link";
import type { LatestDailyDay } from "../../../../modules/portal/student-insights";
import { daysAgoIST, todayIST } from "../../../../services/datetime/ist";
import { Panel } from "../viz/blocks";
import { seriesColor, tint } from "../viz/palette";

const COLOR = seriesColor(5);
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

function dayTitle(date: string): string {
  if (date === todayIST()) return "Today's result";
  if (date === daysAgoIST(1)) return "Yesterday's result";
  const d = new Date(`${date}T00:00:00Z`);
  return `Result · ${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}`;
}
function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
function monthOf(name: string): string {
  return name.replace(/^\s*daily assessments?\s*[—–-]?\s*/i, "") || name;
}

/** §Dashboard-latest-daily — "add latest daily assessment result with
 *  subject, topic — only 2 results titled Today's result & Yesterday's
 *  result — and a button to the complete daily assessment result of that
 *  month". The two most recent test days (a day older than yesterday is
 *  titled with its date), each test with subject, topic, marks and a bar
 *  against the class average; the button opens that month's full page. */
export default function LatestDailyResults({ days, monthHref }: { days: LatestDailyDay[]; monthHref: (examinationId: string) => string }) {
  if (days.length === 0) return null;
  const latest = days[0];
  return (
    <Panel
      title="Daily assessment"
      subtitle="The latest class-work tests, as soon as marks are entered."
      color={COLOR}
      action={
        <Link
          href={monthHref(latest.examination_id)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand)] px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--brand-hover)]"
        >
          Full {monthOf(latest.examination_name)} result <span aria-hidden>→</span>
        </Link>
      }
    >
      <div className={`grid gap-4 ${days.length > 1 ? "md:grid-cols-2" : ""}`}>
        {days.map((day) => {
          const sat = day.tests.filter((t) => t.obtained != null);
          const got = sat.reduce((a, t) => a + (t.obtained ?? 0), 0);
          const of = sat.reduce((a, t) => a + t.max, 0);
          const dayPct = of > 0 ? Math.round((got / of) * 1000) / 10 : null;
          return (
            <section key={day.date} className="rounded-xl border border-[var(--border-subtle)] p-4" style={{ background: `linear-gradient(160deg, ${tint(COLOR, 0.08)}, transparent 55%)` }}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[var(--heading)]">{dayTitle(day.date)}</h3>
                  <p className="text-xs text-zinc-500">{longDate(day.date)} · {day.tests.length} test{day.tests.length === 1 ? "" : "s"}</p>
                </div>
                {dayPct != null ? (
                  <div className="text-right">
                    <div className="text-xl font-semibold tabular-nums text-[var(--foreground)]">{num(dayPct)}%</div>
                    <div className="text-[11px] text-zinc-500">{num(got)}/{num(of)} marks</div>
                  </div>
                ) : null}
              </div>
              <ul className="space-y-3">
                {day.tests.map((t, i) => {
                  const c = seriesColor(i % 8);
                  return (
                    <li key={t.id} className="rounded-lg bg-[var(--surface)] p-3 shadow-sm" style={{ borderLeft: `4px solid ${c}` }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--foreground)]">{t.subject_name}</div>
                          <div className="text-xs text-zinc-600">{t.portion}</div>
                        </div>
                        <div className="shrink-0 text-right text-sm">
                          {t.absent ? (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Absent</span>
                          ) : (
                            <><span className="text-base font-semibold tabular-nums text-[var(--foreground)]">{t.obtained != null ? num(t.obtained) : "—"}</span><span className="text-zinc-500"> / {num(t.max)}</span></>
                          )}
                        </div>
                      </div>
                      {t.percent != null ? (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="relative h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: tint(c, 0.15) }}>
                            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, t.percent)}%`, backgroundColor: c }} />
                            {t.class_avg_percent != null ? (
                              <div className="absolute inset-y-0 w-0.5 bg-zinc-700/60" style={{ left: `calc(${Math.min(100, t.class_avg_percent)}% - 1px)` }} title={`Class average ${t.class_avg_percent}%`} />
                            ) : null}
                          </div>
                          <span className="w-12 text-right text-xs font-semibold tabular-nums">{num(t.percent)}%</span>
                        </div>
                      ) : null}
                      {t.class_avg_percent != null ? <p className="mt-1 text-[11px] text-zinc-500">Class average {num(t.class_avg_percent)}%</p> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
