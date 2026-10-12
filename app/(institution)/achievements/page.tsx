import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStudents } from "../../../modules/students/service";
import { listAchievementCategories, listAchievementLevels, listAchievements } from "../../../modules/achievements/service";
import SubmitAchievementForm from "./SubmitAchievementForm";
import AchievementsTable from "./AchievementsTable";
import { Panel } from "../../components/portal/viz/blocks";
import { CountDonut, CountBars } from "../../components/staff/insights";
import { seriesColor, STATUS_COLOR } from "../../components/portal/viz/palette";

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
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Achievements</h1>

      {/* §Staff-pages-visual — achievements at a glance (same rows as the table). */}
      {achievements.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="By status" color={seriesColor(1)}>
            <CountDonut rows={achievements} sub="entries" label={(a) => a.status.charAt(0).toUpperCase() + a.status.slice(1)}
              fixed={{ Approved: STATUS_COLOR.present, Pending: STATUS_COLOR.late, Rejected: STATUS_COLOR.absent }} />
          </Panel>
          <Panel title="By category" color={seriesColor(1)}>
            <CountBars rows={achievements.filter((a) => a.status === "approved")} label={(a) => a.category_name} color={seriesColor(1)} limit={7} />
          </Panel>
          <Panel title="By level" color={seriesColor(1)}>
            <CountBars rows={achievements.filter((a) => a.status === "approved")} label={(a) => a.level_name} color={seriesColor(3)} limit={7} />
          </Panel>
        </div>
      ) : null}

      {can(ctx.permissions, "achievements.submit") ? (
        <section className="rounded-card border bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--heading)]">Submit an achievement</h2>
            {can(ctx.permissions, "settings.manage") ? (
              <Link href="/settings/grading#achievements" className="text-xs text-indigo-600 underline whitespace-nowrap">
                Manage categories &amp; levels
              </Link>
            ) : null}
          </div>
          {categories.length === 0 || levels.length === 0 ? (
            <p className="mb-3 text-xs text-amber-600">
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

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Achievements</h2>
        <AchievementsTable
          achievements={achievements}
          canVerify={can(ctx.permissions, "achievements.verify")}
          canApprove={can(ctx.permissions, "achievements.approve")}
        />
      </section>
    </div>
  );
}
