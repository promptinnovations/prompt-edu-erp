import { formatDateIST } from "../../services/datetime/ist";
/** Shared "growth and fall" attendance trend chart (§Page-4 follow-up
 *  "Attendance analytics — growth and fall diagram, recent days"). Server
 *  component (no client hooks) so it drops into the Attendance page, the
 *  Dashboard, and the Analysis hub identically.
 *
 *  §Attendance-trend-redesign follow-up ("use another appropriate visual
 *  graphics to represent attendance — also it surpasses the given area,
 *  that should be fixed"): this used to be `flex-1` CSS bars, one per day
 *  — with up to 30 days in the full (non-compact) view, the bars had no
 *  room to shrink below their label/tooltip content and overflowed the
 *  card. A day-over-day percentage with this many points is a trend line's
 *  job, not a bar chart's (bars are for comparing discrete categories —
 *  see the dataviz skill's "choosing a form"), so this now reuses the
 *  house LineTrendChart (app/components/charts/ResultCharts.tsx — the
 *  same SVG-line primitive the exam pass-rate-trend widget already uses).
 *  Its `viewBox` + `w-full` SVG scales to its container instead of
 *  growing past it, which fixes the overflow as a side effect of the
 *  chart-type change, not a separate patch. */
import type { AttendanceTrendPoint } from "../../modules/attendance/service";
import { LineTrendChart } from "./charts/ResultCharts";
import { seriesColor } from "./charts/series";

function formatDate(d: string) {
  return formatDateIST(d, { day: "numeric", month: "short" });
}

export default function AttendanceTrendChart({
  points,
  compact = false,
}: {
  points: AttendanceTrendPoint[];
  compact?: boolean;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-zinc-500">No attendance has been taken yet.</p>;
  }
  const first = points[0].presentPercent;
  const last = points[points.length - 1].presentPercent;
  const delta = Math.round((last - first) * 100) / 100;

  return (
    <div>
      {!compact ? (
        <p className="mb-3 text-xs text-zinc-500">
          Institution-wide present-percentage, last {points.length} day{points.length === 1 ? "" : "s"} with attendance taken
          {delta !== 0 ? (
            <span className={delta > 0 ? "ml-1 text-emerald-600" : "ml-1 text-red-600"}>
              ({delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts vs first day shown)
            </span>
          ) : null}
        </p>
      ) : null}
      <LineTrendChart
        series={[{
          label: "Present %",
          color: seriesColor(0),
          points: points.map((p) => ({ x: formatDate(p.date), y: p.presentPercent })),
        }]}
        height={compact ? 90 : 160}
        maxY={100}
        showAxes={!compact}
        yAxisSuffix="%"
      />
    </div>
  );
}
