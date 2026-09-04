import { getStudent360 } from "../../../../../modules/portfolio/service";
import { listSkillTypes, listSkillActivities } from "../../../../../modules/skills/service";
import { listAchievementCategories, listAchievementLevels } from "../../../../../modules/achievements/service";
import {
  listRecentNegativeDisciplineFlags, listCharacterAssessments, listCharacterRatingLabels,
} from "../../../../../modules/discipline/service";
import { listMentoringRecordsForPortal } from "../../../../../modules/mentoring/service";
import { requireOwnStudentId, NotLinkedNotice, Card } from "../_lib";
import SubmitSkillForm from "../SubmitSkillForm";
import SubmitAchievementForm from "../SubmitAchievementForm";

/** Portfolio — full timeline plus the record-of-you sections (discipline,
 *  character, mentoring) and the two submission forms, all grouped together
 *  since they're all "about the student" rather than day-to-day activity. */
export default async function StudentPortfolioPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const [summary, skillTypes, achievementCategories, achievementLevels, disciplineFlags, characterAssessments, ratingLabels, mentoringNotes] =
    await Promise.all([
      getStudent360(institutionId, authUserId, ownStudentId, 30),
      listSkillTypes(institutionId, authUserId),
      listAchievementCategories(institutionId, authUserId),
      listAchievementLevels(institutionId, authUserId),
      // "This is your own record" (§357) — same rule as before: a student
      // sees their own discipline/character/mentoring without needing the
      // admin-facing view_all/mentoring.view_all permission.
      listRecentNegativeDisciplineFlags(institutionId, authUserId, ownStudentId, "1900-01-01", 20),
      listCharacterAssessments(institutionId, authUserId, ownStudentId),
      listCharacterRatingLabels(institutionId, authUserId),
      listMentoringRecordsForPortal(institutionId, authUserId, ownStudentId),
    ]);
  const ratingLabelByValue = new Map(ratingLabels.map((r) => [r.rating, r.label]));

  const activitiesByType: Record<string, Awaited<ReturnType<typeof listSkillActivities>>> = {};
  for (const st of skillTypes) {
    activitiesByType[st.id] = await listSkillActivities(institutionId, authUserId, st.id);
  }
  const allActivities = Object.values(activitiesByType).flat();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Portfolio</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Your full timeline, discipline &amp; character record, mentoring notes, and submissions.</p>
      </div>

      <Card title="Timeline">
        <ul className="space-y-2 text-sm">
          {summary.recentPortfolioEvents.map((e) => (
            <li key={e.id} className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 last:border-0">
              <span className="text-[var(--foreground)]">{e.title}</span>
              <span className="text-zinc-400">{e.event_date}</span>
            </li>
          ))}
          {summary.recentPortfolioEvents.length === 0 ? <li className="text-zinc-400">Nothing yet.</li> : null}
        </ul>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card title="Discipline">
          <ul className="space-y-2 text-sm">
            {disciplineFlags.map((d) => (
              <li key={d.id} className="border-b border-[var(--border-subtle)] pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--foreground)]">{d.category_name}{d.severity ? ` — ${d.severity}` : ""}</span>
                  <span className="text-zinc-400">{d.date}</span>
                </div>
                {d.action_taken ? <p className="mt-1 text-xs text-zinc-500">Action taken: {d.action_taken}</p> : null}
                {d.evidence_photo_file_id ? (
                  <a href={`/api/files/${d.evidence_photo_file_id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[var(--brand)] underline">
                    View photo
                  </a>
                ) : null}
              </li>
            ))}
            {disciplineFlags.length === 0 ? <li className="text-zinc-400">Nothing to flag.</li> : null}
          </ul>
        </Card>

        <Card title="Character assessments">
          <ul className="space-y-2 text-sm">
            {characterAssessments.map((c) => (
              <li key={c.id} className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 last:border-0">
                <span className="text-[var(--foreground)]">{c.attribute_name} — {c.period}</span>
                <span className="text-zinc-400">{ratingLabelByValue.get(c.rating) ?? c.rating} ({c.rating}/5)</span>
              </li>
            ))}
            {characterAssessments.length === 0 ? <li className="text-zinc-400">Nothing yet.</li> : null}
          </ul>
        </Card>
      </div>

      <Card title="Mentoring">
        <ul className="space-y-2 text-sm">
          {mentoringNotes.map((m) => (
            <li key={m.id} className="border-b border-[var(--border-subtle)] pb-2 last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-[var(--foreground)]">{m.mentor_name}</span>
                <span className="text-zinc-400">{m.date}</span>
              </div>
              {m.goals ? <p className="mt-1 text-xs text-zinc-500">Goals: {m.goals}</p> : null}
              {m.action_plan ? <p className="mt-1 text-xs text-zinc-500">Action plan: {m.action_plan}</p> : null}
            </li>
          ))}
          {mentoringNotes.length === 0 ? <li className="text-zinc-400">Nothing yet.</li> : null}
        </ul>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card title="Submit a skill activity">
          <SubmitSkillForm activities={allActivities.map((a) => ({ id: a.id, name: a.name }))} />
        </Card>
        <Card title="Submit an achievement">
          <SubmitAchievementForm categories={achievementCategories} levels={achievementLevels} />
        </Card>
      </div>
    </div>
  );
}
