import type { TeacherPerformanceTrendPoint } from "../../../../modules/analytics/service";

/**
 * §Teacher-Profile feature ("a curve that shows growth and fall") — a pure
 * SVG line/area chart, no chart library needed (same "stays server-
 * renderable, no client JS" reasoning as students' ProfileCharts.tsx
 * MonthlyAttendanceBarChart). Points are already oldest-to-newest (see
 * getTeacherPerformanceTrend()'s own doc comment), left-to-right here.
 */
export function TeacherPerformanceTrendChart({ points }: { points: TeacherPerformanceTrendPoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-500">No exam results recorded yet for this teacher.</p>;
  }
  if (points.length === 1) {
    return (
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        {points[0].examinationName}: <span className="font-semibold">{points[0].percentage}%</span>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Need at least two examinations to draw a trend.</p>
      </div>
    );
  }

  const width = 560;
  const height = 160;
  const padX = 28;
  const padY = 20;
  const maxPct = Math.max(100, ...points.map((p) => p.percentage));
  const stepX = (width - padX * 2) / (points.length - 1);
  const toXY = (i: number, pct: number) => {
    const x = padX + i * stepX;
    const y = padY + (1 - pct / maxPct) * (height - padY * 2);
    return [x, y];
  };
  const linePoints = points.map((p, i) => toXY(i, p.percentage));
  const pathD = linePoints.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const areaD = `${pathD} L${linePoints[linePoints.length - 1][0]},${height - padY} L${linePoints[0][0]},${height - padY} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 180 }}>
        <path d={areaD} fill="var(--brand)" opacity={0.08} />
        <path d={pathD} fill="none" stroke="var(--brand)" strokeWidth={2} />
        {linePoints.map(([x, y], i) => (
          <circle key={points[i].examinationId} cx={x} cy={y} r={3.5} fill="var(--brand)" />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        {points.map((p) => (
          <span key={p.examinationId}>
            {p.examinationName}: <span className="font-medium text-zinc-700 dark:text-zinc-300">{p.percentage}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
