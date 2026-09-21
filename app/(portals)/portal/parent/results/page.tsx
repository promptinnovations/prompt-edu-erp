import Link from "next/link";
import { requireOwnParentContext, NotLinkedNotice, Card } from "../_lib";
import { listStudentResultHistory } from "../../../../../modules/examination/service";
import { getLatestConsolidatedScore } from "../../../../../modules/scoring/service";

/** Detail view behind the parent dashboard's "Results" and "Consolidated
 *  score" stat-card buttons — every computed exam result for this child
 *  (not just the latest one getStudent360() surfaces), plus the current
 *  consolidated score breakdown, mirroring the student portal's combined
 *  /portal/student/exams page but for whichever child the parent selected. */
export default async function ParentResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const child = children.find((c) => c.id === selectedChildId);

  const [results, consolidatedScore] = await Promise.all([
    listStudentResultHistory(institutionId, authUserId, selectedChildId),
    getLatestConsolidatedScore(institutionId, authUserId, selectedChildId),
  ]);
  const breakdown = consolidatedScore?.breakdown_jsonb ?? {};
  const breakdownEntries = Object.entries(breakdown);
  const maxValue = Math.max(1, ...breakdownEntries.map(([, v]) => Number(v) || 0));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/portal/parent?childId=${selectedChildId}`} className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
          ← Back to {child?.full_name ?? "overview"}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--heading)]">Results — {child?.full_name}</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Every computed exam result, and the current consolidated score.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-card border bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">{results[0] ? `${results[0].percentage}%` : "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">
            {results[0] ? `Latest: ${results[0].examination_name}${results[0].grade_label ? ` · Grade ${results[0].grade_label}` : ""}` : "No results yet"}
          </div>
        </div>
        <div className="rounded-card border bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">{consolidatedScore ? consolidatedScore.score : "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">
            {consolidatedScore ? `Consolidated · ${consolidatedScore.period}` : "Consolidated score"}
          </div>
        </div>
      </div>

      {breakdownEntries.length > 0 ? (
        <Card title="Score breakdown" subtitle={consolidatedScore?.period}>
          <div className="space-y-3">
            {breakdownEntries.map(([label, value]) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span className="capitalize text-zinc-900">{label.replace(/_/g, " ")}</span>
                  <span>{value}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)]"
                    style={{ width: `${Math.min(100, (Number(value) / maxValue) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="All results">
        <ul className="space-y-2 text-sm">
          {results.map((r) => (
            <li key={r.examination_id} className="flex items-center justify-between border-b pb-2 last:border-0">
              <span>{r.examination_name}{r.grade_label ? ` — Grade ${r.grade_label}` : ""}</span>
              <span className="text-zinc-500">{r.percentage}%</span>
            </li>
          ))}
          {results.length === 0 ? <li className="text-zinc-500">No results yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
