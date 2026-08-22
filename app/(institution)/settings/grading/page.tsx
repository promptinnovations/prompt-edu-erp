import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { listGradeScales, getGradeBands, listExamTypes } from "../../../../modules/examination/service";
import { getInstitution } from "../../../../services/institution/institution-service";
import PassPctForm from "./PassPctForm";
import { listScoringRules } from "../../../../modules/scoring/service";
import { listAchievementCategories, listAchievementLevels } from "../../../../modules/achievements/service";
import { listSkillTypes, listSkillActivitiesForAdmin } from "../../../../modules/skills/service";
import GradeScaleSection from "./GradeScaleSection";
import ExamTypeSection from "./ExamTypeSection";
import ScoringRuleSection from "./ScoringRuleSection";
import AchievementConfigSection from "./AchievementConfigSection";
import SkillConfigSection from "./SkillConfigSection";

/**
 * §137 follow-up ("the same system should work with other institution as
 * well, data will be different, sometimes configurations also will be
 * different: marking scheme/grading/points for achievements and skills") —
 * one settings screen covering the four points-bearing configuration
 * families that used to be seed-script-only: grading (grade scales/bands),
 * scoring rules (points per activity), achievement categories/levels, and
 * skill types/activities. Every institution gets its own independent set
 * (RLS-scoped, same as everything else in this app) — nothing here is
 * shared across tenants.
 */
export default async function GradingSettingsPage() {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) redirect("/dashboard");
  const institutionId = ctx.institutionId;
  const authUserId = ctx.session.authUserId;

  // Full-page gate, same pattern /settings and /users use.
  if (!can(ctx.permissions, "settings.manage")) redirect("/dashboard");
  const canManage = true; // gated above — kept as an explicit prop for the section components' own conditional rendering

  const [gradeScales, scoringRules, achievementCategories, achievementLevels, skillTypes, skillActivities, examTypes, institution] = await Promise.all([
    listGradeScales(institutionId, authUserId),
    listScoringRules(institutionId, authUserId),
    listAchievementCategories(institutionId, authUserId),
    listAchievementLevels(institutionId, authUserId),
    listSkillTypes(institutionId, authUserId),
    listSkillActivitiesForAdmin(institutionId, authUserId),
    listExamTypes(institutionId, authUserId),
    getInstitution(institutionId, authUserId),
  ]);

  const bandsByScale: Record<string, Awaited<ReturnType<typeof getGradeBands>>> = {};
  await Promise.all(gradeScales.map(async (s) => {
    bandsByScale[s.id] = await getGradeBands(institutionId, authUserId, s.id);
  }));

  const activitiesByType: Record<string, typeof skillActivities> = {};
  for (const a of skillActivities) {
    (activitiesByType[a.skill_type_id] ??= []).push(a);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Grading &amp; points</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Define this institution&apos;s own grading scale, scoring rule points, achievement categories/levels, and
          skill types/activities — every institution on PROMPT EDU ERP configures these independently.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Exam types</h2>
        <ExamTypeSection examTypes={examTypes} canManage={canManage} />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Grading scales</h2>
        <GradeScaleSection gradeScales={gradeScales} bandsByScale={bandsByScale} canManage={canManage} />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pass percentage</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
          The tenant-wide default used to decide pass/fail — separate from grade bands above (a grade label is
          descriptive only). A subject can still override this via its own pass marks when added to an exam.
        </p>
        <PassPctForm passPct={institution?.passPct ?? 35} canManage={canManage} />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Scoring rules</h2>
        <ScoringRuleSection rules={scoringRules} canManage={canManage} />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Achievements</h2>
        <AchievementConfigSection categories={achievementCategories} levels={achievementLevels} canManage={canManage} />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Skills</h2>
        <SkillConfigSection skillTypes={skillTypes} activitiesByType={activitiesByType} canManage={canManage} />
      </section>
    </div>
  );
}
