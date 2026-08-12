import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../services/request-context";
import { can } from "../../../../../services/permissions/permission-service";
import { getStudent360 } from "../../../../../modules/portfolio/service";

export default async function StudentPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  if (!can(ctx.permissions, "portfolio.view_all") && !can(ctx.permissions, "portfolio.view_own")) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-zinc-500">You don&apos;t have permission to view this student&apos;s portfolio.</p>
      </div>
    );
  }

  const profile = await getStudent360(institutionId, authUserId, id);
  if (!profile.student) notFound(); // RLS already guarantees this is null for another institution's id (§E.3)

  return (
    <div className="space-y-6">
      <Link href={`/students/${id}`} className="text-sm text-zinc-500 underline">
        ← Back to {profile.student.full_name}
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-900">
        Student 360° — {profile.student.full_name}
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Latest result</div>
          {profile.latestResult ? (
            <>
              <div className="mt-2 text-2xl font-semibold text-zinc-900">{Number(profile.latestResult.percentage).toFixed(1)}%</div>
              <div className="mt-1 text-xs text-zinc-500">
                {profile.latestResult.examination_name}{profile.latestResult.grade_label ? ` — ${profile.latestResult.grade_label}` : ""}
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-zinc-400">No results yet</div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Attendance (this year)</div>
          {profile.attendanceSummary ? (
            <>
              <div className="mt-2 text-2xl font-semibold text-zinc-900">{profile.attendanceSummary.present_percent}%</div>
              <div className="mt-1 text-xs text-zinc-500">
                {profile.attendanceSummary.present_days} / {profile.attendanceSummary.total_days} days
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-zinc-400">No attendance yet</div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Consolidated score</div>
          {profile.latestConsolidatedScore ? (
            <>
              <div className="mt-2 text-2xl font-semibold text-zinc-900">{profile.latestConsolidatedScore.score}</div>
              <div className="mt-1 text-xs text-zinc-500">{profile.latestConsolidatedScore.period}</div>
              <div className="mt-2 text-xs text-zinc-500">
                {Object.entries(profile.latestConsolidatedScore.breakdown_jsonb)
                  .map(([k, v]) => `${k}: ${Number(v).toFixed(1)}`)
                  .join(" · ")}
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-zinc-400">Not computed yet — see the Scoring page.</div>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Portfolio timeline</h2>
        <p className="mb-3 text-xs text-zinc-400">
          Only approved activities appear here — nothing pending or rejected ever shows up (§L.3).
        </p>
        <ul className="divide-y divide-zinc-100">
          {profile.recentPortfolioEvents.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="text-zinc-900">{e.title}</div>
                {e.description ? <div className="text-xs text-zinc-500">{e.description}</div> : null}
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                {e.score !== null ? <span>{e.score} pts</span> : null}
                <span>{e.event_date}</span>
              </div>
            </li>
          ))}
          {profile.recentPortfolioEvents.length === 0 ? (
            <li className="py-4 text-center text-sm text-zinc-400">No approved activities yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
