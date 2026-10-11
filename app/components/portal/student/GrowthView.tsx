import type { GrowthInsights } from "../../../../modules/portal/student-insights";
import { formatDateIST } from "../../../../services/datetime/ist";
import { PageHeader, Panel, EmptyNote } from "../viz/blocks";
import { RadarChart, LineChart, Timeline } from "../viz/charts";
import { seriesColor, tint } from "../viz/palette";
import { AREA } from "./areas";

const RECOGNITION_ICONS = ["🌟", "🤝", "💡", "🎖️", "💪", "🌈", "🧭", "🏵️"];

/** §Student-portal-visual-redesign — Growth & conduct: development beyond
 *  marks, presented positively. Character ratings as a radar (latest vs
 *  previous period) and a growth line, per-quality indicator cards,
 *  positive recognitions as badges, the teacher's summary (remark,
 *  strengths, areas to work on, goals) and mentoring notes. Negative
 *  discipline records are deliberately not shown here. */
export default function GrowthView({ data }: { data: GrowthInsights }) {
  const latest = data.periods[data.periods.length - 1] ?? null;
  const previous = data.periods.length > 1 ? data.periods[data.periods.length - 2] : null;
  const label = (r: number) => data.ratingLabels.find((l) => l.rating === Math.round(r))?.label ?? `${r}/5`;
  const ratingOf = (p: GrowthInsights["periods"][number] | null, attr: string) => p?.ratings.find((r) => r.attribute === attr)?.rating ?? null;
  const periodAvg = data.periods.map((p) => Math.round((p.ratings.reduce((a, r) => a + r.rating, 0) / p.ratings.length) * 10) / 10);
  const summary = data.summary;
  const hasSummary = !!summary && (summary.overall_remark || summary.strengths.length || summary.areas_for_improvement.length || summary.future_goals.length);

  return (
    <div className="space-y-6">
      <PageHeader title="Growth & conduct" subtitle="Your character, habits and the progress your teachers see." icon={AREA.growth.icon} color={AREA.growth.color} />

      {summary?.overall_remark ? (
        <figure className="rounded-card border border-[var(--border-subtle)] p-6 shadow-card" style={{ background: `linear-gradient(135deg, ${tint(AREA.growth.color, 0.14)}, var(--surface) 70%)` }}>
          <div aria-hidden className="text-4xl leading-none" style={{ color: AREA.growth.color }}>&ldquo;</div>
          <blockquote className="-mt-2 text-base italic text-[var(--foreground)] sm:text-lg">{summary.overall_remark}</blockquote>
          <figcaption className="mt-3 text-xs text-zinc-500">Teacher&rsquo;s remark this year</figcaption>
        </figure>
      ) : null}

      {latest ? (
        <>
          <div className="grid gap-6 xl:grid-cols-5">
            <Panel
              title="Character profile"
              subtitle={previous ? `${latest.period} compared with ${previous.period}. Ratings out of 5.` : `${latest.period}. Ratings out of 5.`}
              color={AREA.growth.color}
              className="xl:col-span-3"
            >
              {data.attributes.length >= 3 ? (
                <RadarChart
                  axes={data.attributes}
                  max={5}
                  rings={5}
                  series={[
                    ...(previous ? [{ name: previous.period, color: "#c7bda9", values: data.attributes.map((a) => ratingOf(previous, a)) }] : []),
                    { name: latest.period, color: AREA.growth.color, values: data.attributes.map((a) => ratingOf(latest, a)) },
                  ]}
                />
              ) : (
                <EmptyNote>The profile chart appears once three or more qualities are assessed.</EmptyNote>
              )}
            </Panel>
            <Panel title="Quality by quality" subtitle={latest.period} color={AREA.growth.color} className="xl:col-span-2">
              <ul className="space-y-3">
                {data.attributes.map((a, i) => {
                  const r = ratingOf(latest, a);
                  const p = ratingOf(previous, a);
                  const c = seriesColor(i);
                  return (
                    <li key={a} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: tint(c, 0.08) }} title={latest.ratings.find((x) => x.attribute === a)?.notes ?? undefined}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-[var(--foreground)]">{a}</span>
                        <span className="text-xs text-zinc-600">
                          {r != null ? label(r) : "—"}
                          {r != null && p != null && r !== p ? <span className={r > p ? "ml-1 text-emerald-700" : "ml-1 text-rose-700"}>{r > p ? "▲" : "▼"}</span> : null}
                        </span>
                      </div>
                      <div className="mt-1.5 flex gap-1" aria-label={r != null ? `${r} out of 5` : "Not rated"}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span key={n} className="h-2 flex-1 rounded-full" style={{ backgroundColor: r != null && n <= r ? c : tint(c, 0.18) }} />
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          {data.periods.length > 1 ? (
            <Panel title="Growth over time" subtitle="Average rating across all qualities in each assessment period." color={AREA.growth.color}>
              <LineChart
                labels={data.periods.map((p) => p.period)}
                series={[{ name: "Average rating", color: AREA.growth.color, values: periodAvg }]}
                yMax={5} yMin={0} ticks={[0, 1, 2, 3, 4, 5]} unit="" height={210}
              />
            </Panel>
          ) : null}
        </>
      ) : (
        <Panel title="Character profile" color={AREA.growth.color}>
          <EmptyNote>Your teachers haven&rsquo;t recorded a character assessment yet.</EmptyNote>
        </Panel>
      )}

      {hasSummary ? (
        <div className="grid gap-4 md:grid-cols-3">
          {([
            ["💪 Strengths", summary!.strengths, seriesColor(2)],
            ["🎯 Areas to work on", summary!.areas_for_improvement, seriesColor(3)],
            ["🚀 Goals", summary!.future_goals, seriesColor(0)],
          ] as const).map(([t, items, c]) => (
            <section key={t} className="rounded-card border p-5 shadow-card" style={{ borderColor: tint(c, 0.35), backgroundColor: tint(c, 0.06) }}>
              <h2 className="text-sm font-semibold text-[var(--heading)]">{t}</h2>
              {items.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">Nothing noted yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm text-[var(--foreground)]">
                  {items.map((x) => (
                    <li key={x} className="flex gap-2"><span aria-hidden style={{ color: c }}>●</span>{x}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : null}

      <Panel title="Recognitions" subtitle="Good conduct your teachers have recorded." color={seriesColor(3)}>
        {data.recognitions.length === 0 ? (
          <EmptyNote>Recognitions for good conduct will collect here as badges.</EmptyNote>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.recognitions.map((r, i) => {
              const c = seriesColor(i % 8);
              return (
                <li key={r.id} className="flex flex-col items-center rounded-2xl p-4 text-center" style={{ backgroundColor: tint(c, 0.1) }} title={r.description ?? undefined}>
                  <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full text-2xl shadow-sm" style={{ backgroundColor: tint(c, 0.3) }}>
                    {RECOGNITION_ICONS[i % RECOGNITION_ICONS.length]}
                  </span>
                  <span className="mt-2 text-sm font-medium text-[var(--foreground)]">{r.category}</span>
                  <span className="text-xs text-zinc-500">{formatDateIST(r.date)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {data.mentoring.length > 0 ? (
        <Panel title="Mentoring" subtitle="Notes from your mentor sessions." color={seriesColor(6)}>
          <Timeline
            items={data.mentoring.map((m) => ({
              key: m.id,
              date: formatDateIST(m.date),
              title: `Session with ${m.mentor_name}`,
              color: seriesColor(6),
              icon: "✦",
              aside: (
                <div className="mt-1 space-y-0.5 text-xs text-zinc-600">
                  {m.strengths ? <p><b className="font-medium text-zinc-700">Strengths:</b> {m.strengths}</p> : null}
                  {m.goals ? <p><b className="font-medium text-zinc-700">Goals:</b> {m.goals}</p> : null}
                  {m.action_plan ? <p><b className="font-medium text-zinc-700">Action plan:</b> {m.action_plan}</p> : null}
                </div>
              ),
            }))}
          />
        </Panel>
      ) : null}
    </div>
  );
}
