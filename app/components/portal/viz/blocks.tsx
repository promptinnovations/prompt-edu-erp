/**
 * Layout blocks for the portal pages (§Student-portal-visual-redesign):
 * colourful page header, panel, stat tile, empty state and the attendance
 * calendar heatmap. Server components — no client JS.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_COLOR, tint } from "./palette";

export function PageHeader({ title, subtitle, icon, color, children }: {
  title: string; subtitle?: string; icon: string; color: string; children?: ReactNode;
}) {
  return (
    <header
      className="relative overflow-hidden rounded-card border border-[var(--border-subtle)] p-5 shadow-card sm:p-6"
      style={{ background: `linear-gradient(120deg, ${tint(color, 0.16)} 0%, ${tint(color, 0.04)} 55%, var(--surface) 100%)` }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm" style={{ backgroundColor: color }}>
          <span className="drop-shadow-sm">{icon}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-[var(--heading)]">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-zinc-600">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </header>
  );
}

export function Panel({ title, subtitle, color, children, action, className = "" }: {
  title: string; subtitle?: string; color?: string; children: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-card ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          {color ? <span aria-hidden className="mt-1 h-4 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} /> : null}
          <div>
            <h2 className="text-base font-semibold text-[var(--heading)]">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatTile({ label, value, sub, color, icon, href, children }: {
  label: string; value: ReactNode; sub?: string; color: string; icon: string; href?: string; children?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: tint(color, 0.18) }}>{icon}</span>
        {href ? <span aria-hidden className="text-xs text-zinc-400 transition-transform group-hover:translate-x-0.5">→</span> : null}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-[var(--foreground)]">{value}</div>
      <div className="text-sm font-medium text-zinc-700">{label}</div>
      {sub ? <div className="text-xs text-zinc-500">{sub}</div> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </>
  );
  const cls = "group block rounded-card border bg-[var(--surface)] p-4 shadow-card transition-all";
  const style = { borderColor: tint(color, 0.35), backgroundImage: `linear-gradient(160deg, ${tint(color, 0.1)}, transparent 60%)` };
  return href ? (
    <Link href={href} className={`${cls} hover:-translate-y-0.5 hover:shadow-raised`} style={style}>{body}</Link>
  ) : (
    <div className={cls} style={style}>{body}</div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-6 text-center text-sm text-zinc-500">{children}</p>;
}

// ---------------------------------------------------------------------------
// Attendance calendar heatmap — one square per school day, weeks as columns
// ---------------------------------------------------------------------------
type DayStatus = "present" | "late" | "absent";

export function CalendarHeatmap({ from, to, days, holidays }: {
  from: string; to: string; days: { date: string; status: DayStatus; label: string }[]; holidays: { date: string; title: string }[];
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const holidayBy = new Map(holidays.map((h) => [h.date, h.title]));
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  // Align the first column to Monday.
  const first = new Date(start);
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const cells: { key: string; col: number; row: number; color: string; tip: string }[] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let col = 0;
  for (let d = new Date(first); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const row = (d.getUTCDay() + 6) % 7;
    if (row === 0 && d > first) col++;
    const iso = d.toISOString().slice(0, 10);
    if (d >= start && d.getUTCDate() === 1) monthLabels.push({ col, label: d.toLocaleString("en", { month: "short", timeZone: "UTC" }) });
    if (d < start) continue;
    const rec = byDate.get(iso);
    const hol = holidayBy.get(iso);
    const nice = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });
    if (rec) cells.push({ key: iso, col, row, color: STATUS_COLOR[rec.status], tip: `${nice}: ${rec.label}${rec.status === "late" ? " (late)" : ""}` });
    else if (hol) cells.push({ key: iso, col, row, color: STATUS_COLOR.holiday, tip: `${nice}: Holiday — ${hol}` });
    else cells.push({ key: iso, col, row, color: STATUS_COLOR.none, tip: `${nice}: not marked` });
  }
  if (monthLabels.length === 0 || monthLabels[0].col > 0) monthLabels.unshift({ col: 0, label: start.toLocaleString("en", { month: "short", timeZone: "UTC" }) });
  const cell = 14, gapPx = 3, left = 30, top = 18;
  const W = left + (col + 1) * (cell + gapPx);
  const H = top + 7 * (cell + gapPx);
  const dayNames = ["Mon", "", "Wed", "", "Fri", "", ""];
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Attendance calendar">
          {monthLabels.map((m, i) => (
            <text key={`${m.label}-${i}`} x={left + m.col * (cell + gapPx)} y={11} fontSize={10} fill="#657087">{m.label}</text>
          ))}
          {dayNames.map((n, r) => n ? <text key={n} x={0} y={top + r * (cell + gapPx) + 10} fontSize={9} fill="#657087">{n}</text> : null)}
          {cells.map((c) => (
            <rect key={c.key} x={left + c.col * (cell + gapPx)} y={top + c.row * (cell + gapPx)} width={cell} height={cell} rx={3} fill={c.color}>
              <title>{c.tip}</title>
            </rect>
          ))}
        </svg>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
        {([["Present", STATUS_COLOR.present], ["Late", STATUS_COLOR.late], ["Absent", STATUS_COLOR.absent], ["Holiday", STATUS_COLOR.holiday], ["Not marked", STATUS_COLOR.none]] as const).map(([l, c]) => (
          <li key={l} className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-3 rounded-[3px]" style={{ backgroundColor: c }} />{l}</li>
        ))}
      </ul>
    </div>
  );
}
