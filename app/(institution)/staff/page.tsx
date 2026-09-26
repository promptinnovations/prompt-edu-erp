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
import { listSectionHeadAssignments, listDistinctStages } from "../../../services/scope/section-head-scope-service";
import AddStaffForm from "./AddStaffForm";
import StaffLoginCell from "./StaffLoginCell";
import StaffAttendanceGrid from "./StaffAttendanceGrid";
import PortionPlanSection from "./PortionPlanSection";
import TeacherObservationForm from "./TeacherObservationForm";
import TeacherAssignmentForm from "./TeacherAssignmentForm";
import SectionHeadAssignmentForm from "./SectionHeadAssignmentForm";
import { todayIST } from "../../../services/datetime/ist";

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
  const today = todayIST();
  const effectiveDate = date || today;

  // §"attendance must not be seen to all staff ... only admin and
  // principal, for all institutions" — the whole staff-wide attendance
  // grid (everyone's status, editable) is for whoever can approve staff
  // attendance institution-wide, same "attendance.edit" gate /attendance's
  // own Staff leave section already uses. A regular staff member never
  // even fetches this data; they mark their own day on /attendance
  // instead (MyAttendanceSection there).
  const canManageStaffAttendance = can(ctx.permissions, "attendance.edit");

  // §"restrict staff detail visibility": "most of the data should be
  // visible for principal and management like attendance, portion plans
  // and its compliance, personal profile etc [but a plain teacher should
  // see NEITHER other staff members' personal/attendance/leave data]".
  // staff.edit is the existing "management-tier, sees/manages every staff
  // member" signal (held by institution_admin + the management role,
  // per database/scripts/seed.ts's roleGrants — a plain teacher/section_head/
  // support-staff role only ever holds staff.view). Reused here rather than
  // adding a new permission, matching the app's existing convention of one
  // "unrestricted" signal per module (marks.approve, attendance.edit, etc.).
  const canViewAllStaff = can(ctx.permissions, "staff.edit") || ctx.isSuperAdmin;

  const [staff, statuses, classes, sections, subjects, academicYear, portionPlans, observations, assignments, sectionHeadAssignments, distinctStages] = await Promise.all([
    listStaff(institutionId, authUserId),
    listAttendanceStatuses(institutionId, authUserId),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listSubjects(institutionId, authUserId),
    getCurrentAcademicYear(institutionId, authUserId),
    listPortionPlans(institutionId, authUserId),
    listTeacherObservations(institutionId, authUserId),
    listTeacherAssignments(institutionId, authUserId),
    listSectionHeadAssignments(institutionId, authUserId),
    listDistinctStages(institutionId, authUserId),
  ]);
  const attendanceGrid = canManageStaffAttendance
    ? await getStaffAttendanceGrid(institutionId, authUserId, effectiveDate)
    : [];

  // A plain staff member only ever sees their OWN directory row, portion
  // plans, and observations -- never a colleague's personal profile,
  // portion-plan compliance, or observation notes. Principal/management
  // (canViewAllStaff) see everyone's, unrestricted, exactly as before.
  const myStaffId = staff.find((s) => s.user_id === ctx.userId)?.id;
  const visibleStaff = canViewAllStaff ? staff : staff.filter((s) => s.user_id === ctx.userId);
  const visiblePortionPlans = canViewAllStaff ? portionPlans : portionPlans.filter((p) => p.teacher_id === myStaffId);
  const visibleObservations = canViewAllStaff ? observations : observations.filter((o) => o.teacher_id === myStaffId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Staff</h1>

      <section id="directory" className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Directory</h2>
        {can(ctx.permissions, "staff.create") ? (
          <div className="mb-4">
            <AddStaffForm roleOptions={["teacher", "management", "librarian", "staff"]} />
          </div>
        ) : null}
        {!canViewAllStaff ? (
          <p className="mb-3 text-xs text-zinc-500">
            Showing your own record only — colleagues&apos; personal/profile details are visible to the principal and management.
          </p>
        ) : null}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
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
          <tbody className="divide-y">
            {visibleStaff.map((s) => (
              <tr key={s.id}>
                <td className="py-1.5">{s.staff_code}</td>
                <td className="py-1.5">{s.full_name}</td>
                <td className="py-1.5 text-zinc-500">{s.email ?? "—"}</td>
                <td className="py-1.5 text-zinc-500">{s.designation ?? "—"}</td>
                <td className="py-1.5 text-zinc-500">{s.department ?? "—"}</td>
                <td className="py-1.5 capitalize">{s.employment_status.replace("_", " ")}</td>
                <td className="py-1.5">
                  <StaffLoginCell staffId={s.id} hasLogin={s.has_login} canManage={can(ctx.permissions, "staff.create")} />
                </td>
              </tr>
            ))}
            {visibleStaff.length === 0 ? (
              <tr><td colSpan={7} className="py-4 text-center text-zinc-500">No staff members yet.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>

      <section id="staff-attendance" className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Staff attendance</h2>
        {canManageStaffAttendance ? (
          <StaffAttendanceGrid
            rows={attendanceGrid}
            statuses={statuses}
            date={effectiveDate}
            canEnter={canManageStaffAttendance}
          />
        ) : (
          <p className="text-sm text-zinc-500">
            Mark your own attendance on the{" "}
            <Link href="/attendance#my-attendance" className="text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
              Attendance page
            </Link>{" "}
            — the principal (Institution Admin/Management) approves it there.
          </p>
        )}
      </section>

      <section id="staff-leave" className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Staff leave</h2>
        <p className="text-sm text-zinc-500">
          Staff now apply for their own leave, and the principal reviews it, on the{" "}
          <Link href="/attendance#my-leave" className="text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
            Attendance page
          </Link>.
        </p>
      </section>

      <section id="portion-plans" className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Portion plans (§D.12)</h2>
        {!canViewAllStaff ? (
          <p className="mb-3 text-xs text-zinc-500">Showing your own portion plans only.</p>
        ) : null}
        {academicYear ? (
          <PortionPlanSection
            plans={visiblePortionPlans}
            classes={classes}
            subjects={subjects}
            teachers={staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
            academicYearId={academicYear.id}
            canManage={can(ctx.permissions, "staff.portion.manage")}
          />
        ) : (
          <p className="text-sm text-zinc-500">No current academic year configured.</p>
        )}
      </section>

      <section id="teacher-observations" className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Teacher observations</h2>
        {!canViewAllStaff ? (
          <p className="mb-3 text-xs text-zinc-500">Showing observations recorded about you only.</p>
        ) : null}
        <TeacherObservationForm
          teachers={staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
          observations={visibleObservations}
          canManage={can(ctx.permissions, "staff.observation.manage")}
        />
      </section>

      <section id="teacher-assignments" className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Teacher assignments (§D.3)</h2>
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
          <p className="text-sm text-zinc-500">No current academic year configured.</p>
        )}
      </section>

      <section id="section-head-assignments" className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Section Head assignments</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Who oversees which section (KG/LP/UP/HS/HSS) — they also need the &quot;Section Head&quot; role itself,
          granted separately from Users &amp; Roles, for this to unlock the stage-wide attendance overview on the{" "}
          <Link href="/attendance#overview" className="text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
            Attendance page
          </Link>.
        </p>
        <SectionHeadAssignmentForm
          staff={staff.map((s) => ({ userId: s.user_id, full_name: s.full_name }))}
          stages={distinctStages}
          assignments={sectionHeadAssignments}
          canManage={can(ctx.permissions, "staff.assignment.manage")}
        />
      </section>
    </div>
  );
}
