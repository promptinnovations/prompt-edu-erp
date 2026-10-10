import { formatDateIST } from "../../services/datetime/ist";
/** §Attendance-follow-up-3 "can be a curve last 30 days, monthly also
 *  should be available" — the monthly companion to AttendanceTrendChart.tsx,
 *  adapted for mv_attendance_monthly's month-based shape
 *  (getInstitutionAttendanceTrendMonthly()) rather than the daily curve's
 *  date-based one. Kept as a separate component instead of overloading
 *  AttendanceTrendChart's prop shape — the two data shapes
 *  (date+totalMarked vs. month+present_days/late_days/total_days) are
 *  different enough that a single component juggling both would need more
 *  branching than just having two small, honest components.
 *
 *  §Attendance-trend-redesign follow-up — same line-chart switch as
 *  AttendanceTrendChart.tsx's own comment explains: a multi-month trend is
 *  a line's job, and LineTrendChart's SVG scales to its card instead of
 *  overflowing it. */
import type { AttendanceTrendRow } from "../../modules/analytics/service";
import { LineTrendChart } from "./charts/ResultCharts";
import { seriesColor } from "./charts/series";

function formatMonth(m: string) {
  return formatDateIST(m, { month: "short", year: "numeric" });
}

export default function MonthlyAttendanceTrendChart({ points }: { points: AttendanceTrendRow[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-zinc-500">No attendance has been taken yet this range.</p>;
  }
  const first = points[0].present_percent;
  const last = points[points.length - 1].present_percent;
  const delta = Math.round((last - first) * 100) / 100;

  return (
    <div>
      <p className="mb-3 text-xs text-zinc-500">
        Present-percentage by month
        {delta !== 0 ? (
          <span className={delta > 0 ? "ml-1 text-emerald-600" : "ml-1 text-red-600"}>
            ({delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts vs first month shown)
          </span>
        ) : null}
        {" — reads a periodically-refreshed summary; use “Refresh analytics” on the Analysis page if it looks stale."}
      </p>
      <LineTrendChart
        series={[{
          label: "Present %",
          color: seriesColor(0),
          points: points.map((p) => ({ x: formatMonth(p.month), y: p.present_percent })),
        }]}
        height={160}
        maxY={100}
        showAxes
        yAxisSuffix="%"
      />
    </div>
  );
}
