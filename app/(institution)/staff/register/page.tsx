import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { can } from "../../../../services/permissions/permission-service";
import { listAttendanceStatuses } from "../../../../modules/attendance/service";
import { getMonthlyStaffAttendanceRegister } from "../../../../modules/staff/service";
import PrintButton from "../../../components/PrintButton";

/** "Staff > Staff attendance > Monthly register" — every active staff
 *  member's whole-month attendance in one printable grid, mirroring
 *  /attendance/register for students. Institution-wide (staff aren't tied
 *  to a class the way students are), so no teacher-class-scoping applies
 *  here — gated on staff.view like the rest of the Staff group. */
export default async function StaffMonthlyRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "staff");
  if (!can(ctx.permissions, "staff.view")) redirect("/dashboard");

  const now = new Date();
  const effectiveMonth = /^\d{4}-\d{2}$/.test(month) ? month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearStr, monthStr] = effectiveMonth.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const [statuses, register] = await Promise.all([
    listAttendanceStatuses(institutionId, authUserId),
    getMonthlyStaffAttendanceRegister(institutionId, authUserId, year, monthNum),
  ]);
  const statusByCode = new Map(statuses.map((s) => [s.code, s]));
  const cellByStaffDate = new Map<string, string>();
  for (const e of register.entries) cellByStaffDate.set(`${e.staff_id}:${e.date}`, e.status_code);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Staff Monthly Attendance Register</h1>

      <section className="no-print rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Month</label>
            <input type="month" name="month" defaultValue={effectiveMonth} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
          </div>
          <button type="submit" className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
            Load
          </button>
        </form>
      </section>

      <section className="print-area rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{effectiveMonth}</h2>
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
                <th className="sticky left-0 bg-white dark:bg-zinc-900 py-1 pr-2">Staff</th>
                {days.map((d) => (
                  <th key={d} className="px-1 py-1 text-center font-normal">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {register.staff.map((s) => (
                <tr key={s.staff_id}>
                  <td className="sticky left-0 bg-white dark:bg-zinc-900 whitespace-nowrap py-1 pr-2">
                    {s.full_name} {s.staff_code ? <span className="text-zinc-400 dark:text-zinc-500">({s.staff_code})</span> : null}
                  </td>
                  {days.map((d) => {
                    const date = `${effectiveMonth}-${String(d).padStart(2, "0")}`;
                    const code = cellByStaffDate.get(`${s.staff_id}:${date}`);
                    const status = code ? statusByCode.get(code) : undefined;
                    return (
                      <td key={d} className={`px-1 py-1 text-center ${status && !status.counts_as_present ? "text-red-600 dark:text-red-400" : ""}`}>
                        {code ? code.charAt(0).toUpperCase() : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {register.staff.length === 0 ? (
                <tr><td colSpan={daysInMonth + 1} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No active staff.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
