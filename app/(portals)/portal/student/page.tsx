import { requireRequestContext } from "../../../../services/request-context";
import { getOwnStudentId } from "../../../../modules/portal/service";
import { getStudent360 } from "../../../../modules/portfolio/service";
import { listSkillTypes, listSkillActivities } from "../../../../modules/skills/service";
import { listAchievementCategories, listAchievementLevels } from "../../../../modules/achievements/service";
import { listBooks, listReadingRecords, listApprovedReviews, listMyHolds } from "../../../../modules/library/service";
import {
  listRecentNegativeDisciplineFlags, listCharacterAssessments, listCharacterRatingLabels,
} from "../../../../modules/discipline/service";
import { listMentoringRecordsForPortal } from "../../../../modules/mentoring/service";
import SubmitSkillForm from "./SubmitSkillForm";
import SubmitAchievementForm from "./SubmitAchievementForm";
import MyPendingReviews from "./MyPendingReviews";
import ReviewCorner from "./ReviewCorner";
import PreBookSection from "./PreBookSection";

export default async function StudentPortalPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const ownStudentId = await getOwnStudentId(institutionId, authUserId, ctx.userId);
  if (!ownStudentId) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Your account isn&apos;t linked to a student record yet. Ask your institution admin to set this up.
        </p>
      </div>
    );
  }

  const [summary, skillTypes, achievementCategories, achievementLevels, books, pendingReviews, approvedReviews, myHolds, disciplineFlags, characterAssessments, ratingLabels, mentoringNotes] = await Promise.all([
    getStudent360(institutionId, authUserId, ownStudentId),
    listSkillTypes(institutionId, authUserId),
    listAchievementCategories(institutionId, authUserId),
    listAchievementLevels(institutionId, authUserId),
    listBooks(institutionId, authUserId),
    listReadingRecords(institutionId, authUserId, "pending", undefined, ownStudentId),
    listApprovedReviews(institutionId, authUserId, null, ownStudentId),
    listMyHolds(institutionId, authUserId, ownStudentId),
    // "This is your own record" — a student sees their own discipline/
    // character/mentoring the same way they already see their own
    // achievements/skills, no admin-facing view_all/mentoring.view_all
    // permission needed (mirrors the parent portal's per-child rule, §357).
    listRecentNegativeDisciplineFlags(institutionId, authUserId, ownStudentId, "1900-01-01", 20),
    listCharacterAssessments(institutionId, authUserId, ownStudentId),
    listCharacterRatingLabels(institutionId, authUserId),
    listMentoringRecordsForPortal(institutionId, authUserId, ownStudentId),
  ]);
  const ratingLabelByValue = new Map(ratingLabels.map((r) => [r.rating, r.label]));
  const holdableBooks = books.filter((b) => b.available_copies === 0);

  const activitiesByType: Record<string, Awaited<ReturnType<typeof listSkillActivities>>> = {};
  for (const st of skillTypes) {
    activitiesByType[st.id] = await listSkillActivities(institutionId, authUserId, st.id);
  }
  const allActivities = Object.values(activitiesByType).flat();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {summary.student?.full_name ?? "My profile"}
      </h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {summary.attendanceSummary ? `${summary.attendanceSummary.present_percent}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Attendance (this year)</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {summary.latestResult ? `${summary.latestResult.percentage}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {summary.latestResult ? `Latest: ${summary.latestResult.examination_name}` : "No results yet"}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {summary.latestConsolidatedScore ? summary.latestConsolidatedScore.score : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Consolidated score</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{summary.recentPortfolioEvents.length}</div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Recent portfolio events</div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Recent portfolio timeline</h2>
        <ul className="space-y-2 text-sm">
          {summary.recentPortfolioEvents.map((e) => (
            <li key={e.id} className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
              <span>{e.title}</span>
              <span className="text-zinc-400 dark:text-zinc-500">{e.event_date}</span>
            </li>
          ))}
          {summary.recentPortfolioEvents.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing yet.</li> : null}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Discipline</h2>
        <ul className="space-y-2 text-sm">
          {disciplineFlags.map((d) => (
            <li key={d.id} className="border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
              <div className="flex items-center justify-between">
                <span>{d.category_name}{d.severity ? ` — ${d.severity}` : ""}</span>
                <span className="text-zinc-400 dark:text-zinc-500">{d.date}</span>
              </div>
              {d.action_taken ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Action taken: {d.action_taken}</p> : null}
              {d.evidence_photo_file_id ? (
                <a href={`/api/files/${d.evidence_photo_file_id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-zinc-500 dark:text-zinc-400 underline">View photo</a>
              ) : null}
            </li>
          ))}
          {disciplineFlags.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing to flag.</li> : null}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Character assessments</h2>
        <ul className="space-y-2 text-sm">
          {characterAssessments.map((c) => (
            <li key={c.id} className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
              <span>{c.attribute_name} — {c.period}</span>
              <span className="text-zinc-400 dark:text-zinc-500">{ratingLabelByValue.get(c.rating) ?? c.rating} ({c.rating}/5)</span>
            </li>
          ))}
          {characterAssessments.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing yet.</li> : null}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Mentoring</h2>
        <ul className="space-y-2 text-sm">
          {mentoringNotes.map((m) => (
            <li key={m.id} className="border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
              <div className="flex items-center justify-between">
                <span>{m.mentor_name}</span>
                <span className="text-zinc-400 dark:text-zinc-500">{m.date}</span>
              </div>
              {m.goals ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Goals: {m.goals}</p> : null}
              {m.action_plan ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Action plan: {m.action_plan}</p> : null}
            </li>
          ))}
          {mentoringNotes.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing yet.</li> : null}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Submit a skill activity</h2>
        <SubmitSkillForm activities={allActivities.map((a) => ({ id: a.id, name: a.name }))} />
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Submit an achievement</h2>
        <SubmitAchievementForm categories={achievementCategories} levels={achievementLevels} />
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Library catalogue</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr><th className="py-1.5">Title</th><th className="py-1.5">Author</th><th className="py-1.5">Available</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {books.map((b) => (
              <tr key={b.id}>
                <td className="py-1.5">{b.title}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{b.author_name ?? "—"}</td>
                <td className="py-1.5">{b.available_copies} / {b.total_copies}</td>
              </tr>
            ))}
            {books.length === 0 ? <tr><td colSpan={3} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No books yet.</td></tr> : null}
          </tbody>
        </table>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Post a review</h2>
        <MyPendingReviews reviews={pendingReviews.map((r) => ({ id: r.id, book_title: r.book_title }))} />
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Review Corner</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">See what others thought before you pick your next book.</p>
        <ReviewCorner reviews={approvedReviews} />
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pre-book</h2>
        <PreBookSection
          holdableBooks={holdableBooks.map((b) => ({ id: b.id, title: b.title, available_copies: b.available_copies }))}
          myHolds={myHolds.map((h) => ({ id: h.id, book_title: h.book_title, status: h.status }))}
        />
      </div>
    </div>
  );
}
