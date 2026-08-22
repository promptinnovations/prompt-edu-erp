/**
 * PROMPT EDU ERP — Result Analysis & Reporting: reusable SVG chart
 * primitives (§367 of the Result Analysis spec).
 *
 * Deliberately NOT a chart library dependency — same reasoning as
 * app/(institution)/staff/[id]/ProfileCharts.tsx's
 * TeacherPerformanceTrendChart: pure server-renderable SVG, no client JS,
 * works inside a printable page (§ "every report printable/exportable as a
 * clean page" — a canvas-based chart lib wouldn't survive print/export the
 * same way inline SVG does).
 *
 * COLOR RULE (§K, binding across the whole Result Analysis feature): every
 * color passed into these components must already have been resolved by
 * the CALLER from the tenant's GradingScale (grade_bands.color) or from the
 * fixed PASS_COLOR/FAIL_COLOR pair (modules/examination/service.ts) — never
 * a literal hex chosen here. These components only render whatever color
 * they're given; they never choose one themselves (the one exception is
 * DEFAULT_SERIES_COLORS below, used only for chart series that have no
 * institution-config color to begin with, e.g. a multi-exam score trend
 * line — never for a grade band or pass/fail).
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------
export interface ChartDatum {
  label: string;
  value: number;
  color: string;
}

/** Neutral, non-grading palette for charts that have no institution-config
 *  color to draw from at all (e.g. one line per teacher in a ranking line
 *  chart). Never used for anything grade/pass-fail related. */
const DEFAULT_SERIES_COLORS = ["#4f46e5", "#0891b2", "#c026d3", "#ea580c", "#65a30d", "#0d9488", "#9333ea", "#dc2626"];

function fmtPct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

// ---------------------------------------------------------------------------
// Donut / Ring — grade distribution, pass/fail split
// ---------------------------------------------------------------------------
export function Donut({
  segments,
  size = 160,
  thickness = 22,
  centerLabel,
  centerSubLabel,
}: {
  segments: ChartDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSubLabel?: string;
}) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  if (total <= 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={thickness} />
      </svg>
    );
  }

  let offset = 0;
  return (
    <div className="inline-flex flex-col items-center gap-2">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={thickness} />
        {segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const frac = s.value / total;
            const dash = frac * circumference;
            const el = (
              <circle
                key={s.label}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return el;
          })}
      </svg>
      {centerLabel ? (
        <div className="text-center" style={{ marginTop: -size / 2 - 8, height: size / 2 }}>
          <div className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">{centerLabel}</div>
          {centerSubLabel ? <div className="text-[11px] text-zinc-400 dark:text-zinc-500">{centerSubLabel}</div> : null}
        </div>
      ) : null}
      <ChartLegend segments={segments} total={total} />
    </div>
  );
}

function ChartLegend({ segments, total }: { segments: ChartDatum[]; total: number }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
      {segments.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.label} ({s.value}{total > 0 ? `, ${fmtPct((s.value / total) * 100)}` : ""})
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart — vertical or horizontal, single series, per-bar color
// ---------------------------------------------------------------------------
export function BarChart({
  data,
  orientation = "vertical",
  maxValue,
  height = 180,
  valueFormat,
}: {
  data: ChartDatum[];
  orientation?: "vertical" | "horizontal";
  maxValue?: number;
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  const fmt = valueFormat ?? ((v: number) => String(Math.round(v * 10) / 10));
  const max = maxValue ?? Math.max(1, ...data.map((d) => d.value));

  if (orientation === "horizontal") {
    return (
      <div className="flex flex-col gap-2">
        {data.map((d) => {
          const pct = Math.max(0, Math.min(100, (d.value / max) * 100));
          return (
            <div key={d.label} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-xs text-zinc-500 dark:text-zinc-400" title={d.label}>{d.label}</span>
              <div className="h-4 flex-1 rounded bg-zinc-100 dark:bg-zinc-800">
                <div className="h-4 rounded" style={{ width: `${pct}%`, backgroundColor: d.color, minWidth: d.value > 0 ? 3 : 0 }} />
              </div>
              <span className="w-12 shrink-0 text-right text-xs font-medium text-zinc-700 dark:text-zinc-300">{fmt(d.value)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const width = Math.max(240, data.length * 56);
  const padBottom = 28;
  const padTop = 16;
  const barW = Math.min(40, (width / data.length) * 0.6);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
      {data.map((d, i) => {
        const slot = width / data.length;
        const x = i * slot + (slot - barW) / 2;
        const barH = Math.max(0, ((height - padBottom - padTop) * d.value) / max);
        const y = height - padBottom - barH;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill={d.color} />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" className="fill-zinc-700 dark:fill-zinc-300" fontSize={11} fontWeight={600}>
              {fmt(d.value)}
            </text>
            <text x={x + barW / 2} y={height - padBottom + 14} textAnchor="middle" className="fill-zinc-400 dark:fill-zinc-500" fontSize={10}>
              {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Histogram — marks-distribution, bucket edges supplied by the caller
// (built dynamically from the tenant's GradeBand rows — never hardcoded
// cutoffs here; this component just draws whatever buckets it's given).
// ---------------------------------------------------------------------------
export function Histogram({ buckets, height = 180 }: { buckets: ChartDatum[]; height?: number }) {
  return <BarChart data={buckets} orientation="vertical" height={height} valueFormat={(v) => String(Math.round(v))} />;
}

// ---------------------------------------------------------------------------
// Stacked bar — one bar per group (e.g. per Division/Class), segments are
// that group's grade-band breakdown. Used for grade-distribution-by-group
// comparisons (School-wide stacked bar, Class-wise grade distribution).
// ---------------------------------------------------------------------------
export interface StackedBarGroup {
  label: string;
  segments: ChartDatum[];
}

export function StackedBarChart({ groups }: { groups: StackedBarGroup[] }) {
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => {
        const total = g.segments.reduce((s, d) => s + d.value, 0);
        return (
          <div key={g.label} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-xs text-zinc-500 dark:text-zinc-400" title={g.label}>{g.label}</span>
            <div className="flex h-4 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
              {total > 0
                ? g.segments
                    .filter((s) => s.value > 0)
                    .map((s) => (
                      <div
                        key={s.label}
                        style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
                        title={`${s.label}: ${s.value}`}
                      />
                    ))
                : null}
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-medium text-zinc-700 dark:text-zinc-300">{total}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line — multi-exam / multi-series trend
// ---------------------------------------------------------------------------
export interface LineSeries {
  label: string;
  color?: string;
  points: { x: string; y: number }[];
}

export function LineTrendChart({ series, height = 180, maxY }: { series: LineSeries[]; height?: number; maxY?: number }) {
  const nonEmpty = series.filter((s) => s.points.length > 0);
  if (nonEmpty.length === 0) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-500">Not enough data yet to draw a trend.</p>;
  }
  const width = 560;
  const padX = 32;
  const padY = 20;
  const pointCount = Math.max(...nonEmpty.map((s) => s.points.length));
  const max = maxY ?? Math.max(100, ...nonEmpty.flatMap((s) => s.points.map((p) => p.y)));
  const stepX = pointCount > 1 ? (width - padX * 2) / (pointCount - 1) : 0;
  const toXY = (i: number, y: number) => {
    const x = padX + i * stepX;
    const yy = padY + (1 - y / max) * (height - padY * 2);
    return [x, yy] as const;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height + 10 }}>
        {nonEmpty.map((s, si) => {
          const color = s.color ?? DEFAULT_SERIES_COLORS[si % DEFAULT_SERIES_COLORS.length];
          const pts = s.points.map((p, i) => toXY(i, p.y));
          const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
          return (
            <g key={s.label}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} />
              {pts.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={3} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        {nonEmpty.map((s, si) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color ?? DEFAULT_SERIES_COLORS[si % DEFAULT_SERIES_COLORS.length] }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card — small building block used across every tab
// ---------------------------------------------------------------------------
export function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={accent ? { color: accent } : undefined}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{sub}</p> : null}
    </div>
  );
}
