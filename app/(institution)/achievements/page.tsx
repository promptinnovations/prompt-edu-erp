import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStudents } from "../../../modules/students/service";
import { listAchievementCategories, listAchievementLevels, listAchievements } from "../../../modules/achievements/service";
import SubmitAchievementForm from "./SubmitAchievementForm";
import AchievementsTable from "./AchievementsTable";

export default async function AchievementsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "achievements");

  const [students, categories, levels, achievements] = await Promise.all([
    listStudents(institutionId, authUserId),
    listAchievementCategories(institutionId, authUserId),
    listAchievementLevels(institutionId, authUserId),
    listAchievements(institutionId, authUserId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Achievements</h1>

      {can(ctx.permissions, "achievements.submit") ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Submit an achievement</h2>
            {can(ctx.permissions, "settings.manage") ? (
              <Link href="/settings/grading#achievements" className="text-xs text-indigo-600 dark:text-indigo-400 underline whitespace-nowrap">
                Manage categories &amp; levels
              </Link>
            ) : null}
          </div>
          {categories.length === 0 || levels.length === 0 ? (
            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
              {can(ctx.permissions, "settings.manage")
                ? "No categories/levels configured yet — add them in Settings → Grading (link above) before submitting."
                : "No categories/levels configured yet — ask an admin to add them in Settings → Grading."}
            </p>
          ) : null}
          <SubmitAchievementForm
            students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
            categories={categories}
            levels={levels}
          />
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Achievements</h2>
        <AchievementsTable
          achievements={achievements}
          canVerify={can(ctx.permissions, "achievements.verify")}
          canApprove={can(ctx.permissions, "achievements.approve")}
        />
      </section>
    </div>
  );
}
