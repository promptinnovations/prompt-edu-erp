import Link from "next/link";
import { requireOwnParentContext, NotLinkedNotice, Card } from "../_lib";
import { getCurrentAcademicYear } from "../../../../../modules/academic/service";
import { getStudentAttendanceSummary, getStudentMonthlyAttendance, listLeaveApplicationsForStudent } from "../../../../../modules/attendance/service";
import { MonthlyAttendanceBarChart } from "../../../../(institution)/students/[id]/ProfileCharts";

/** Detail view behind the parent dashboard's "Attendance" stat-card button
 *  — the monthly present/absent breakdown + leave history, same shape as
 *  the Student Profile page's Summary tab, just scoped to whichever child
 *  the parent has selected instead of the signed-in student themself. */
export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const child = children.find((c) => c.id === selectedChildId);

  const academicYear = await getCurrentAcademicYear(institutionId, authUserId);
  const [summary, monthly, leaves] = await Promise.all([
    academicYear
      ? getStudentAttendanceSummary(institutionId, authUserId, selectedChildId, academicYear.start_date, academicYear.end_date)
      : Promise.resolve(null),
    academicYear
      ? getStudentMonthlyAttendance(institutionId, authUserId, selectedChildId, academicYear.start_date, academicYear.end_date)
      : Promise.resolve([]),
    listLeaveApplicationsForStudent(institutionId, authUserId, selectedChildId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/portal/parent?childId=${selectedChildId}`} className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
          ← Back to {child?.full_name ?? "overview"}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--heading)]">Attendance — {child?.full_name}</h1>
        <p className="mt-0.5 text-sm text-zinc-500">This academic year, month by month, plus leave history.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-card border bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">{summary ? `${summary.present_percent}%` : "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">Present (this year)</div>
        </div>
        <div className="rounded-card border bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">{summary?.present_days ?? "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">Present days</div>
        </div>
        <div className="rounded-card border bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">{summary?.absent_days ?? "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">Absent days</div>
        </div>
        <div className="rounded-card border bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">{summary?.total_days ?? "—"}</div>
          <div className="mt-1 text-sm text-zinc-500">Total marked</div>
        </div>
      </div>

      <Card title="Monthly attendance">
        <MonthlyAttendanceBarChart points={monthly} />
      </Card>

      <Card title="Leave applications">
        <ul className="space-y-2 text-sm">
          {leaves.map((l) => (
            <li key={l.id} className="flex items-center justify-between border-b pb-2 last:border-0">
              <span>{l.start_date} → {l.end_date}{l.reason ? ` — ${l.reason}` : ""}</span>
              <span className="text-zinc-500 capitalize">{l.status}</span>
            </li>
          ))}
          {leaves.length === 0 ? <li className="text-zinc-500">No leave applications yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
