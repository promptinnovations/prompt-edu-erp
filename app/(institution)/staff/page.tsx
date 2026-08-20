import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listClasses, listSections, listSubjects, getCurrentAcademicYear } from "../../../modules/academic/service";
import { listAttendanceStatuses } from "../../../modules/attendance/service";
import {
  listStaff, getStaffAttendanceGrid,
  listPortionPlans, listTeacherObservations, listTeacherAssignments,
} from "../../../modules/staff/service";
import AddStaffForm from "./AddStaffForm";
import StaffLoginCell from "./StaffLoginCell";
import StaffAttendanceGrid from "./StaffAttendanceGrid";
import PortionPlanSection from "./PortionPlanSection";
import TeacherObservationForm from "./TeacherObservationForm";
import TeacherAssignmentForm from "./TeacherAssignmentForm";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "staff");
  const today = new Date().toISOString().slice(0, 10);
  const effectiveDate = date || today;

  const [staff, statuses, classes, sections, subjects, academicYear, portionPlans, observations, assignments] = await Promise.all([
    listStaff(institutionId, authUserId),
    listAttendanceStatuses(institutionId, authUserId),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listSubjects(institutionId, authUserId),
    getCurrentAcademicYear(institutionId, authUserId),
    listPortionPlans(institutionId, authUserId),
    listTeacherObservations(institutionId, authUserId),
    listTeacherAssignments(institutionId, authUserId),
  ]);
  const attendanceGrid = await getStaffAttendanceGrid(institutionId, authUserId, effectiveDate);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Staff</h1>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Directory</h2>
        {can(ctx.permissions, "staff.create") ? (
          <div className="mb-4">
            <AddStaffForm roleOptions={["teacher", "management", "librarian", "staff"]} />
          </div>
        ) : null}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Code</th>
              <th className="py-1.5">Name</th>
              <th className="py-1.5">Email</th>
              <th className="py-1.5">Designation</th>
              <th className="py-1.5">Department</th>
              <th className="py-1.5">Status</th>
              <th className="py-1.5">Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="py-1.5">{s.staff_code}</td>
                <td className="py-1.5">{s.full_name}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{s.email ?? "—"}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{s.designation ?? "—"}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{s.department ?? "—"}</td>
                <td className="py-1.5 capitalize">{s.employment_status.replace("_", " ")}</td>
                <td className="py-1.5">
                  <StaffLoginCell staffId={s.id} hasLogin={s.has_login} canManage={can(ctx.permissions, "staff.create")} />
                </td>
              </tr>
            ))}
            {staff.length === 0 ? (
              <tr><td colSpan={7} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No staff members yet.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Staff attendance</h2>
        <StaffAttendanceGrid
          rows={attendanceGrid}
          statuses={statuses}
          date={effectiveDate}
          canEnter={can(ctx.permissions, "attendance.enter")}
        />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Staff leave</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Staff now apply for their own leave, and the principal reviews it, on the{" "}
          <Link href="/attendance#my-leave" className="text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
            Attendance page
          </Link>.
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Portion plans (§D.12)</h2>
        {academicYear ? (
          <PortionPlanSection
            plans={portionPlans}
            classes={classes}
            subjects={subjects}
            teachers={staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
            academicYearId={academicYear.id}
            canManage={can(ctx.permissions, "staff.portion.manage")}
          />
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No current academic year configured.</p>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Teacher observations</h2>
        <TeacherObservationForm
          teachers={staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
          observations={observations}
          canManage={can(ctx.permissions, "staff.observation.manage")}
        />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Teacher assignments (§D.3)</h2>
        {academicYear ? (
          <TeacherAssignmentForm
            teachers={staff.map((s) => ({ userId: s.user_id, full_name: s.full_name }))}
            classes={classes}
            sections={sections}
            subjects={subjects}
            academicYearId={academicYear.id}
            assignments={assignments}
            canManage={can(ctx.permissions, "staff.assignment.manage")}
          />
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No current academic year configured.</p>
        )}
      </section>
    </div>
  );
}
