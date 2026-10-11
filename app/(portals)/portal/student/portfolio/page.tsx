import { listSkillActivities } from "../../../../../modules/skills/service";
import { listAchievementCategories, listAchievementLevels } from "../../../../../modules/achievements/service";
import { getActivityInsights } from "../../../../../modules/portal/student-insights";
import { requireOwnStudentId, NotLinkedNotice, Card } from "../_lib";
import ActivitiesView from "../../../../components/portal/student/ActivitiesView";
import SubmitSkillForm from "../SubmitSkillForm";
import SubmitAchievementForm from "../SubmitAchievementForm";

/** Achievements & activities (route kept at /portfolio so old links still
 *  work) — §Student-portal-visual-redesign. Badge collection, awards by
 *  area and level, achievement timeline, certificate gallery, co-curricular
 *  submissions with their approval status, and the two submit forms.
 *
 *  The old page rendered the full StudentPortfolioDashboard (academics,
 *  attendance, behaviour, remarks…) plus a timeline and mentoring notes —
 *  all of which now have their own page in the sidebar, so repeating them
 *  here is gone. Visuals: app/components/portal/student/ActivitiesView.tsx. */
export default async function StudentPortfolioPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const [data, activities, achievementCategories, achievementLevels] = await Promise.all([
    getActivityInsights(institutionId, authUserId, ownStudentId),
    listSkillActivities(institutionId, authUserId),
    listAchievementCategories(institutionId, authUserId),
    listAchievementLevels(institutionId, authUserId),
  ]);

  return (
    <ActivitiesView
      data={data}
      forms={
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Submit an achievement" subtitle="A prize or participation — your teacher approves it before it joins your badges.">
            <SubmitAchievementForm categories={achievementCategories} levels={achievementLevels} />
          </Card>
          <Card title="Submit an activity" subtitle="Clubs, service and other co-curricular work.">
            <SubmitSkillForm activities={activities.map((a) => ({ id: a.id, name: a.name }))} />
          </Card>
        </div>
      }
    />
  );
}
