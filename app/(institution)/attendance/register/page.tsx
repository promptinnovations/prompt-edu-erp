import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { listClasses, listSections } from "../../../../modules/academic/service";
import { listAttendanceStatuses, getMonthlyAttendanceRegister } from "../../../../modules/attendance/service";
import { getTeacherClassScope, scopeIncludesSection } from "../../../../services/scope/teacher-scope-service";
import { can } from "../../../../services/permissions/permission-service";
import RegisterPicker from "./RegisterPicker";
import PrintButton from "../../../components/PrintButton";

/** "Attendance > Monthly register" — a class/section's whole-month
 *  attendance in one printable grid (rows = students, columns = days),
 *  the standard "attendance register" format schools expect, distinct from
 *  the day-by-day "Take attendance" grid on the parent /attendance page.
 *  Scoped to the teacher's own assigned classes the same way /attendance
 *  itself is (§ teacher-class-scope follow-up). */
export default async function MonthlyRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; sectionId?: string; month?: string }>;
}) {
  const { classId = "", sectionId = "", month = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "attendance");

  const now = new Date();
  const effectiveMonth = /^\d{4}-\d{2}$/.test(month) ? month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearStr, monthStr] = effectiveMonth.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const hasUnrestrictedEdit = can(ctx.permissions, "attendance.edit");
  const teacherScope = hasUnrestrictedEdit ? null : await getTeacherClassScope(institutionId, authUserId, ctx.userId);
  const classInScope = !teacherScope || teacherScope.classIds.has(classId);
  const sectionInScope = !teacherScope || !sectionId || scopeIncludesSection(teacherScope, classId, sectionId);
  const effectiveClassId = classInScope ? classId : "";
  const effectiveSectionId = classInScope && sectionInScope ? sectionId : "";

  const [allClasses, allSections] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
  ]);
  const classes = teacherScope ? allClasses.filter((c) => teacherScope.classIds.has(c.id)) : allClasses;
  const sections = teacherScope
    ? allSections.filter((s) => scopeIncludesSection(teacherScope, s.class_id, s.id))
    : allSections;

  const [statuses, register] = await Promise.all([
    listAttendanceStatuses(institutionId, authUserId),
    effectiveClassId && effectiveSectionId
      ? getMonthlyAttendanceRegister(institutionId, authUserId, effectiveClassId, effectiveSectionId, year, monthNum)
      : Promise.resolve(null),
  ]);
  const statusByCode = new Map(statuses.map((s) => [s.code, s]));

  const cellByStudentDate = new Map<string, string>();
  if (register) {
    for (const e of register.entries) cellByStudentDate.set(`${e.student_id}:${e.date}`, e.status_code);
  }
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const className = classes.find((c) => c.id === effectiveClassId)?.name ?? "";
  const sectionName = sections.find((s) => s.id === effectiveSectionId)?.name ?? "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Monthly Attendance Register</h1>

      <section className="no-print rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <RegisterPicker classes={classes} sections={sections} classId={effectiveClassId} sectionId={effectiveSectionId} month={effectiveMonth} />
      </section>

      {register ? (
        <section className="print-area rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {className} — {sectionName} · {effectiveMonth}
              </h2>
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-400 dark:text-zinc-500">
                {statuses.map((s) => (
                  <span key={s.id}>{s.code.charAt(0).toUpperCase()} = {s.label}</span>
                ))}
              </p>
            </div>
            <PrintButton />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500 dark:text-zinc-400">
                  <th className="sticky left-0 bg-white dark:bg-zinc-900 py-1 pr-2">Student</th>
                  {days.map((d) => (
                    <th key={d} className="px-1 py-1 text-center font-normal">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {register.students.map((s) => (
                  <tr key={s.student_id}>
                    <td className="sticky left-0 bg-white dark:bg-zinc-900 whitespace-nowrap py-1 pr-2">
                      {s.student_name} <span className="text-zinc-400 dark:text-zinc-500">({s.admission_number})</span>
                    </td>
                    {days.map((d) => {
                      const date = `${effectiveMonth}-${String(d).padStart(2, "0")}`;
                      const code = cellByStudentDate.get(`${s.student_id}:${date}`);
                      const status = code ? statusByCode.get(code) : undefined;
                      return (
                        <td
                          key={d}
                          className={`px-1 py-1 text-center ${status && !status.counts_as_present ? "text-red-600 dark:text-red-400" : ""}`}
                        >
                          {code ? code.charAt(0).toUpperCase() : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {register.students.length === 0 ? (
                  <tr><td colSpan={daysInMonth + 1} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No students enrolled in this class/section.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          {teacherScope && classId && !classInScope ? "You're not assigned to that class." : "Select a class, section, and month to load the register."}
        </p>
      )}
    </div>
  );
}
