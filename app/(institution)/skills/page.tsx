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
      <h1 className="text-2xl font-semibold text-zinc-900">Skills</h1>

      {can(ctx.permissions, "skills.submit") ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">Submit an activity</h2>
          <SubmitSkillForm
            students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
            skillTypes={skillTypes}
            activities={activities}
          />
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Submissions</h2>
        <SubmissionsTable
          submissions={submissions}
          canReview={can(ctx.permissions, "skills.review")}
          canApprove={can(ctx.permissions, "skills.approve")}
        />
      </section>
    </div>
  );
}
