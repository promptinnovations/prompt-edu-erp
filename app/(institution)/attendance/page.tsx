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
import { getInstitutionAttendanceTrendMonthly } from "../../../modules/analytics/service";
import { listStaff, listStaffLeaveApplications } from "../../../modules/staff/service";
import { getOwnStaffId } from "../../../modules/mentoring/service";
import { getTeacherClassScope, scopeIncludesSection } from "../../../services/scope/teacher-scope-service";
import { resolveAttendanceVisibility } from "../../../services/scope/attendance-visibility-service";
import AttendanceTrendChart from "../../components/AttendanceTrendChart";
import MonthlyAttendanceTrendChart from "../../components/MonthlyAttendanceTrendChart";
import ClassSectionPicker from "./ClassSectionPicker";
import AttendanceGridForm from "./AttendanceGridForm";
import LeaveApplications from "./LeaveApplications";
import MyLeaveSection from "./MyLeaveSection";
import StaffLeaveReviewTable from "./StaffLeaveReviewTable";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; sectionId?: string; date?: string; trendView?: string }>;
}) {
  const { classId = "", sectionId = "", date = "", trendView = "daily" } = await searchParams;
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
  // (Separate from the Daily overview/trend VIEW scope below — this one
  // gates the "Take attendance" grid/picker specifically.)
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

  // §Attendance-follow-up-3 "Daily overview must be visible according to
  // roles — class for teacher, section wise for section heads, institution
  // wide - Principal, management" — resolved once by the shared helper (see
  // its own doc comment for why this must be the SAME logic the Dashboard
  // and Analysis hub widgets use).
  const { hasAccess: canSeeOverview, scope: overviewScope, label: overviewLabel } =
    await resolveAttendanceVisibility(institutionId, authUserId, ctx.userId, ctx.permissions);

  // §Page-4 follow-up: self-service leave needs the CALLER's own staffId
  // (never trusted from a form field) — resolved once up front since both
  // the "My leave" section's visibility and its history query depend on it.
  const ownStaffId = await getOwnStaffId(institutionId, authUserId, ctx.userId);

  // §Attendance-follow-up-3 "monthly also should be available" — last 6
  // full months, computed once here since both the fetch below and the
  // "Refresh analytics" hint in the chart need the same range.
  const monthAgo6 = new Date(); monthAgo6.setMonth(monthAgo6.getMonth() - 5);
  const fromMonth = monthAgo6.toISOString().slice(0, 7);
  const toMonth = today.slice(0, 7);

  const [allClasses, allSections, statuses, students, leaves, dailyOverview, myLeaves, attendanceTrend, monthlyTrend, staffList, staffLeaves] = await Promise.all([
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
    canSeeOverview ? getDailyAttendanceOverview(institutionId, authUserId, effectiveDate, overviewScope) : Promise.resolve(null),
    ownStaffId ? listLeaveApplicationsForApplicant(institutionId, authUserId, "staff", ownStaffId) : Promise.resolve([]),
    // §Page-4 "Attendance analytics — growth and fall diagram, recent days",
    // now role-scoped the same way as the Daily overview above it.
    canSeeOverview ? getInstitutionAttendanceTrend(institutionId, authUserId, 30, overviewScope) : Promise.resolve([]),
    canSeeOverview && trendView === "monthly"
      ? getInstitutionAttendanceTrendMonthly(institutionId, authUserId, fromMonth, toMonth, overviewScope)
      : Promise.resolve([]),
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

      {canSeeOverview ? (
        <section id="overview" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Attendance trend</h2>
            <div className="flex gap-1 text-xs">
              <a
                href={`?trendView=daily${effectiveClassId ? `&classId=${effectiveClassId}` : ""}${effectiveSectionId ? `&sectionId=${effectiveSectionId}` : ""}`}
                className={`rounded-lg px-2 py-1 ${trendView !== "monthly" ? "bg-[var(--brand)] text-white" : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}
              >
                Daily (30 days)
              </a>
              <a
                href={`?trendView=monthly${effectiveClassId ? `&classId=${effectiveClassId}` : ""}${effectiveSectionId ? `&sectionId=${effectiveSectionId}` : ""}`}
                className={`rounded-lg px-2 py-1 ${trendView === "monthly" ? "bg-[var(--brand)] text-white" : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}
              >
                Monthly
              </a>
            </div>
          </div>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">{overviewLabel}</p>
          {trendView === "monthly" ? (
            <MonthlyAttendanceTrendChart points={monthlyTrend} />
          ) : (
            <AttendanceTrendChart points={attendanceTrend} />
          )}
        </section>
      ) : null}

      {dailyOverview ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Daily overview — {effectiveDate}
          </h2>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            {overviewLabel} — every class/division&apos;s attendance status for the day.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1.5">Class</th>
                  <th className="py-1.5">Division</th>
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
                  <tr><td colSpan={7} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No classes/divisions yet.</td></tr>
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
              : "Select a class and division to load the attendance grid."}
          </p>
        )}
      </section>

      <section id="leave" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Student Leave Applications — {effectiveDate}
        </h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
          {effectiveClassId ? "This class's" : "Institution-wide"} leaves applied by students/parents from their
          own portal — class teacher review below is the class teacher&apos;s sign-off. Nothing can be entered here.
        </p>
        <LeaveApplications leaves={leaveRows} />
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
