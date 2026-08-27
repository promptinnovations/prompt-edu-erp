/**
 * PROMPT EDU ERP — Dashboard's attendance trend widget for Section Head /
 * Principal / Management (§Dashboard follow-up: "instead of [plain bars]
 * use the type of graph in [a labelled multi-colour line chart]. left side
 * should be 1-100%. at the bottom last 15 days. line should show different
 * sections differently — use different colours").
 *
 * Thin presentation layer over the shared LineTrendChart primitive
 * (app/components/charts/ResultCharts.tsx) — one line per school STAGE
 * ("Section" in Section Head terminology), fed by
 * getInstitutionAttendanceTrendByStage(). Server component: the data is
 * already resolved server-side by the caller (same convention as
 * AttendanceTrendChart.tsx/MonthlyAttendanceTrendChart.tsx), this just
 * reshapes it into LineSeries[] and renders.
 */
import { LineTrendChart, type LineSeries } from "./charts/ResultCharts";
import type { AttendanceTrendByStagePoint } from "../../modules/attendance/service";

// Same neutral palette convention as ResultCharts.tsx's own
// DEFAULT_SERIES_COLORS (this is genuinely institution/stage-agnostic data
// with no grading-scale color to draw from), duplicated locally rather than
// exported from that file since colors here are matched to STAGE NAMES,
// not chart-primitive internals.
const STAGE_COLORS = ["#4f46e5", "#0891b2", "#c026d3", "#ea580c", "#65a30d", "#0d9488", "#9333ea", "#dc2626"];

function formatDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function AttendanceStageTrendChart({ points }: { points: AttendanceTrendByStagePoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-zinc-400">No attendance has been taken yet.</p>;
  }

  // Every distinct calendar date across all stages, in order — the shared
  // X axis every stage's line is plotted against (a stage with no marked
  // attendance on a given date just has a gap for that point rather than a
  // misleading 0%, same "only count what actually happened" convention as
  // getInstitutionAttendanceTrend()).
  const dates = [...new Set(points.map((p) => p.date))].sort();
  const stages = [...new Set(points.map((p) => p.stage))].sort();

  const series: LineSeries[] = stages.map((stage, i) => {
    const byDate = new Map(points.filter((p) => p.stage === stage).map((p) => [p.date, p]));
    return {
      label: stage,
      color: STAGE_COLORS[i % STAGE_COLORS.length],
      // One point per shared date, always — a stage with no attendance
      // marked on a given date gets `y: null` (a gap in its line) rather
      // than being omitted, which would otherwise shift its remaining
      // points out of alignment with every other stage's line (they're
      // plotted by shared X *position*, not by matching date value).
      points: dates.map((d) => ({ x: d, y: byDate.get(d)?.presentPercent ?? null })),
    };
  });

  return (
    <LineTrendChart
      series={series}
      height={150}
      maxY={100}
      showAxes
      yAxisSuffix="%"
      xLabels={dates.map(formatDate)}
    />
  );
}
