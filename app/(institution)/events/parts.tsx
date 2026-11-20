/**
 * Shared, server-safe pieces of the Events & Activities pages (also used by
 * the student / parent portal pages).
 */
import type { EventStatus, HouseStanding, ChampionRow } from "../../../modules/events/service";
import { EVENT_STATUS_LABEL, groupChampions } from "../../../modules/events/service";
import { tint } from "../../components/portal/viz/palette";

export const KIND_LABEL: Record<string, string> = {
  arts: "Arts", sports: "Sports", academic: "Academic", literary: "Literary", other: "Other",
};

const STATUS_STYLE: Record<EventStatus, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  enrolment_open: "bg-primary-100 text-primary-800",
  enrolment_closed: "bg-accent-100 text-accent-800",
  judging: "bg-accent-100 text-accent-800",
  published: "bg-[#15803d]/10 text-[#15803d]",
};

export function StatusBadge({ status }: { status: EventStatus }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>{EVENT_STATUS_LABEL[status]}</span>;
}

export function HouseDot({ color, size = 10 }: { color: string | null; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, backgroundColor: color ?? "#a4aab0" }} />;
}

/** Ranked house standings with a proportional bar in each house's colour. */
export function HouseBoard({ rows }: { rows: HouseStanding[] }) {
  const max = Math.max(1, ...rows.map((r) => r.points));
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.house_id}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 text-right text-xs font-semibold text-zinc-500">{i + 1}</span>
              <HouseDot color={r.color} />
              <span className="truncate font-medium text-[var(--foreground)]">{r.name}</span>
            </span>
            <span className="shrink-0 text-xs text-zinc-500">
              <b className="text-sm text-[var(--foreground)]">{fmt(r.points)}</b> pts
              {r.firsts ? <span className="ml-2 font-medium text-accent-700">{r.firsts} × 1st</span> : null}
            </span>
          </div>
          <div className="ml-7 h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: tint(r.color, 0.14) }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(r.points > 0 ? 3 : 0, (r.points / max) * 100)}%`, backgroundColor: r.color }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function PlaceBadge({ position, grade }: { position: number | null; grade: string | null }) {
  const place = position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : null;
  if (!place && !grade) return <span className="text-xs text-zinc-400">—</span>;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
      {place ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${position === 1 ? "bg-accent-600 text-white" : position === 2 ? "bg-primary-600 text-white" : "bg-primary-100 text-primary-800"}`}>{place}</span> : null}
      {grade ? <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-semibold text-zinc-700">Grade {grade}</span> : null}
    </span>
  );
}

function ChampList({ title, rows }: { title: string; rows: ChampionRow[] }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">{title}</div>
      {rows.length === 0 ? <p className="text-xs text-zinc-400">No points yet.</p> : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.student_id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? "bg-accent-600 text-white" : "bg-primary-100 text-primary-800"}`}>{i + 1}</span>
                <span className="min-w-0 truncate">
                  <span className="font-medium text-[var(--foreground)]">{r.full_name}</span>
                  <span className="ml-1 text-xs text-zinc-500">{r.class_name ?? ""}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-600"><HouseDot color={r.house_color} size={8} /><b>{fmt(r.points)}</b></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Individual champions: overall, boys, girls and each stage. */
export function Champions({ rows }: { rows: ChampionRow[] }) {
  const g = groupChampions(rows);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ChampList title="Overall champion" rows={g.overall} />
      <ChampList title="Boys" rows={g.boys} />
      <ChampList title="Girls" rows={g.girls} />
      {g.byStage.map((s) => <ChampList key={s.stage} title={`${s.stage} stage`} rows={s.rows} />)}
    </div>
  );
}
