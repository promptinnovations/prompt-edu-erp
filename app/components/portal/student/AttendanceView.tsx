import type { ReactNode } from "react";
import type { AttendanceInsights } from "../../../../modules/portal/student-insights";
import { formatDateIST } from "../../../../services/datetime/ist";
import { PageHeader, Panel, StatTile, EmptyNote, CalendarHeatmap } from "../viz/blocks";
import { RingGauge, ColumnBars, HBars, DonutChart } from "../viz/charts";
import { STATUS_COLOR } from "../viz/palette";
import { AREA } from "./areas";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Longest and current run of consecutive marked days attended (present or
 *  late). Unmarked days (holidays, weekends) don't break a run. */
function streaks(days: AttendanceInsights["days"]): { current: number; best: number } {
  let run = 0, best = 0;
  for (const d of days) {
    if (d.status === "absent") run = 0; else { run++; best = Math.max(best, run); }
  }
  return { current: run, best };
}

/** §Student-portal-visual-redesign — Attendance: the only place with the
 *  day-level picture. Ring + status counts, streak badge, calendar heatmap,
 *  month-by-month bars, which weekdays get missed, and leave history. */
export default function AttendanceView({ data, headerExtra, leaveSlot }: {
  data: AttendanceInsights; headerExtra?: ReactNode;
  /** Replaces the read-only leave list (the parent portal passes its
   *  apply-for-leave form, which lists the applications itself). */
  leaveSlot?: ReactNode;
}) {
  const present = data.days.filter((d) => d.status === "present").length;
  const late = data.days.filter((d) => d.status === "late").length;
  const absent = data.days.filter((d) => d.status === "absent").length;
  const total = data.days.length;
  const pct = total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : null;
  const { current, best } = streaks(data.days);

  const months = new Map<string, { attended: number; total: number }>();
  for (const d of data.days) {
    const k = d.date.slice(0, 7);
    const m = months.get(k) ?? { attended: 0, total: 0 };
    m.total++; if (d.status !== "absent") m.attended++;
    months.set(k, m);
  }
  const monthItems = [...months.entries()].map(([k, m]) => {
    const label = new Date(`${k}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });
    const v = Math.round((m.attended / m.total) * 1000) / 10;
    return { label, value: v, tip: `${label}: ${v}% (${m.attended} of ${m.total} days)` };
  });

  const missedByDay = WEEKDAYS.map((w, i) => ({
    label: w,
    value: data.days.filter((d) => d.status === "absent" && (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7 === i).length,
  })).filter((r) => r.value > 0);

  const toDate = data.to && data.to < new Date().toISOString().slice(0, 10) ? data.to : new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" subtitle={data.yearName ? `Academic year ${data.yearName}, day by day.` : "Attendance, day by day."} icon={AREA.attendance.icon} color={AREA.attendance.color}>{headerExtra}</PageHeader>

      {total === 0 ? (
        <Panel title="No attendance marked yet" color={AREA.attendance.color}>
          <EmptyNote>Attendance will show up here once the school starts taking it this year.</EmptyNote>
        </Panel>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="This year" color={AREA.attendance.color}>
              <div className="flex flex-col items-center gap-2">
                <RingGauge value={pct} color={AREA.attendance.color} size={168} stroke={18} sub="attendance" title={`${pct}% attendance`} />
                <p className="text-sm text-zinc-600">Attended {present + late} of {total} school days</p>
              </div>
            </Panel>
            <Panel title="Day types" subtitle="Every marked day this year." color={AREA.attendance.color}>
              <DonutChart
                center={total}
                sub="days"
                segments={[
                  { label: "Present", value: present, color: STATUS_COLOR.present },
                  { label: "Late", value: late, color: STATUS_COLOR.late },
                  { label: "Absent", value: absent, color: STATUS_COLOR.absent },
                ]}
              />
            </Panel>
            <div className="grid gap-4">
              <StatTile label="Current streak" icon="🔥" color="#eb6834" value={`${current} day${current === 1 ? "" : "s"}`} sub="In a row without an absence" />
              <StatTile label="Best streak" icon="🏅" color="#eda100" value={`${best} day${best === 1 ? "" : "s"}`} sub="Your longest run this year" />
            </div>
          </div>

          {data.from ? (
            <Panel title="Attendance calendar" subtitle="Hover a square for the date and status." color={AREA.attendance.color}>
              <CalendarHeatmap from={data.from} to={toDate} days={data.days} holidays={data.holidays} />
            </Panel>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-5">
            <Panel title="Month by month" subtitle="Share of school days attended each month." color={AREA.attendance.color} className="lg:col-span-3">
              <ColumnBars items={monthItems} color={AREA.attendance.color} />
            </Panel>
            <Panel title="Days missed by weekday" subtitle="Spot a pattern in absences." color={STATUS_COLOR.absent} className="lg:col-span-2">
              {missedByDay.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <span className="text-4xl" aria-hidden>🌟</span>
                  <p className="text-sm text-zinc-600">No absences this year — brilliant!</p>
                </div>
              ) : (
                <HBars unit="" max={Math.max(...missedByDay.map((r) => r.value))} rows={missedByDay.map((r) => ({ label: r.label, value: r.value, color: STATUS_COLOR.absent, suffix: r.value === 1 ? " day" : " days" }))} />
              )}
            </Panel>
          </div>
        </>
      )}

      {leaveSlot ?? (
      <Panel title="Leave applications" color={AREA.attendance.color}>
        {data.leaves.length === 0 ? (
          <EmptyNote>No leave applications.</EmptyNote>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {data.leaves.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="text-[var(--foreground)]">
                  {formatDateIST(l.start_date)}{l.end_date !== l.start_date ? ` → ${formatDateIST(l.end_date)}` : ""}
                  {l.reason ? <span className="text-zinc-500"> — {l.reason}</span> : null}
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                  style={{
                    backgroundColor: l.status === "approved" ? "#e6f4ec" : l.status === "rejected" ? "#fbeaec" : "#fdf1dc",
                    color: l.status === "approved" ? "#1f7a4d" : l.status === "rejected" ? "#a72f3a" : "#8a5b0c",
                  }}
                >
                  {l.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      )}
    </div>
  );
}
