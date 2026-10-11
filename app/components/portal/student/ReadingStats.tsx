import type { ReadingInsights } from "../../../../modules/portal/student-insights";
import { Panel, StatTile, EmptyNote } from "../viz/blocks";
import { ColumnBars, DonutChart } from "../viz/charts";
import { CHART_SERIES, NEUTRAL, seriesColor } from "../viz/palette";
import { AREA } from "./areas";

/** §Student-portal-visual-redesign — the reading picture at the top of
 *  Library & reading: books read, reviews published, likes received and
 *  genres explored; books per month for the last 12 months; genre and language
 *  mix. The catalogue, bookings and Review Corner follow below it. */
export default function ReadingStats({ data }: { data: ReadingInsights }) {
  const distinct = new Set(data.books.map((b) => b.book_id)).size;
  const reviewed = data.books.filter((b) => b.review_status === "approved").length;

  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleString("en", { month: "short", timeZone: "UTC" }) };
  });
  const perMonth = months.map((m) => ({ ...m, value: data.books.filter((b) => b.date.startsWith(m.key)).length }));

  const group = (key: (b: ReadingInsights["books"][number]) => string | null) => {
    const m = new Map<string, number>();
    for (const b of data.books) { const k = key(b) || "Other"; m.set(k, (m.get(k) ?? 0) + 1); }
    const rows = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const top = rows.slice(0, 7);
    const rest = rows.slice(7).reduce((s, r) => s + r[1], 0);
    return [...top.map(([label, value], i) => ({ label, value, color: CHART_SERIES[i] })), ...(rest > 0 ? [{ label: "Other", value: rest, color: NEUTRAL }] : [])];
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Books read" icon="📚" color={AREA.reading.color} value={distinct} />
        <StatTile label="Reviews published" icon="✍️" color={seriesColor(1)} value={reviewed} />
        <StatTile label="Likes on reviews" icon="👍" color={seriesColor(4)} value={data.likesReceived} />
        <StatTile label="Genres explored" icon="🧭" color={seriesColor(2)} value={new Set(data.books.map((b) => b.category).filter(Boolean)).size} />
      </section>

      {data.books.length === 0 ? (
        <Panel title="Reading" color={AREA.reading.color}>
          <EmptyNote>The reading chart starts with the first book returned to the library.</EmptyNote>
        </Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-5">
          <Panel title="Books per month" subtitle="Books returned in the last 12 months." color={AREA.reading.color} className="xl:col-span-3">
            <ColumnBars
              unit="" color={AREA.reading.color} max={Math.max(4, ...perMonth.map((m) => m.value))}
              items={perMonth.map((m) => ({ label: m.label, value: m.value, tip: `${m.label}: ${m.value} book${m.value === 1 ? "" : "s"}` }))}
            />
          </Panel>
          <Panel title="Genres" subtitle="What has been read, by genre." color={AREA.reading.color} className="xl:col-span-2">
            <DonutChart center={data.books.length} sub="books" segments={group((b) => b.category)} />
          </Panel>
        </div>
      )}
    </div>
  );
}
