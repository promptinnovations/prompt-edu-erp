import { getStudent360 } from "../../../../../modules/portfolio/service";
import { requireOwnStudentId, NotLinkedNotice, Card } from "../_lib";

/** Exam performance — results, attendance and consolidated score, with the
 *  consolidated score's breakdown_jsonb rendered as a simple bar list. */
export default async function StudentExamsPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const summary = await getStudent360(institutionId, authUserId, ownStudentId);
  const breakdown = summary.latestConsolidatedScore?.breakdown_jsonb ?? {};
  const breakdownEntries = Object.entries(breakdown);
  const maxValue = Math.max(1, ...breakdownEntries.map(([, v]) => Number(v) || 0));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Exam performance</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Your latest result, attendance for the year, and consolidated score.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="text-2xl font-semibold text-[var(--foreground)]">
            {summary.latestResult ? `${summary.latestResult.percentage}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {summary.latestResult ? `${summary.latestResult.examination_name}${summary.latestResult.grade_label ? ` · Grade ${summary.latestResult.grade_label}` : ""}` : "No results yet"}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="text-2xl font-semibold text-[var(--foreground)]">
            {summary.attendanceSummary ? `${summary.attendanceSummary.present_percent}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {summary.attendanceSummary ? `${summary.attendanceSummary.present_days} / ${summary.attendanceSummary.total_days} days present` : "Attendance this year"}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="text-2xl font-semibold text-[var(--foreground)]">
            {summary.latestConsolidatedScore ? summary.latestConsolidatedScore.score : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {summary.latestConsolidatedScore ? `Consolidated · ${summary.latestConsolidatedScore.period}` : "Consolidated score"}
          </div>
        </div>
      </div>

      {breakdownEntries.length > 0 ? (
        <Card title="Score breakdown" subtitle={summary.latestConsolidatedScore?.period}>
          <div className="space-y-3">
            {breakdownEntries.map(([label, value]) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span className="capitalize text-[var(--foreground)]">{label.replace(/_/g, " ")}</span>
                  <span>{value}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
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
    </div>
  );
}
