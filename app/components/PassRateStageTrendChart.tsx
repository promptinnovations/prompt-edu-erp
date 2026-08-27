/**
 * PROMPT EDU ERP — Dashboard follow-up ("do the same of attendance trend
 * for [pass rate] as well — Y axis 0-100%, X-axis each exams — different
 * section different colour — make both attendance & pass rate
 * colourful").
 *
 * Thin presentation layer over the shared LineTrendChart primitive
 * (app/components/charts/ResultCharts.tsx) — same shape as
 * AttendanceStageTrendChart.tsx, one line per school STAGE, fed by
 * getInstitutionPassRateTrendByStage(). X-axis is exam names (oldest to
 * newest) instead of dates. Server component: data is already resolved
 * server-side by the caller, this just reshapes it into LineSeries[].
 */
import { LineTrendChart, type LineSeries } from "./charts/ResultCharts";
import type { PassRateTrendByStagePoint } from "../../modules/examination/service";

// Same palette as AttendanceStageTrendChart.tsx's STAGE_COLORS, kept in
// sync deliberately so the same stage is drawn the same colour across
// both Dashboard charts.
const STAGE_COLORS = ["#4f46e5", "#0891b2", "#c026d3", "#ea580c", "#65a30d", "#0d9488", "#9333ea", "#dc2626"];

// Exam names ("Final Term Examination 2026-27") are much longer than the
// short dates AttendanceStageTrendChart's X axis shows — shorten for the
// axis tick label so a handful of exams don't overlap; the point's own `x`
// (used in LineTrendChart's hover tooltip) keeps the full name.
function shortLabel(name: string) {
  return name.length > 16 ? `${name.slice(0, 15)}…` : name;
}

export default function PassRateStageTrendChart({ points }: { points: PassRateTrendByStagePoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-zinc-400">No published results yet.</p>;
  }

  // Every distinct examination across all stages, in the order it was
  // returned (already oldest-to-newest) — the shared X axis every stage's
  // line is plotted against. A stage with no students in a given exam gets
  // a gap for that point rather than a misleading 0%.
  const examIds = [...new Set(points.map((p) => p.examinationId))];
  const examNames = new Map(points.map((p) => [p.examinationId, p.examinationName]));
  const stages = [...new Set(points.map((p) => p.stage))].sort();

  const series: LineSeries[] = stages.map((stage, i) => {
    const byExam = new Map(points.filter((p) => p.stage === stage).map((p) => [p.examinationId, p]));
    return {
      label: stage,
      color: STAGE_COLORS[i % STAGE_COLORS.length],
      // One point per shared exam, always — a stage with no students in a
      // given exam gets `y: null` (a gap) rather than being omitted, which
      // would otherwise shift its remaining points out of alignment with
      // every other stage's line (plotted by shared X *position*, not by
      // matching exam id). `x` is the full exam name (shown on hover), the
      // shortened version is only used for the axis tick labels below.
      points: examIds.map((id) => ({ x: examNames.get(id)!, y: byExam.get(id)?.percentage ?? null })),
    };
  });

  return (
    <LineTrendChart
      series={series}
      height={150}
      maxY={100}
      showAxes
      yAxisSuffix="%"
      xLabels={examIds.map((id) => shortLabel(examNames.get(id)!))}
    />
  );
}
