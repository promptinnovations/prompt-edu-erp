import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { can } from "../../../../services/permissions/permission-service";
import { getInstitution } from "../../../../services/institution/institution-service";
import { listAttendanceStatuses } from "../../../../modules/attendance/service";
import { getMonthlyStaffAttendanceRegister } from "../../../../modules/staff/service";
import PrintButton from "../../../components/PrintButton";
import PrintLetterhead from "../../../components/PrintLetterhead";
import { currentMonthIST } from "../../../../services/datetime/ist";

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

  const effectiveMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentMonthIST();
  const [yearStr, monthStr] = effectiveMonth.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const [statuses, register, institution] = await Promise.all([
    listAttendanceStatuses(institutionId, authUserId),
    getMonthlyStaffAttendanceRegister(institutionId, authUserId, year, monthNum),
    getInstitution(institutionId, authUserId),
  ]);
  const statusByCode = new Map(statuses.map((s) => [s.code, s]));
  const cellByStaffDate = new Map<string, string>();
  for (const e of register.entries) cellByStaffDate.set(`${e.staff_id}:${e.date}`, e.status_code);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Staff Monthly Attendance Register</h1>

      <section className="no-print rounded-card border bg-white p-5">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Month</label>
            <input autoComplete="off" type="month" name="month" defaultValue={effectiveMonth} className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
          </div>
          <button type="submit" className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
            Load
          </button>
        </form>
      </section>

      <section className="print-area rounded-card border bg-white p-5">
        <PrintLetterhead
          institutionName={institution?.appName || institution?.name || "PROMPT EDU ERP"}
          logoCode={institution?.logoFileId ? institution.code : null}
        />
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--heading)]">{effectiveMonth}</h2>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-500">
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
              <tr className="text-left text-zinc-500">
                <th className="sticky left-0 bg-white py-1 pr-2">Staff</th>
                {days.map((d) => (
                  <th key={d} className="px-1 py-1 text-center font-normal">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {register.staff.map((s) => (
                <tr key={s.staff_id}>
                  <td className="sticky left-0 bg-white whitespace-nowrap py-1 pr-2">
                    {s.full_name} {s.staff_code ? <span className="text-zinc-500">({s.staff_code})</span> : null}
                  </td>
                  {days.map((d) => {
                    const date = `${effectiveMonth}-${String(d).padStart(2, "0")}`;
                    const code = cellByStaffDate.get(`${s.staff_id}:${date}`);
                    const status = code ? statusByCode.get(code) : undefined;
                    return (
                      <td key={d} className={`px-1 py-1 text-center ${status && !status.counts_as_present ? "text-red-600" : ""}`}>
                        {code ? code.charAt(0).toUpperCase() : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {register.staff.length === 0 ? (
                <tr><td colSpan={daysInMonth + 1} className="py-4 text-center text-zinc-500">No active staff.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
