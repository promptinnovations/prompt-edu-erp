/** §Attendance-follow-up-3 "can be a curve last 30 days, monthly also
 *  should be available" — the monthly companion to AttendanceTrendChart.tsx,
 *  same plain-CSS-bar convention, adapted for mv_attendance_monthly's
 *  month-based shape (getInstitutionAttendanceTrendMonthly()) rather than
 *  the daily curve's date-based one. Kept as a separate component instead
 *  of overloading AttendanceTrendChart's prop shape — the two data shapes
 *  (date+totalMarked vs. month+present_days/late_days/total_days) are
 *  different enough that a single component juggling both would need more
 *  branching than just having two small, honest components. */
import type { AttendanceTrendRow } from "../../modules/analytics/service";

function formatMonth(m: string) {
  return new Date(`${m}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export default function MonthlyAttendanceTrendChart({ points }: { points: AttendanceTrendRow[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-500">No attendance has been taken yet this range.</p>;
  }
  const maxPercent = Math.max(1, ...points.map((p) => p.present_percent));
  const first = points[0].present_percent;
  const last = points[points.length - 1].present_percent;
  const delta = Math.round((last - first) * 100) / 100;

  return (
    <div>
      <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
        Present-percentage by month
        {delta !== 0 ? (
          <span className={delta > 0 ? "ml-1 text-emerald-600 dark:text-emerald-400" : "ml-1 text-red-600 dark:text-red-400"}>
            ({delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts vs first month shown)
          </span>
        ) : null}
        {" — reads a periodically-refreshed summary; use “Refresh analytics” on the Analysis page if it looks stale."}
      </p>
      <div className="flex items-end gap-2" style={{ height: 100 }}>
        {points.map((p) => (
          <div key={p.month} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{p.present_percent}%</span>
            <div
              className="w-full rounded-t bg-[var(--brand)]/70"
              style={{ height: `${Math.max(4, (p.present_percent / maxPercent) * 70)}px` }}
              title={`${formatMonth(p.month)}: ${p.present_percent}% (${p.total_days} student-days)`}
            />
            <span className="max-w-full truncate text-[10px] text-zinc-400 dark:text-zinc-500">{formatMonth(p.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
