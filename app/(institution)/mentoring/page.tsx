import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStudents, listStudentsForAdmin } from "../../../modules/students/service";
import { listMentoringRecords, getOwnStaffId } from "../../../modules/mentoring/service";
import { getTeacherClassScope } from "../../../services/scope/teacher-scope-service";
import MentoringSection from "./MentoringSection";

export default async function MentoringPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "mentoring");

  const canViewAll = can(ctx.permissions, "mentoring.view_all");
  const ownMentorStaffId = await getOwnStaffId(institutionId, authUserId, ctx.userId);

  const [allStudents, records] = await Promise.all([
    listStudents(institutionId, authUserId),
    listMentoringRecords(institutionId, authUserId, { canViewAll, ownMentorStaffId }),
  ]);
  // "Teachers can give access only to their respective classes" follow-up —
  // the "create a mentoring record for…" student picker shouldn't offer
  // every student institution-wide to someone who isn't management.
  let students = allStudents;
  if (!canViewAll) {
    const scope = await getTeacherClassScope(institutionId, authUserId, ctx.userId);
    const scoped = await listStudentsForAdmin(institutionId, authUserId, { classIds: Array.from(scope.classIds) });
    const scopedIds = new Set(scoped.map((s) => s.id));
    students = allStudents.filter((s) => scopedIds.has(s.id));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Mentoring</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {canViewAll
          ? "You can see every mentoring record in the institution (mentoring.view_all)."
          : "You can only see mentoring records you authored yourself, per §75's confidentiality rule."}
      </p>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <MentoringSection
          students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
          records={records}
          canCreate={can(ctx.permissions, "mentoring.create")}
          ownMentorStaffId={ownMentorStaffId}
        />
      </section>
    </div>
  );
}
