import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { getInstitution, institutionReportName } from "../../../../services/institution/institution-service";
import { listClasses, listSections } from "../../../../modules/academic/service";
import { listAttendanceStatuses, getMonthlyAttendanceRegister } from "../../../../modules/attendance/service";
import { listCalendarEvents } from "../../../../modules/calendar/service";
import { getTeacherClassScope, scopeIncludesSection } from "../../../../services/scope/teacher-scope-service";
import { can } from "../../../../services/permissions/permission-service";
import RegisterPicker from "./RegisterPicker";
import MarkHolidayButton from "./MarkHolidayButton";
import PrintButton from "../../../components/PrintButton";
import PrintLetterhead from "../../../components/PrintLetterhead";
import { StatCard } from "../../../components/charts/ResultCharts";
import { FAIL_COLOR } from "../../../../modules/examination/service";
import { currentMonthIST, monthsAgoIST } from "../../../../services/datetime/ist";

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

  const effectiveMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentMonthIST();
  const [yearStr, monthStr] = effectiveMonth.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const hasUnrestrictedEdit = can(ctx.permissions, "attendance.edit");
  const teacherScope = hasUnrestrictedEdit ? null : await getTeacherClassScope(institutionId, authUserId, ctx.userId);

  const [allClasses, allSections] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
  ]);
  const classes = teacherScope ? allClasses.filter((c) => teacherScope.classIds.has(c.id)) : allClasses;
  const sections = teacherScope
    ? allSections.filter((s) => scopeIncludesSection(teacherScope, s.class_id, s.id))
    : allSections;

  // §Register-default follow-up ("default - latest of the first class should
  // be open here") — landing on this page with no query string used to show
  // an empty "Select a class, division, and month" prompt. It now opens on
  // the first class the viewer can see, that class's first division, and
  // the current (latest) month, so the register a teacher most likely wants
  // is already on screen. An explicit (and in-scope) selection always wins;
  // `effectiveMonth` above already defaults to the current month.
  const classInScope = !teacherScope || teacherScope.classIds.has(classId);
  const resolvedClassId = (classInScope && classId) || classes[0]?.id || "";
  const sectionsOfClass = sections.filter((x) => x.class_id === resolvedClassId);
  const requestedSectionInScope =
    sectionId !== "" && sectionsOfClass.some((x) => x.id === sectionId) &&
    (!teacherScope || scopeIncludesSection(teacherScope, resolvedClassId, sectionId));
  const effectiveClassId = resolvedClassId;
  const effectiveSectionId = requestedSectionInScope ? sectionId : (sectionsOfClass[0]?.id ?? "");

  const monthStartDate = `${effectiveMonth}-01`;
  const monthEndDate = `${effectiveMonth}-${String(daysInMonth).padStart(2, "0")}`;
  const canMarkHoliday = can(ctx.permissions, "calendar.manage");

  const [statuses, register, institution, holidayEvents] = await Promise.all([
    listAttendanceStatuses(institutionId, authUserId),
    effectiveClassId && effectiveSectionId
      ? getMonthlyAttendanceRegister(institutionId, authUserId, effectiveClassId, effectiveSectionId, year, monthNum)
      : Promise.resolve(null),
    getInstitution(institutionId, authUserId),
    // §Attendance-register follow-up — institution-wide holidays (Academic
    // Calendar's calendar_events, event_type "holiday") overlapping this
    // month, used to shade non-working days and compute "Total working
    // days" below. Independent of effectiveClassId/effectiveSectionId —
    // holidays apply to the whole institution, not one class.
    listCalendarEvents(institutionId, authUserId, { from: monthStartDate, to: monthEndDate }),
  ]);
  const statusByCode = new Map(statuses.map((s) => [s.code, s]));

  const cellByStudentDate = new Map<string, string>();
  if (register) {
    for (const e of register.entries) cellByStudentDate.set(`${e.student_id}:${e.date}`, e.status_code);
  }
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const className = classes.find((c) => c.id === effectiveClassId)?.name ?? "";
  const sectionName = sections.find((s) => s.id === effectiveSectionId)?.name ?? "";

  // §Attendance-register follow-up ("total working days of that month,
  // auto generated average attendance and percentage") — a "working day" is
  // any calendar day in the month that isn't a Sunday and isn't covered by
  // a holiday event (Saturday is treated as a working day — most schools in
  // this platform's seed data run a 6-day week; an institution that doesn't
  // can mark its own Saturdays as holidays via this same control). "Average
  // attendance"/"Attendance %" are computed over the days attendance was
  // actually TAKEN for this class/section (register.entries), not every
  // working day — a mid-month register shouldn't be dragged down by future
  // working days nobody has marked yet.
  const holidayDates = new Set<string>();
  for (const ev of holidayEvents) {
    if (ev.event_type !== "holiday") continue;
    const start = ev.start_date < monthStartDate ? monthStartDate : ev.start_date;
    const end = (ev.end_date ?? ev.start_date) > monthEndDate ? monthEndDate : (ev.end_date ?? ev.start_date);
    if (end < start) continue;
    for (const d of days) {
      const date = `${effectiveMonth}-${String(d).padStart(2, "0")}`;
      if (date >= start && date <= end) holidayDates.add(date);
    }
  }
  const isSunday = (d: number) => new Date(Date.UTC(year, monthNum - 1, d)).getUTCDay() === 0;
  const totalWorkingDays = days.filter((d) => {
    const date = `${effectiveMonth}-${String(d).padStart(2, "0")}`;
    return !isSunday(d) && !holidayDates.has(date);
  }).length;

  const daysWithAttendance = new Set(register?.entries.map((e) => e.date) ?? []);
  const totalStudents = register?.students.length ?? 0;
  const totalPresentMarks = register
    ? register.entries.filter((e) => statusByCode.get(e.status_code)?.counts_as_present).length
    : 0;
  const totalPossibleMarks = daysWithAttendance.size * totalStudents;
  const avgPresentPerDay = daysWithAttendance.size > 0 ? Math.round((totalPresentMarks / daysWithAttendance.size) * 10) / 10 : null;
  const attendancePercent = totalPossibleMarks > 0 ? Math.round((totalPresentMarks / totalPossibleMarks) * 10000) / 100 : null;
  const availableMonths = Array.from({ length: 12 }, (_, i) => monthsAgoIST(i));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Monthly Attendance Register</h1>

      <section className="no-print rounded-card border bg-white p-5">
        <RegisterPicker
          classes={classes}
          sections={sections}
          classId={effectiveClassId}
          sectionId={effectiveSectionId}
          month={effectiveMonth}
          availableMonths={availableMonths}
        />
      </section>

      {register ? (
        <section className="print-area rounded-card border bg-white p-5">
          <PrintLetterhead
            institutionName={institutionReportName(institution)}
            logoCode={institution?.logoFileId ? institution.code : null}
          />
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--heading)]">
                {className} — {sectionName} · {effectiveMonth}
              </h2>
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-500">
                {statuses.map((s) => (
                  <span key={s.id}>{s.code.charAt(0).toUpperCase()} = {s.label}</span>
                ))}
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-100" /> Holiday
                </span>
              </p>
              {canMarkHoliday ? (
                <p className="no-print mt-1 text-[11px] text-zinc-400">Click a date number below to mark/unmark it as a holiday.</p>
              ) : null}
            </div>
            <PrintButton />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="sticky left-0 bg-white py-1 pr-2">Student</th>
                  {days.map((d) => {
                    const date = `${effectiveMonth}-${String(d).padStart(2, "0")}`;
                    const isHoliday = holidayDates.has(date);
                    return (
                      <th key={d} className={`px-0 py-0 text-center font-normal ${isHoliday ? "bg-rose-50" : ""}`}>
                        {canMarkHoliday ? (
                          <MarkHolidayButton date={date} isHoliday={isHoliday} />
                        ) : (
                          <span className={`block px-1 py-1 ${isHoliday ? "text-rose-700" : ""}`}>{d}</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {register.students.map((s) => (
                  <tr key={s.student_id}>
                    <td className="sticky left-0 bg-white whitespace-nowrap py-1 pr-2">
                      {s.student_name} <span className="text-zinc-500">({s.admission_number})</span>
                    </td>
                    {days.map((d) => {
                      const date = `${effectiveMonth}-${String(d).padStart(2, "0")}`;
                      const code = cellByStudentDate.get(`${s.student_id}:${date}`);
                      const status = code ? statusByCode.get(code) : undefined;
                      const isHoliday = holidayDates.has(date);
                      return (
                        <td
                          key={d}
                          className={`px-1 py-1 text-center ${status && !status.counts_as_present ? "text-red-600" : ""} ${isHoliday ? "bg-rose-50" : ""}`}
                        >
                          {code ? code.charAt(0).toUpperCase() : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {register.students.length === 0 ? (
                  <tr><td colSpan={daysInMonth + 1} className="py-4 text-center text-zinc-500">No students enrolled in this class/section.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="no-print mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total working days" value={String(totalWorkingDays)} sub={`of ${daysInMonth} days this month`} />
            <StatCard label="Days attendance taken" value={String(daysWithAttendance.size)} />
            <StatCard label="Average attendance" value={avgPresentPerDay !== null ? `${avgPresentPerDay} / ${totalStudents}` : "—"} sub="students present per day" />
            <StatCard
              label="Attendance %"
              value={attendancePercent !== null ? `${attendancePercent}%` : "—"}
              accent={attendancePercent !== null && attendancePercent < 75 ? FAIL_COLOR : undefined}
            />
          </div>
        </section>
      ) : (
        <p className="text-sm text-zinc-500">
          {teacherScope && classId && !classInScope
            ? "You're not assigned to that class."
            : classes.length === 0
              ? "No classes are available to you yet."
              : effectiveSectionId === ""
                ? "This class has no divisions yet — add one under Academic structure."
                : "No attendance has been recorded for this class and month yet."}
        </p>
      )}
    </div>
  );
}
