import Link from "next/link";
import { requireOwnStudentId, NotLinkedNotice, Card } from "../_lib";
import { getCurrentAcademicYear } from "../../../../../modules/academic/service";
import { getStudentAttendanceSummary, getStudentMonthlyAttendance, listLeaveApplicationsForStudent } from "../../../../../modules/attendance/service";
import { MonthlyAttendanceBarChart } from "../../../../(institution)/students/[id]/ProfileCharts";

/** §"this page should show details of examination... not attendance, it
 *  can be a different page with a button from the home page" — attendance
 *  now has its own page (mirrors the parent portal's own
 *  /portal/parent/attendance, which already worked this way), reachable
 *  from the dashboard's Attendance stat card instead of living inside Exam
 *  performance. */
export default async function StudentAttendancePage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const academicYear = await getCurrentAcademicYear(institutionId, authUserId);
  const [summary, monthly, leaves] = await Promise.all([
    academicYear
      ? getStudentAttendanceSummary(institutionId, authUserId, ownStudentId, academicYear.start_date, academicYear.end_date)
      : Promise.resolve(null),
    academicYear
      ? getStudentMonthlyAttendance(institutionId, authUserId, ownStudentId, academicYear.start_date, academicYear.end_date)
      : Promise.resolve([]),
    listLeaveApplicationsForStudent(institutionId, authUserId, ownStudentId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/student" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
          ← Back to dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--heading)]">Attendance</h1>
        <p className="mt-0.5 text-sm text-zinc-500">This academic year, month by month, plus your leave history.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
          <div className="text-2xl font-semibold text-[var(--foreground)]">{summary ? `${summary.present_percent}%` : "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">Present (this year)</div>
        </div>
        <div className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
          <div className="text-2xl font-semibold text-[var(--foreground)]">{summary?.present_days ?? "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">Present days</div>
        </div>
        <div className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
          <div className="text-2xl font-semibold text-[var(--foreground)]">{summary?.absent_days ?? "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">Absent days</div>
        </div>
        <div className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
          <div className="text-2xl font-semibold text-[var(--foreground)]">{summary?.total_days ?? "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">Total marked</div>
        </div>
      </div>

      <Card title="Monthly attendance">
        <MonthlyAttendanceBarChart points={monthly} />
      </Card>

      <Card title="My leave applications">
        <ul className="space-y-2 text-sm">
          {leaves.map((l) => (
            <li key={l.id} className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 last:border-0">
              <span className="text-[var(--foreground)]">{l.start_date} → {l.end_date}{l.reason ? ` — ${l.reason}` : ""}</span>
              <span className="text-zinc-500 capitalize">{l.status}</span>
            </li>
          ))}
          {leaves.length === 0 ? <li className="text-zinc-500">No leave applications yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
