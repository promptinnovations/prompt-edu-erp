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
import { Panel } from "../../components/portal/viz/blocks";
import { DonutChart, HBars } from "../../components/portal/viz/charts";
import { seriesColor, STATUS_COLOR, CHART_SERIES } from "../../components/portal/viz/palette";

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

      {/* §Staff-pages-visual — staff at a glance, from the same lists this
          page already loads (only for those who see every staff member). */}
      {canViewAllStaff && staff.length > 0 ? (() => {
        const active = staff.filter((s) => s.employment_status === "active");
        const count = (key: (s: (typeof staff)[number]) => string | null) => {
          const m = new Map<string, number>();
          for (const s of active) { const k = key(s) || "Not set"; m.set(k, (m.get(k) ?? 0) + 1); }
          return [...m.entries()].sort((a, b) => b[1] - a[1]);
        };
        const departments = count((s) => s.department);
        const designations = count((s) => s.designation);
        const presentIds = new Set(statuses.filter((st) => st.counts_as_present).map((st) => st.id));
        const marked = attendanceGrid.filter((r) => r.status_id);
        const present = marked.filter((r) => r.status_id && presentIds.has(r.status_id)).length;
        return (
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="By department" subtitle={`${active.length} active staff`} color={seriesColor(1)}>
              <DonutChart size={130} stroke={20} center={active.length} sub="staff"
                segments={departments.slice(0, 7).map(([label, value], i): { label: string; value: number; color: string } => ({ label, value, color: CHART_SERIES[i] }))
                  .concat(departments.length > 7 ? [{ label: "Other", value: departments.slice(7).reduce((a, [, n]) => a + n, 0), color: "#79839a" }] : [])} />
            </Panel>
            <Panel title="By designation" color={seriesColor(1)}>
              <div className="max-h-64 overflow-y-auto pr-1">
                <HBars unit="" max={Math.max(1, ...designations.map(([, n]) => n))} rows={designations.map(([label, n]) => ({ label, value: n, color: seriesColor(1), suffix: "" }))} />
              </div>
            </Panel>
            {canManageStaffAttendance ? (
              <Panel title="Attendance" subtitle={effectiveDate} color={seriesColor(2)}>
                {marked.length === 0 ? (
                  <p className="py-6 text-center text-sm text-zinc-500">Not marked yet for this date.</p>
                ) : (
                  <DonutChart size={130} stroke={20} center={`${Math.round((present / marked.length) * 100)}%`} sub="present"
                    segments={[
                      { label: "Present", value: present, color: STATUS_COLOR.present },
                      { label: "Absent / leave", value: marked.length - present, color: STATUS_COLOR.absent },
                      ...(attendanceGrid.length - marked.length > 0 ? [{ label: "Not marked", value: attendanceGrid.length - marked.length, color: STATUS_COLOR.none }] : []),
                    ]} />
                )}
              </Panel>
            ) : null}
          </div>
        );
      })() : null}

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
