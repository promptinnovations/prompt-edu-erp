import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStudents } from "../../../modules/students/service";
import {
  listMentoringRecords, getOwnStaffId, listAssignedStudentsForMentor,
  listMentorAssignments,
} from "../../../modules/mentoring/service";
import { listStaff } from "../../../modules/staff/service";
import { listClasses } from "../../../modules/academic/service";
import MentoringSection from "./MentoringSection";
import MentorAssignmentSection from "./MentorAssignmentSection";

export default async function MentoringPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "mentoring");

  const canViewAll = can(ctx.permissions, "mentoring.view_all");
  const canAssign = can(ctx.permissions, "mentoring.assign");
  const ownMentorStaffId = await getOwnStaffId(institutionId, authUserId, ctx.userId);

  const [allStudents, records] = await Promise.all([
    listStudents(institutionId, authUserId),
    listMentoringRecords(institutionId, authUserId, { canViewAll, ownMentorStaffId }),
  ]);
  // §355: the "create a mentoring record for…" picker is now scoped to
  // exactly the students an admin has assigned this mentor (directly or via
  // class) — createMentoringRecord() enforces the same rule server-side, so
  // this is just keeping the UI from offering a choice that would be
  // rejected.
  let students: Array<{ id: string; full_name: string }> = [];
  if (ownMentorStaffId) {
    students = await listAssignedStudentsForMentor(institutionId, authUserId, ownMentorStaffId);
  }

  const mentorAssignmentData = canAssign
    ? await Promise.all([
        listStaff(institutionId, authUserId),
        listClasses(institutionId, authUserId),
        listMentorAssignments(institutionId, authUserId),
      ])
    : null;

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

      {canAssign && mentorAssignmentData ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Assign mentors</h2>
          <MentorAssignmentSection
            mentors={mentorAssignmentData[0].map((s) => ({ id: s.id, full_name: s.full_name }))}
            students={allStudents.map((s) => ({ id: s.id, full_name: s.full_name }))}
            classes={mentorAssignmentData[1].map((c) => ({ id: c.id, name: c.name }))}
            assignments={mentorAssignmentData[2]}
          />
        </section>
      ) : null}
    </div>
  );
}
