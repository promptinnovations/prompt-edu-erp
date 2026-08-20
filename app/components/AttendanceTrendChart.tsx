/** Shared "growth and fall" attendance trend bar chart (§Page-4 follow-up
 *  "Attendance analytics — growth and fall diagram, recent days"). Server
 *  component (no client hooks, just CSS bars) so it drops into the
 *  Attendance page, the Dashboard, and the Analysis hub identically — same
 *  plain-CSS-bar convention already used for the exam pass-rate-trend
 *  widget on Dashboard, not a chart library, so it needs no extra
 *  dependency. `compact` trims the label row for the smaller Dashboard
 *  card; the full Attendance-page rendering shows every date. */
import type { AttendanceTrendPoint } from "../../modules/attendance/service";

function formatDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function AttendanceTrendChart({
  points,
  compact = false,
}: {
  points: AttendanceTrendPoint[];
  compact?: boolean;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-500">No attendance has been taken yet.</p>;
  }
  const maxPercent = Math.max(1, ...points.map((p) => p.presentPercent));
  const first = points[0].presentPercent;
  const last = points[points.length - 1].presentPercent;
  const delta = Math.round((last - first) * 100) / 100;

  return (
    <div>
      {!compact ? (
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
          Institution-wide present-percentage, last {points.length} day{points.length === 1 ? "" : "s"} with attendance taken
          {delta !== 0 ? (
            <span className={delta > 0 ? "ml-1 text-emerald-600 dark:text-emerald-400" : "ml-1 text-red-600 dark:text-red-400"}>
              ({delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts vs first day shown)
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="flex items-end gap-2" style={{ height: compact ? 70 : 100 }}>
        {points.map((p) => (
          <div key={p.date} className="flex flex-1 flex-col items-center gap-1">
            {!compact ? <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{p.presentPercent}%</span> : null}
            <div
              className="w-full rounded-t bg-[var(--brand)]/70"
              style={{ height: `${Math.max(4, (p.presentPercent / maxPercent) * (compact ? 44 : 70))}px` }}
              title={`${formatDate(p.date)}: ${p.presentPercent}% (${p.totalMarked} marked)`}
            />
            {!compact ? (
              <span className="max-w-full truncate text-[10px] text-zinc-400 dark:text-zinc-500">{formatDate(p.date)}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
