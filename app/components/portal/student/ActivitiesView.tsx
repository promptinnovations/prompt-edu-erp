import type { ReactNode } from "react";
import type { ActivityInsights } from "../../../../modules/portal/student-insights";
import { formatDateIST } from "../../../../services/datetime/ist";
import { PageHeader, Panel, StatTile, EmptyNote } from "../viz/blocks";
import { DonutChart, HBars, Timeline } from "../viz/charts";
import { CHART_SERIES, NEUTRAL, seriesColor, tint } from "../viz/palette";
import { AREA } from "./areas";

function medal(position: string | null): { icon: string; label: string } {
  const p = (position ?? "").trim().toLowerCase();
  if (p === "1st" || p === "first") return { icon: "🥇", label: "1st place" };
  if (p === "2nd" || p === "second") return { icon: "🥈", label: "2nd place" };
  if (p === "3rd" || p === "third") return { icon: "🥉", label: "3rd place" };
  return { icon: "🏅", label: position ? position : "Participation" };
}

/** Same name → same colour on every chart on this page; past the eighth
 *  name everything folds into a neutral "other" colour (never a new hue). */
function namedColors(names: string[]): (n: string) => string {
  const order = [...new Set(names)];
  return (n) => { const i = order.indexOf(n); return i >= 0 && i < CHART_SERIES.length ? CHART_SERIES[i] : NEUTRAL; };
}

function countBy<T>(xs: T[], key: (x: T) => string): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

const STATUS_CHIP: Record<string, { text: string; bg: string; fg: string }> = {
  approved: { text: "Approved", bg: "#e6f4ec", fg: "#1f7a4d" },
  submitted: { text: "Awaiting review", bg: "#fdf1dc", fg: "#8a5b0c" },
  pending_review: { text: "Awaiting review", bg: "#fdf1dc", fg: "#8a5b0c" },
  returned: { text: "Returned for changes", bg: "#e4f1f6", fg: "#1f6f8c" },
  rejected: { text: "Not approved", bg: "#fbeaec", fg: "#a72f3a" },
};

/** §Student-portal-visual-redesign — Achievements & activities: the
 *  badge collection, what kinds of things the student takes part in and at
 *  what level, a dated timeline, the certificate gallery, co-curricular
 *  activity submissions with their approval status, and the submit forms. */
export default function ActivitiesView({ data, forms }: { data: ActivityInsights; forms?: ReactNode }) {
  const a = data.achievements;
  const podium = a.filter((x) => medal(x.position).icon !== "🏅").length;
  const certificates = a.filter((x) => x.certificate_file_id);
  const points = a.reduce((s, x) => s + (x.points ?? 0), 0);
  const byCategory = countBy(a, (x) => x.category);
  const catColor = namedColors(byCategory.map((c) => c.label));
  const levels = [...new Map(a.map((x) => [x.level, x.level_order])).entries()].sort((p, q) => p[1] - q[1]).map(([l]) => l);
  const byType = countBy(data.activities, (x) => x.type);
  const typeColor = namedColors(byType.map((t) => t.label));

  return (
    <div className="space-y-6">
      <PageHeader title="Achievements & activities" subtitle="Awards, competitions and everything you take part in." icon={AREA.achievements.icon} color={AREA.achievements.color} />

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Awards" icon="🏆" color={AREA.achievements.color} value={a.length} sub={points > 0 ? `${points} points earned` : undefined} />
        <StatTile label="Podium finishes" icon="🥇" color={seriesColor(3)} value={podium} sub="1st, 2nd or 3rd place" />
        <StatTile label="Certificates" icon="📜" color={seriesColor(0)} value={certificates.length} />
        <StatTile label="Activities" icon="🎨" color={seriesColor(2)} value={data.activities.filter((x) => x.status === "approved").length} sub={`${data.activities.length} submitted in all`} />
      </section>

      <Panel title="Badge collection" subtitle="Every approved award. Hover a badge for details." color={AREA.achievements.color}>
        {a.length === 0 ? (
          <EmptyNote>Your first badge is waiting — submit an achievement below once you win or take part in something.</EmptyNote>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {a.map((x) => {
              const m = medal(x.position);
              const c = catColor(x.category);
              return (
                <li
                  key={x.id}
                  className="flex flex-col items-center rounded-2xl border p-4 text-center"
                  style={{ borderColor: tint(c, 0.35), background: `linear-gradient(180deg, ${tint(c, 0.14)}, transparent)` }}
                  title={`${x.title} — ${x.category}, ${x.level}${x.position ? `, ${x.position}` : ""}`}
                >
                  <span aria-hidden className="text-4xl">{m.icon}</span>
                  <span className="mt-1 line-clamp-2 text-sm font-medium text-[var(--foreground)]">{x.title.split(" — ")[0]}</span>
                  <span className="mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: c }}>{x.level}</span>
                  <span className="mt-1 text-[11px] text-zinc-500">{m.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {a.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Awards by area" color={AREA.achievements.color}>
            <DonutChart center={a.length} sub="awards" segments={byCategory.map((c) => ({ label: c.label, value: c.value, color: catColor(c.label) }))} />
          </Panel>
          <Panel title="Awards by level" subtitle="From school level upwards." color={AREA.achievements.color}>
            <HBars
              unit="" max={Math.max(...levels.map((l) => a.filter((x) => x.level === l).length))}
              rows={levels.map((l) => ({ label: l, value: a.filter((x) => x.level === l).length, color: AREA.achievements.color, suffix: "" }))}
            />
          </Panel>
        </div>
      ) : null}

      {a.length > 0 ? (
        <Panel title="Achievement timeline" color={AREA.achievements.color}>
          <Timeline
            items={a.map((x) => ({
              key: x.id,
              date: formatDateIST(x.date),
              title: x.title.split(" — ")[0],
              meta: `${x.category} · ${x.level}${x.position ? ` · ${x.position}` : ""}${x.points ? ` · ${x.points} pts` : ""}`,
              color: catColor(x.category),
              icon: ({ "🥇": "1", "🥈": "2", "🥉": "3" } as Record<string, string>)[medal(x.position).icon] ?? "★",
            }))}
          />
        </Panel>
      ) : null}

      {certificates.length > 0 ? (
        <Panel title="Certificate gallery" subtitle="Tap a certificate to open it." color={seriesColor(0)}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {certificates.map((x) => (
              <li key={x.id}>
                <a
                  href={`/api/files/${x.certificate_file_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex h-full flex-col rounded-xl border border-[var(--border-subtle)] p-3 transition-all hover:-translate-y-0.5 hover:shadow-raised"
                >
                  <span
                    className="flex aspect-[4/3] items-center justify-center rounded-lg border-2 border-double text-3xl"
                    style={{ borderColor: tint(seriesColor(3), 0.7), backgroundColor: tint(seriesColor(3), 0.08) }}
                    aria-hidden
                  >
                    📜
                  </span>
                  <span className="mt-2 line-clamp-2 text-sm font-medium text-[var(--foreground)]">{x.title.split(" — ")[0]}</span>
                  <span className="text-xs text-zinc-500">{x.level} · {formatDateIST(x.date)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Co-curricular activities" subtitle="Activities you've submitted and where they stand." color={seriesColor(2)}>
        {data.activities.length === 0 ? (
          <EmptyNote>No activities submitted yet — use the form below.</EmptyNote>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <DonutChart center={data.activities.length} sub="activities" segments={byType.map((t) => ({ label: t.label, value: t.value, color: typeColor(t.label) }))} />
            </div>
            <ul className="space-y-2 lg:col-span-3">
              {data.activities.slice(0, 12).map((x) => {
                const chip = STATUS_CHIP[x.status] ?? { text: x.status, bg: "#f7f4ee", fg: "#4a5464" };
                return (
                  <li key={x.id} className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm">
                    <span aria-hidden className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: typeColor(x.type) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--foreground)]">{x.activity}</span>
                      <span className="block text-xs text-zinc-500">{x.type}{x.date ? ` · ${formatDateIST(x.date)}` : ""}</span>
                    </span>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: chip.bg, color: chip.fg }}>{chip.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Panel>

      {forms}
    </div>
  );
}
