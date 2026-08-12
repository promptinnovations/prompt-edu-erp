import { requireRequestContext } from "../../../../services/request-context";
import { getOwnStudentId } from "../../../../modules/portal/service";
import { getStudent360 } from "../../../../modules/portfolio/service";
import { listSkillTypes, listSkillActivities } from "../../../../modules/skills/service";
import { listAchievementCategories, listAchievementLevels } from "../../../../modules/achievements/service";
import { listBooks } from "../../../../modules/library/service";
import SubmitSkillForm from "./SubmitSkillForm";
import SubmitAchievementForm from "./SubmitAchievementForm";

export default async function StudentPortalPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const ownStudentId = await getOwnStudentId(institutionId, authUserId, ctx.userId);
  if (!ownStudentId) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-sm text-zinc-500">
          Your account isn&apos;t linked to a student record yet. Ask your institution admin to set this up.
        </p>
      </div>
    );
  }

  const [summary, skillTypes, achievementCategories, achievementLevels, books] = await Promise.all([
    getStudent360(institutionId, authUserId, ownStudentId),
    listSkillTypes(institutionId, authUserId),
    listAchievementCategories(institutionId, authUserId),
    listAchievementLevels(institutionId, authUserId),
    listBooks(institutionId, authUserId),
  ]);

  const activitiesByType: Record<string, Awaited<ReturnType<typeof listSkillActivities>>> = {};
  for (const st of skillTypes) {
    activitiesByType[st.id] = await listSkillActivities(institutionId, authUserId, st.id);
  }
  const allActivities = Object.values(activitiesByType).flat();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">
        {summary.student?.full_name ?? "My profile"}
      </h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">
            {summary.attendanceSummary ? `${summary.attendanceSummary.present_percent}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">Attendance (this year)</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">
            {summary.latestResult ? `${summary.latestResult.percentage}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {summary.latestResult ? `Latest: ${summary.latestResult.examination_name}` : "No results yet"}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">
            {summary.latestConsolidatedScore ? summary.latestConsolidatedScore.score : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">Consolidated score</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">{summary.recentPortfolioEvents.length}</div>
          <div className="mt-1 text-sm text-zinc-500">Recent portfolio events</div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Recent portfolio timeline</h2>
        <ul className="space-y-2 text-sm">
          {summary.recentPortfolioEvents.map((e) => (
            <li key={e.id} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0">
              <span>{e.title}</span>
              <span className="text-zinc-400">{e.event_date}</span>
            </li>
          ))}
          {summary.recentPortfolioEvents.length === 0 ? <li className="text-zinc-400">Nothing yet.</li> : null}
        </ul>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Submit a skill activity</h2>
        <SubmitSkillForm activities={allActivities.map((a) => ({ id: a.id, name: a.name }))} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Submit an achievement</h2>
        <SubmitAchievementForm categories={achievementCategories} levels={achievementLevels} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Library catalogue</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="py-1.5">Title</th><th className="py-1.5">Author</th><th className="py-1.5">Available</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {books.map((b) => (
              <tr key={b.id}>
                <td className="py-1.5">{b.title}</td>
                <td className="py-1.5 text-zinc-500">{b.author_name ?? "—"}</td>
                <td className="py-1.5">{b.available_copies} / {b.total_copies}</td>
              </tr>
            ))}
            {books.length === 0 ? <tr><td colSpan={3} className="py-4 text-center text-zinc-400">No books yet.</td></tr> : null}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
