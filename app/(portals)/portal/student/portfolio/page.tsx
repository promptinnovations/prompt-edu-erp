import { listPortfolioTimeline } from "../../../../../modules/portfolio/service";
import { loadPortfolioDashboardData, ALL_PORTFOLIO_SECTIONS } from "../../../../../modules/portfolio/dashboard-service";
import { listSkillTypes, listSkillActivities } from "../../../../../modules/skills/service";
import { listAchievementCategories, listAchievementLevels } from "../../../../../modules/achievements/service";
import { listMentoringRecordsForPortal } from "../../../../../modules/mentoring/service";
import { requireOwnStudentId, NotLinkedNotice, Card } from "../_lib";
import StudentPortfolioDashboard from "../../../../components/portfolio/StudentPortfolioDashboard";
import SubmitSkillForm from "../SubmitSkillForm";
import SubmitAchievementForm from "../SubmitAchievementForm";

/**
 * Portfolio — §Portfolio-dashboard follow-up ("the student and parent
 * portal should be like this [rich dashboard reference] — do everything
 * needed for that"). The rich StudentPortfolioDashboard (header, stat
 * cards, Overview/Academic/Attendance/.../Teacher Remarks tabs) is the
 * same shared component the staff Student Portfolio tab and the parent
 * portal use — see modules/portfolio/dashboard-service.ts.
 *
 * Below the dashboard: the full activity timeline, mentoring notes (a
 * separate, slower-moving log from the dashboard's one-per-year Teacher's
 * Remark — see portfolio-summary/service.ts's own header comment), and
 * the two submission forms — none of these are part of the dashboard
 * component itself, which is pure display.
 */
export default async function StudentPortfolioPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const [dashboardData, timeline, skillTypes, achievementCategories, achievementLevels, mentoringNotes] = await Promise.all([
    loadPortfolioDashboardData(institutionId, authUserId, ownStudentId, ALL_PORTFOLIO_SECTIONS),
    listPortfolioTimeline(institutionId, authUserId, ownStudentId, 30),
    listSkillTypes(institutionId, authUserId),
    listAchievementCategories(institutionId, authUserId),
    listAchievementLevels(institutionId, authUserId),
    listMentoringRecordsForPortal(institutionId, authUserId, ownStudentId),
  ]);

  if (!dashboardData) return <NotLinkedNotice />;

  const activitiesByType: Record<string, Awaited<ReturnType<typeof listSkillActivities>>> = {};
  for (const st of skillTypes) {
    activitiesByType[st.id] = await listSkillActivities(institutionId, authUserId, st.id);
  }
  const allActivities = Object.values(activitiesByType).flat();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Portfolio</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Your full academic, attendance, behaviour and activity record.</p>
      </div>

      <StudentPortfolioDashboard data={dashboardData} />

      <Card title="Timeline">
        <ul className="space-y-2 text-sm">
          {timeline.map((e) => (
            <li key={e.id} className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 last:border-0">
              <span className="text-[var(--foreground)]">{e.title}</span>
              <span className="text-zinc-500">{e.event_date}</span>
            </li>
          ))}
          {timeline.length === 0 ? <li className="text-zinc-500">Nothing yet.</li> : null}
        </ul>
      </Card>

      <Card title="Mentoring">
        <ul className="space-y-2 text-sm">
          {mentoringNotes.map((m) => (
            <li key={m.id} className="border-b border-[var(--border-subtle)] pb-2 last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-[var(--foreground)]">{m.mentor_name}</span>
                <span className="text-zinc-500">{m.date}</span>
              </div>
              {m.goals ? <p className="mt-1 text-xs text-zinc-500">Goals: {m.goals}</p> : null}
              {m.action_plan ? <p className="mt-1 text-xs text-zinc-500">Action plan: {m.action_plan}</p> : null}
            </li>
          ))}
          {mentoringNotes.length === 0 ? <li className="text-zinc-500">Nothing yet.</li> : null}
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
