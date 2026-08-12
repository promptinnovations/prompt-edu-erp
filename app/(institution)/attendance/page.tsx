import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { listStudents } from "../../../modules/students/service";
import {
  listAttendanceStatuses, getAttendanceGrid, listLeaveApplications,
} from "../../../modules/attendance/service";
import ClassSectionPicker from "./ClassSectionPicker";
import AttendanceGridForm from "./AttendanceGridForm";
import LeaveApplications from "./LeaveApplications";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; sectionId?: string; date?: string }>;
}) {
  const { classId = "", sectionId = "", date = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "attendance");
  const today = new Date().toISOString().slice(0, 10);
  const effectiveDate = date || today;

  const [classes, sections, statuses, students, leaves] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listAttendanceStatuses(institutionId, authUserId),
    listStudents(institutionId, authUserId),
    listLeaveApplications(institutionId, authUserId),
  ]);

  const grid = classId && sectionId
    ? await getAttendanceGrid(institutionId, authUserId, classId, sectionId, effectiveDate)
    : [];

  const studentNameById = new Map(students.map((s) => [s.id, s.full_name]));
  const leaveRows = leaves
    .filter((l) => l.applicant_type === "student")
    .map((l) => ({
      id: l.id,
      applicant_type: l.applicant_type,
      applicant_id: l.applicant_id,
      applicant_name: studentNameById.get(l.applicant_id) ?? "—",
      start_date: l.start_date,
      end_date: l.end_date,
      reason: l.reason,
      status: l.status,
    }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Attendance</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Take attendance</h2>
        <ClassSectionPicker
          classes={classes}
          sections={sections}
          classId={classId}
          sectionId={sectionId}
          date={effectiveDate}
        />
        {classId && sectionId ? (
          <div className="mt-4">
            <AttendanceGridForm
              students={grid}
              statuses={statuses}
              classId={classId}
              sectionId={sectionId}
              date={effectiveDate}
              canEnter={can(ctx.permissions, "attendance.enter")}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">Select a class and section to load the attendance grid.</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Leave applications</h2>
        <LeaveApplications
          leaves={leaveRows}
          students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
          canApply={can(ctx.permissions, "attendance.enter")}
          canReview={can(ctx.permissions, "attendance.edit")}
        />
      </section>
    </div>
  );
}
