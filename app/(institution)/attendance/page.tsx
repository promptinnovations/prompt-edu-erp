import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { listStudents } from "../../../modules/students/service";
import {
  listAttendanceStatuses, getAttendanceGrid, listLeaveApplications, listLeaveApplicationsForClassOnDate,
  listLeaveApplicationsForApplicant, isClassTeacherOfStudent, getDailyAttendanceOverview,
  getInstitutionAttendanceTrend,
} from "../../../modules/attendance/service";
import { listStaff, listStaffLeaveApplications } from "../../../modules/staff/service";
import { getOwnStaffId } from "../../../modules/mentoring/service";
import { getTeacherClassScope, scopeIncludesSection } from "../../../services/scope/teacher-scope-service";
import AttendanceTrendChart from "../../components/AttendanceTrendChart";
import ClassSectionPicker from "./ClassSectionPicker";
import AttendanceGridForm from "./AttendanceGridForm";
import LeaveApplications from "./LeaveApplications";
import MyLeaveSection from "./MyLeaveSection";
import StaffLeaveReviewTable from "./StaffLeaveReviewTable";

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

  const hasUnrestrictedEdit = can(ctx.permissions, "attendance.edit");
  const hasScopedReview = can(ctx.permissions, "attendance.leave.review_own_class");

  // "Teachers can give access only to their respective classes" follow-up —
  // attendance.enter without attendance.edit means scoped to teacher_assignments.
  const teacherScope = hasUnrestrictedEdit
    ? null
    : await getTeacherClassScope(institutionId, authUserId, ctx.userId);
  // A class/section chosen (or URL-crafted) outside the caller's scope is
  // treated as if nothing were selected — this is the actual access-control
  // enforcement, not just hiding options in the picker below.
  const classInScope = !teacherScope || teacherScope.classIds.has(classId);
  const sectionInScope = !teacherScope || !sectionId || scopeIncludesSection(teacherScope, classId, sectionId);
  const effectiveClassId = classInScope ? classId : "";
  const effectiveSectionId = classInScope && sectionInScope ? sectionId : "";

  // §Page-4 follow-up: self-service leave needs the CALLER's own staffId
  // (never trusted from a form field) — resolved once up front since both
  // the "My leave" section's visibility and its history query depend on it.
  const ownStaffId = await getOwnStaffId(institutionId, authUserId, ctx.userId);

  const [allClasses, allSections, statuses, students, leaves, dailyOverview, myLeaves, attendanceTrend, staffList, staffLeaves] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listAttendanceStatuses(institutionId, authUserId),
    listStudents(institutionId, authUserId),
    // §D.6 follow-up "each class should show applied leaves for that day" —
    // scoped to the selected class + date once one is chosen; otherwise
    // falls back to the institution-wide list (the previous behavior),
    // filtered to still-pending/decided-today so it isn't the entire
    // history.
    effectiveClassId ? listLeaveApplicationsForClassOnDate(institutionId, authUserId, effectiveClassId, effectiveDate) : listLeaveApplications(institutionId, authUserId),
    hasUnrestrictedEdit ? getDailyAttendanceOverview(institutionId, authUserId, effectiveDate) : Promise.resolve(null),
    ownStaffId ? listLeaveApplicationsForApplicant(institutionId, authUserId, "staff", ownStaffId) : Promise.resolve([]),
    // §Page-4 "Attendance analytics — growth and fall diagram, recent days".
    getInstitutionAttendanceTrend(institutionId, authUserId, 14),
    // Staff leave review (§Page-4 "principal for staff...will approve") is
    // unrestricted-reviewer-only — no point fetching the staff directory or
    // their leave history for a class teacher who could never act on it.
    hasUnrestrictedEdit ? listStaff(institutionId, authUserId) : Promise.resolve([]),
    hasUnrestrictedEdit ? listStaffLeaveApplications(institutionId, authUserId) : Promise.resolve([]),
  ]);
  const classes = teacherScope ? allClasses.filter((c) => teacherScope.classIds.has(c.id)) : allClasses;
  const sections = teacherScope
    ? allSections.filter((s) => scopeIncludesSection(teacherScope, s.class_id, s.id))
    : allSections;

  const grid = effectiveClassId && effectiveSectionId
    ? await getAttendanceGrid(institutionId, authUserId, effectiveClassId, effectiveSectionId, effectiveDate)
    : [];

  const studentNameById = new Map(students.map((s) => [s.id, s.full_name]));
  const staffNameById = new Map(staffList.map((s) => [s.id, s.full_name]));
  const studentLeaveRows = leaves.filter((l) => l.applicant_type === "student");
  const staffLeaveRows = staffLeaves.map((l) => ({
    id: l.id,
    applicant_name: staffNameById.get(l.applicant_id) ?? "—",
    start_date: l.start_date,
    end_date: l.end_date,
    reason: l.reason,
    status: l.status,
  }));

  // §D.6 follow-up "class teacher can sanction it" — per-row, not blanket:
  // unrestricted for attendance.edit holders, otherwise only for leaves
  // whose applicant is in the caller's own assigned class.
  const leaveRows = await Promise.all(
    studentLeaveRows.map(async (l) => ({
      id: l.id,
      applicant_type: l.applicant_type,
      applicant_id: l.applicant_id,
      applicant_name: studentNameById.get(l.applicant_id) ?? "—",
      start_date: l.start_date,
      end_date: l.end_date,
      reason: l.reason,
      status: l.status,
      canReview: hasUnrestrictedEdit
        ? true
        : hasScopedReview
          ? await isClassTeacherOfStudent(institutionId, authUserId, ctx.userId, l.applicant_id)
          : false,
    }))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Attendance</h1>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Attendance trend</h2>
        <AttendanceTrendChart points={attendanceTrend} />
      </section>

      {dailyOverview ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Daily overview — {effectiveDate}
          </h2>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            Every class/section&apos;s attendance status for the day, visible to Institution Admin / Principal.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1.5">Class</th>
                  <th className="py-1.5">Section</th>
                  <th className="py-1.5">Enrolled</th>
                  <th className="py-1.5">Marked</th>
                  <th className="py-1.5">Present</th>
                  <th className="py-1.5">Absent</th>
                  <th className="py-1.5">Late</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {dailyOverview.classes.map((c) => (
                  <tr key={c.sectionId}>
                    <td className="py-1.5">{c.className}</td>
                    <td className="py-1.5">{c.sectionName}</td>
                    <td className="py-1.5">{c.enrolled}</td>
                    <td className="py-1.5">{c.marked}{c.marked < c.enrolled ? <span className="ml-1 text-amber-600 dark:text-amber-400">(not fully taken)</span> : null}</td>
                    <td className="py-1.5">{c.present}</td>
                    <td className="py-1.5">{c.absent}</td>
                    <td className="py-1.5">{c.late}</td>
                  </tr>
                ))}
                {dailyOverview.classes.length === 0 ? (
                  <tr><td colSpan={7} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No classes/sections yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {dailyOverview.absentees.length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Absentee list ({dailyOverview.absentees.length})
              </h3>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                {dailyOverview.absentees.map((a) => (
                  <li key={a.studentId}>{a.studentName} <span className="text-zinc-400 dark:text-zinc-500">({a.className}-{a.sectionName})</span></li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section id="take" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Take attendance</h2>
        <ClassSectionPicker
          classes={classes}
          sections={sections}
          classId={effectiveClassId}
          sectionId={effectiveSectionId}
          date={effectiveDate}
        />
        {effectiveClassId && effectiveSectionId ? (
          <div className="mt-4">
            <AttendanceGridForm
              students={grid}
              statuses={statuses}
              classId={effectiveClassId}
              sectionId={effectiveSectionId}
              date={effectiveDate}
              canEnter={can(ctx.permissions, "attendance.enter")}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-500">
            {teacherScope && classId && !classInScope
              ? "You're not assigned to that class."
              : "Select a class and section to load the attendance grid."}
          </p>
        )}
      </section>

      <section id="leave" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Leave applications{effectiveClassId ? ` — this class, ${effectiveDate}` : ""}
        </h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
          Class teacher review — approving here is the class teacher&apos;s sign-off.
        </p>
        <LeaveApplications
          leaves={leaveRows}
          students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
          canApply={can(ctx.permissions, "attendance.enter")}
        />
      </section>

      {ownStaffId ? (
        <section id="my-leave" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">My leave</h2>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            Apply for your own leave — the principal (Institution Admin/Management) reviews it below.
          </p>
          <MyLeaveSection leaves={myLeaves} />
        </section>
      ) : null}

      {hasUnrestrictedEdit ? (
        <section id="staff-leave" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Staff leave — principal review</h2>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            Every staff member&apos;s own leave application, applied from their own &quot;My leave&quot; section above.
          </p>
          <StaffLeaveReviewTable leaves={staffLeaveRows} />
        </section>
      ) : null}
    </div>
  );
}
