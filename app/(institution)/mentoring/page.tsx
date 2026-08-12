import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStudents } from "../../../modules/students/service";
import { listMentoringRecords, getOwnStaffId } from "../../../modules/mentoring/service";
import MentoringSection from "./MentoringSection";

export default async function MentoringPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "mentoring");

  const canViewAll = can(ctx.permissions, "mentoring.view_all");
  const ownMentorStaffId = await getOwnStaffId(institutionId, authUserId, ctx.userId);

  const [students, records] = await Promise.all([
    listStudents(institutionId, authUserId),
    listMentoringRecords(institutionId, authUserId, { canViewAll, ownMentorStaffId }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Mentoring</h1>
      <p className="text-sm text-zinc-500">
        {canViewAll
          ? "You can see every mentoring record in the institution (mentoring.view_all)."
          : "You can only see mentoring records you authored yourself, per §75's confidentiality rule."}
      </p>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
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
