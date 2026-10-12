/**
 * Portal chart kit (§Student-portal-visual-redesign) — small, dependency-
 * free SVG charts rendered on the server. Every mark carries a native
 * <title> tooltip; multi-series charts always have a legend; axes and grid
 * stay recessive; text uses the ink tokens, never the series colour.
 * All charts scale to their container width (viewBox + width 100%).
 */
import type { ReactNode } from "react";
import { NEUTRAL, tint } from "./palette";
import { Legend } from "./legend";

export { Legend } from "./legend";
export { LineChart, RadarChart, ColumnBars, type LineSeries } from "./charts-client";


function fmt(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

// ---------------------------------------------------------------------------
// Ring gauge — one percentage at a glance
// ---------------------------------------------------------------------------
export function RingGauge({
  value, color, size = 120, stroke = 12, center, sub, title,
}: {
  value: number | null; color: string; size?: number; stroke?: number;
  center?: ReactNode; sub?: string; title?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={title ?? (value == null ? "No data" : `${fmt(v)}%`)}>
      {title ? <title>{title}</title> : null}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tint(color, 0.15)} strokeWidth={stroke} />
      {value != null ? (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
      <foreignObject x={stroke} y={stroke} width={size - 2 * stroke} height={size - 2 * stroke}>
        <div className="flex h-full w-full flex-col items-center justify-center text-center leading-tight">
          <div className="font-semibold text-[var(--foreground)]" style={{ fontSize: size * 0.2 }}>
            {center ?? (value == null ? "—" : `${fmt(v)}%`)}
          </div>
          {sub ? <div className="mt-0.5 text-zinc-500" style={{ fontSize: Math.max(10, size * 0.09) }}>{sub}</div> : null}
        </div>
      </foreignObject>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sparkline — a tiny trend inside a stat tile
// ---------------------------------------------------------------------------
export function Sparkline({ values, color, width = 140, height = 40, labels }: {
  values: number[]; color: string; width?: number; height?: number; labels?: string[];
}) {
  if (values.length === 0) return null;
  const pad = 4;
  // Local scale (with a little headroom) so small changes are visible.
  const min = Math.max(0, Math.min(...values) - 8);
  const max = Math.min(100, Math.max(...values) + 8);
  const x = (i: number) => values.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (values.length - 1);
  const y = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - 2 * pad);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(values.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxWidth: width }} role="img" aria-label="Trend">
      <path d={area} fill={tint(color, 0.12)} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 3.5 : 2} fill={color}>
          <title>{`${labels?.[i] ? `${labels[i]}: ` : ""}${fmt(v)}%`}</title>
        </circle>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars — compare named items (subjects, attributes, genres).
// Optional second value per row draws a slim "previous" marker bar.
// ---------------------------------------------------------------------------
export interface HBarRow { label: string; value: number | null; color: string; previous?: number | null; note?: string; suffix?: string }

export function HBars({ rows, max = 100, unit = "%", previousLabel, currentLabel }: {
  rows: HBarRow[]; max?: number; unit?: string; previousLabel?: string; currentLabel?: string;
}) {
  const hasPrev = rows.some((r) => r.previous != null);
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const w = r.value == null ? 0 : Math.max(2, Math.min(100, (r.value / max) * 100));
          const pw = r.previous == null ? null : Math.max(2, Math.min(100, (r.previous / max) * 100));
          const delta = r.value != null && r.previous != null ? r.value - r.previous : null;
          return (
            <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
              <span className="truncate text-zinc-700" title={r.label}>{r.label}</span>
              <span className="relative block" title={`${r.label}: ${r.value == null ? "—" : `${fmt(r.value)}${unit}`}${r.previous != null ? ` (before: ${fmt(r.previous)}${unit})` : ""}`}>
                <span className="block h-3 overflow-hidden rounded-full" style={{ backgroundColor: tint(r.color, 0.12) }}>
                  <span className="block h-full rounded-full" style={{ width: `${w}%`, backgroundColor: r.color }} />
                </span>
                {pw != null ? (
                  <span className="mt-1 block h-1.5 rounded-full bg-zinc-300" style={{ width: `${pw}%` }} />
                ) : null}
              </span>
              <span className="w-20 text-right tabular-nums">
                <span className="font-semibold text-[var(--foreground)]">{r.value == null ? "—" : `${fmt(r.value)}${r.suffix ?? unit}`}</span>
                {delta != null && Math.abs(delta) >= 0.1 ? (
                  <span className={`ml-1 text-xs ${delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>{delta > 0 ? "▲" : "▼"}{fmt(Math.abs(delta))}</span>
                ) : null}
                {r.note ? <span className="block text-[11px] text-zinc-500">{r.note}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {hasPrev ? (
        <Legend items={[{ label: currentLabel ?? "Now", color: "#2a78d6" }, { label: previousLabel ?? "Before", color: "#c7bda9" }]} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut — parts of a whole (status mix, category mix)
// ---------------------------------------------------------------------------
export function DonutChart({ segments, size = 168, stroke = 26, center, sub }: {
  segments: { label: string; value: number; color: string }[]; size?: number; stroke?: number; center?: ReactNode; sub?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-zinc-200)" strokeWidth={stroke} />
        {total > 0 ? segments.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${s.label}: ${s.value} (${fmt((s.value / total) * 100)}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        }) : null}
        <foreignObject x={stroke} y={stroke} width={size - 2 * stroke} height={size - 2 * stroke}>
          <div className="flex h-full w-full flex-col items-center justify-center text-center leading-tight">
            <div className="text-2xl font-semibold text-[var(--foreground)]">{center ?? total}</div>
            {sub ? <div className="text-[11px] text-zinc-500">{sub}</div> : null}
          </div>
        </foreignObject>
      </svg>
      <ul className="min-w-[9rem] flex-1 space-y-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-zinc-700">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="tabular-nums font-medium text-[var(--foreground)]">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grade chips — how many subjects landed in each grade
// ---------------------------------------------------------------------------
export function GradeChips({ bands, counts }: {
  bands: { grade_label: string; color: string | null; description?: string | null }[]; counts: Record<string, number>;
}) {
  if (bands.length === 0) return null;
  return (
    <ul className="grid grid-cols-3 gap-2">
      {bands.map((b) => {
        const n = counts[b.grade_label] ?? 0;
        const c = b.color || NEUTRAL;
        return (
          <li
            key={b.grade_label}
            className={`rounded-xl border px-3 py-2 text-center ${n === 0 ? "opacity-50" : ""}`}
            style={{ borderColor: tint(c, 0.4), backgroundColor: tint(c, n === 0 ? 0.04 : 0.12) }}
            title={b.description ?? undefined}
          >
            <div className="text-lg font-bold" style={{ color: c }}>{b.grade_label}</div>
            <div className="text-xs text-zinc-600">{n} subject{n === 1 ? "" : "s"}</div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Timeline — dated items, newest first
// ---------------------------------------------------------------------------
export function Timeline({ items }: {
  items: { key: string; date: string; title: string; meta?: string; color: string; icon?: string; aside?: ReactNode }[];
}) {
  return (
    <ol className="relative space-y-4 border-l-2 border-[var(--border-subtle)] pl-6">
      {items.map((i) => (
        <li key={i.key} className="relative">
          <span
            aria-hidden
            className="absolute -left-[2.15rem] top-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[12px] text-white ring-4 ring-[var(--surface)]"
            style={{ backgroundColor: i.color }}
          >
            {i.icon ?? ""}
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-sm font-medium text-[var(--foreground)]">{i.title}</span>
            <span className="text-xs text-zinc-500">{i.date}</span>
          </div>
          {i.meta ? <div className="text-xs text-zinc-500">{i.meta}</div> : null}
          {i.aside}
        </li>
      ))}
    </ol>
  );
}
