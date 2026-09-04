import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStudents } from "../../../modules/students/service";
import { listSkillTypes, listSkillActivities, listSkillSubmissions } from "../../../modules/skills/service";
import SubmitSkillForm from "./SubmitSkillForm";
import SubmissionsTable from "./SubmissionsTable";

export default async function SkillsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "skills");

  const [students, skillTypes, activities, submissions] = await Promise.all([
    listStudents(institutionId, authUserId),
    listSkillTypes(institutionId, authUserId),
    listSkillActivities(institutionId, authUserId),
    listSkillSubmissions(institutionId, authUserId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Skills</h1>

      {can(ctx.permissions, "skills.submit") ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Submit an activity</h2>
            {can(ctx.permissions, "settings.manage") ? (
              <Link href="/settings/grading#skills" className="text-xs text-indigo-600 dark:text-indigo-400 underline whitespace-nowrap">
                Manage skill types &amp; activities
              </Link>
            ) : null}
          </div>
          {skillTypes.length === 0 || activities.length === 0 ? (
            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
              {can(ctx.permissions, "settings.manage")
                ? "No skill types/activities configured yet — add them in Settings → Grading (link above) before submitting."
                : "No skill types/activities configured yet — ask an admin to add them in Settings → Grading."}
            </p>
          ) : null}
          <SubmitSkillForm
            students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
            skillTypes={skillTypes}
            activities={activities}
          />
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Submissions</h2>
        <SubmissionsTable
          submissions={submissions}
          canReview={can(ctx.permissions, "skills.review")}
          canApprove={can(ctx.permissions, "skills.approve")}
        />
      </section>
    </div>
  );
}
