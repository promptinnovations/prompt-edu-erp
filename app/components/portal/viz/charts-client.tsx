"use client";

/**
 * The portal charts whose text must stay readable at every width — line,
 * radar and column charts. They measure their container and draw at that
 * real pixel width (instead of scaling a fixed viewBox), so axis labels are
 * 11–12px on a phone and on a wide desktop panel alike. Everything else in
 * the kit is a plain server component (charts.tsx).
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Legend } from "./legend";
import { tint } from "./palette";

const INK_MUTED = "#657087";
const INK_BODY = "#4a5464";
const GRID = "var(--color-zinc-300)";

function fmt(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

function useWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Line chart — change over time (exam-to-exam, month-to-month, period)
// ---------------------------------------------------------------------------
export interface LineSeries { name: string; color: string; values: (number | null)[]; dashed?: boolean }

export function LineChart({
  labels, series, yMax = 100, yMin = 0, height = 240, unit = "%", ticks = [0, 25, 50, 75, 100],
}: {
  labels: string[]; series: LineSeries[]; yMax?: number; yMin?: number; height?: number; unit?: string; ticks?: number[];
}) {
  const [ref, W] = useWidth(560);
  const endLabels = series.length > 1 && series.length <= 4 && W >= 420;
  const left = 40, right = endLabels ? 92 : 18, top = 14, bottom = 30;
  const iw = W - left - right, ih = height - top - bottom;
  const x = (i: number) => labels.length === 1 ? left + iw / 2 : left + (i * iw) / (labels.length - 1);
  const y = (v: number) => top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const maxLabels = Math.max(2, Math.floor(iw / 78));
  const step = Math.max(1, Math.ceil(labels.length / maxLabels));
  const labelChars = Math.max(6, Math.floor((iw / Math.min(labels.length, maxLabels)) / 7));
  return (
    <div ref={ref} className="space-y-2">
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="block max-w-full" role="img" aria-label={series.map((s) => s.name).join(", ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={INK_MUTED}>{t}{unit}</text>
          </g>
        ))}
        {labels.map((l, i) => i === labels.length - 1 || (i % step === 0 && labels.length - 1 - i >= step) ? (
          <text key={i} x={x(i)} y={height - 9} textAnchor={labels.length > 1 && i === 0 ? "start" : labels.length > 1 && i === labels.length - 1 ? "end" : "middle"} fontSize={11} fill={INK_MUTED}>
            {clip(l, labelChars)}
          </text>
        ) : null)}
        {series.map((s) => {
          const pts = s.values
            .map((v, i) => (v == null ? null : ([x(i), y(v), v, i] as const)))
            .filter((p): p is readonly [number, number, number, number] => p !== null);
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
          const last = pts[pts.length - 1];
          return (
            <g key={s.name}>
              {pts.length > 1 && series.length === 1 ? (
                <path d={`${d} L${last[0].toFixed(1)},${(top + ih).toFixed(1)} L${pts[0][0].toFixed(1)},${(top + ih).toFixed(1)} Z`} fill={tint(s.color, 0.1)} />
              ) : null}
              {pts.length > 1 ? (
                <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "6 5" : undefined} />
              ) : null}
              {pts.map((p) => (
                <g key={p[3]}>
                  <circle cx={p[0]} cy={p[1]} r={12} fill="transparent">
                    <title>{`${s.name} · ${labels[p[3]]}: ${fmt(p[2])}${unit}`}</title>
                  </circle>
                  <circle cx={p[0]} cy={p[1]} r={4.5} fill="#fff" stroke={s.color} strokeWidth={2.5} pointerEvents="none" />
                </g>
              ))}
              {series.length === 1 && last ? (
                <text x={last[0]} y={last[1] - 10} textAnchor={pts.length > 1 ? "end" : "middle"} fontSize={12} fontWeight={600} fill={INK_BODY}>{fmt(last[2])}{unit}</text>
              ) : null}
              {last && endLabels ? (
                <text x={last[0] + 9} y={last[1] + 4} fontSize={11} fill={INK_BODY}>{clip(s.name, 12)}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {series.length > 1 ? <Legend items={series.map((s) => ({ label: s.name, color: s.color, dashed: s.dashed }))} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radar — a profile across several axes (subjects, character attributes)
// ---------------------------------------------------------------------------
export function RadarChart({ axes, series, max = 100, rings = 4, unit = "" }: {
  axes: string[]; series: { name: string; color: string; values: (number | null)[] }[];
  max?: number; rings?: number; unit?: string;
}) {
  const [ref, W] = useWidth(460);
  if (axes.length < 3) return null;
  const labelRoom = W < 380 ? 70 : 88;
  const R = Math.max(70, Math.min(170, W / 2 - labelRoom));
  const H = R * 2 + 56;
  const cx = W / 2, cy = H / 2;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
  const pt = (i: number, v: number) => [cx + Math.cos(angle(i)) * R * (v / max), cy + Math.sin(angle(i)) * R * (v / max)] as const;
  const chars = W < 380 ? 9 : 18;
  return (
    <div ref={ref} className="space-y-2">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={`Profile across ${axes.join(", ")}`}>
        {Array.from({ length: rings }, (_, k) => {
          const f = (k + 1) / rings;
          const d = axes.map((_, i) => { const p = pt(i, max * f); return `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`; }).join(" ") + " Z";
          return <path key={k} d={d} fill={k % 2 === 0 ? "var(--color-zinc-50)" : "none"} stroke={GRID} strokeWidth={1} />;
        })}
        {axes.map((a, i) => {
          const end = pt(i, max);
          const lab = pt(i, max * 1.12);
          const anchor = Math.abs(lab[0] - cx) < 8 ? "middle" : lab[0] > cx ? "start" : "end";
          return (
            <g key={a}>
              <line x1={cx} y1={cy} x2={end[0]} y2={end[1]} stroke={GRID} strokeWidth={1} />
              <text x={lab[0]} y={lab[1] + 4} textAnchor={anchor} fontSize={12} fill={INK_BODY}>
                {clip(a, chars)}
                <title>{a}</title>
              </text>
            </g>
          );
        })}
        {series.map((s) => {
          const pts = s.values.map((v, i) => pt(i, v ?? 0));
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
          return (
            <g key={s.name}>
              <path d={d} fill={tint(s.color, 0.18)} stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle cx={p[0]} cy={p[1]} r={11} fill="transparent">
                    <title>{`${s.name} · ${axes[i]}: ${s.values[i] == null ? "—" : `${fmt(s.values[i] as number)}${unit}`}`}</title>
                  </circle>
                  <circle cx={p[0]} cy={p[1]} r={4.5} fill="#fff" stroke={s.color} strokeWidth={2.5} pointerEvents="none" />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 ? <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column bars — one value per period (month-by-month)
// ---------------------------------------------------------------------------
export function ColumnBars({ items, max = 100, unit = "%", height = 210, color }: {
  items: { label: string; value: number | null; color?: string; tip?: string }[]; max?: number; unit?: string; height?: number; color: string;
}) {
  const [ref, W] = useWidth(560);
  const left = 38, right = 8, top = 20, bottom = 28;
  const iw = W - left - right, ih = height - top - bottom;
  const slot = iw / Math.max(1, items.length);
  const bw = Math.max(6, Math.min(44, slot * 0.62));
  const y = (v: number) => top + ih - (Math.min(v, max) / max) * ih;
  const showValues = slot >= 26;
  const labelEvery = slot >= 30 ? 1 : 2;
  return (
    <div ref={ref}>
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="block max-w-full" role="img" aria-label="Column chart">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={left} x2={W - right} y1={y(f * max)} y2={y(f * max)} stroke={GRID} />
            <text x={left - 8} y={y(f * max) + 4} textAnchor="end" fontSize={11} fill={INK_MUTED}>{fmt(f * max, 0)}{unit}</text>
          </g>
        ))}
        {items.map((it, i) => {
          const x0 = left + i * slot + (slot - bw) / 2;
          const v = it.value;
          const c = it.color ?? color;
          const r = Math.min(4, bw / 2);
          return (
            <g key={`${it.label}-${i}`}>
              {v != null && v > 0 ? (
                <>
                  <path
                    d={`M${x0},${top + ih} V${y(v) + r} Q${x0},${y(v)} ${x0 + r},${y(v)} H${x0 + bw - r} Q${x0 + bw},${y(v)} ${x0 + bw},${y(v) + r} V${top + ih} Z`}
                    fill={c}
                  >
                    <title>{it.tip ?? `${it.label}: ${fmt(v)}${unit}`}</title>
                  </path>
                  {showValues ? <text x={x0 + bw / 2} y={y(v) - 6} textAnchor="middle" fontSize={11} fill={INK_BODY}>{fmt(v, 0)}</text> : null}
                </>
              ) : (
                <rect x={x0} y={top} width={bw} height={ih} fill="transparent"><title>{it.tip ?? `${it.label}: ${v ?? "—"}`}</title></rect>
              )}
              {i % labelEvery === 0 ? <text x={x0 + bw / 2} y={height - 9} textAnchor="middle" fontSize={11} fill={INK_MUTED}>{it.label}</text> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
