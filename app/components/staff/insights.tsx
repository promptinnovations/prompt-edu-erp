/**
 * §Staff-pages-visual — small helpers for the "at a glance" strips added to
 * staff pages. Each turns rows a page has ALREADY loaded into a chart; none
 * fetches anything, so adding a strip never changes what a page loads or
 * does.
 */
import { DonutChart, ColumnBars, HBars } from "../portal/viz/charts";
import { CHART_SERIES, NEUTRAL } from "../portal/viz/palette";

/** Count rows by a label; top 7 keep their own colour, the rest fold into
 *  "Other" (never a generated 9th hue). Fixed colours can be passed for
 *  known labels (e.g. statuses). */
export function countSegments<T>(
  rows: T[], label: (r: T) => string | null | undefined, fixed?: Record<string, string>,
): { label: string; value: number; color: string }[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = label(r) || "Not set"; m.set(k, (m.get(k) ?? 0) + 1); }
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
  if (fixed) return sorted.map(([l, v], i) => ({ label: l, value: v, color: fixed[l] ?? CHART_SERIES[i] ?? NEUTRAL }));
  const top = sorted.slice(0, 7).map(([l, v], i) => ({ label: l, value: v, color: CHART_SERIES[i] as string }));
  const rest = sorted.slice(7).reduce((a, [, v]) => a + v, 0);
  return rest > 0 ? [...top, { label: "Other", value: rest, color: NEUTRAL }] : top;
}

export function CountDonut<T>({ rows, label, fixed, sub }: {
  rows: T[]; label: (r: T) => string | null | undefined; fixed?: Record<string, string>; sub?: string;
}) {
  return <DonutChart size={136} stroke={21} center={rows.length} sub={sub} segments={countSegments(rows, label, fixed)} />;
}

/** Rows per month for the last `months` months (oldest first). */
export function MonthBars<T>({ rows, date, color, months = 6, noun = "records" }: {
  rows: T[]; date: (r: T) => string | null | undefined; color: string; months?: number; noun?: string;
}) {
  const now = new Date();
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1) + i, 1));
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleString("en", { month: "short", timeZone: "UTC" }) };
  });
  const items = keys.map((k) => {
    const n = rows.filter((r) => (date(r) ?? "").slice(0, 7) === k.key).length;
    return { label: k.label, value: n, tip: `${k.label}: ${n} ${noun}` };
  });
  return <ColumnBars unit="" color={color} height={180} max={Math.max(4, ...items.map((i) => i.value))} items={items} />;
}

export function CountBars<T>({ rows, label, color, limit = 10 }: {
  rows: T[]; label: (r: T) => string | null | undefined; color: string; limit?: number;
}) {
  const segs = countSegments(rows, label).filter((s) => s.label !== "Other").slice(0, limit);
  return <HBars unit="" max={Math.max(1, ...segs.map((s) => s.value))} rows={segs.map((s) => ({ label: s.label, value: s.value, color, suffix: "" }))} />;
}
