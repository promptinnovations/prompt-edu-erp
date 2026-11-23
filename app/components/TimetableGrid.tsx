/**
 * Read-only weekly timetable grid (days × periods) — the school timetable
 * page in the staff sidebar and the class timetable in the student / parent
 * portals. `show` picks what a cell names besides the subject: the teacher
 * (a class's timetable) or the class (a teacher's timetable). Server-safe.
 *
 * `overlay` lays today's substitutions over a teacher's week: a period the
 * teacher has been asked to cover is highlighted (and, until confirmed,
 * tappable); a period of theirs that someone else covers is dimmed.
 */
import type { ReactNode } from "react";
import type { TimetablePeriodRow } from "../../modules/substitution/service";
import { DAY_NAMES } from "../../modules/substitution/service";
import { decorColor, tint, STATUS_COLOR } from "./portal/viz/palette";

export interface GridOverlayCell {
  kind: "cover" | "covered";
  /** For "cover": the teacher has already confirmed it. */
  acknowledged?: boolean;
  content: ReactNode;
}

export default function TimetableGrid({ periods, show, today, overlay }: {
  periods: TimetablePeriodRow[]; show: "teacher" | "class"; today?: number; overlay?: Record<string, GridOverlayCell>;
}) {
  const overlayKeys = Object.keys(overlay ?? {});
  if (periods.length === 0 && overlayKeys.length === 0) return <p className="py-6 text-center text-sm text-zinc-500">No periods in the timetable yet.</p>;
  const overlayCells = overlayKeys.map((k) => k.split(":").map(Number));
  const days = [...new Set([...periods.map((p) => p.dayOfWeek), ...overlayCells.map(([d]) => d)])].sort((a, b) => a - b);
  const maxPeriod = Math.max(...periods.map((p) => p.periodNo), ...overlayCells.map(([, n]) => n), 1);
  const cell = new Map<string, TimetablePeriodRow>(periods.map((p) => [`${p.dayOfWeek}:${p.periodNo}`, p]));
  // One colour per subject, from the theme's own family, so a subject reads the same all week.
  const subjects = [...new Set(periods.map((p) => p.subjectName ?? ""))].sort();
  const colourOf = (s: string | null) => decorColor(Math.max(0, subjects.indexOf(s ?? "")));

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="w-24 text-left text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Day</th>
            {Array.from({ length: maxPeriod }, (_, i) => (
              <th key={i} className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">P{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <th scope="row" className={`rounded-lg px-2 py-2 text-left text-xs font-semibold ${d === today ? "bg-[var(--brand)] text-white" : "text-[var(--foreground)]"}`}>
                {DAY_NAMES[d]?.slice(0, 3)}{d === today ? <span className="block text-[10px] font-normal opacity-80">Today</span> : null}
              </th>
              {Array.from({ length: maxPeriod }, (_, i) => {
                const key = `${d}:${i + 1}`;
                const o = overlay?.[key];
                if (o?.kind === "cover") {
                  const c = o.acknowledged ? STATUS_COLOR.present : STATUS_COLOR.late;
                  return (
                    <td key={i} className="rounded-lg align-top" style={{ backgroundColor: tint(c, 0.22), borderLeft: `3px solid ${c}`, boxShadow: o.acknowledged ? undefined : `0 0 0 2px ${tint(c, 0.55)}` }}>
                      {o.content}
                    </td>
                  );
                }
                const p = cell.get(key);
                if (o?.kind === "covered") {
                  return (
                    <td key={i} className="rounded-lg border border-dashed border-[var(--border-subtle)] px-2 py-1.5 align-top opacity-70">{o.content}</td>
                  );
                }
                if (!p) return <td key={i} className="rounded-lg border border-dashed border-[var(--border-subtle)]" />;
                const c = colourOf(p.subjectName);
                const other = show === "teacher" ? p.teacherName : `${p.className} ${p.sectionName}`;
                return (
                  <td key={i} className="rounded-lg px-2 py-1.5 align-top" style={{ backgroundColor: tint(c, 0.12), borderLeft: `3px solid ${c}` }}>
                    <div className="truncate text-xs font-semibold text-[var(--foreground)]" title={p.subjectName ?? ""}>{p.subjectName ?? "—"}</div>
                    {other ? <div className="truncate text-[11px] text-zinc-600" title={other}>{other}</div> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
