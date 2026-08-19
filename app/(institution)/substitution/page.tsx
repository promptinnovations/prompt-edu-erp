import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStaff } from "../../../modules/staff/service";
import { generateSubstitutionSuggestions, listSubstitutions } from "../../../modules/substitution/service";
import ConfirmSubstitutionsForm from "./ConfirmSubstitutionsForm";
import DeleteSubstitutionButton from "./DeleteSubstitutionButton";

function formatDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default async function SubstitutionPage({
  searchParams,
}: {
  searchParams: Promise<{ absentStaffId?: string; date?: string }>;
}) {
  const { absentStaffId = "", date = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "substitution");
  if (!can(ctx.permissions, "substitution.view")) redirect("/dashboard");

  const canManage = can(ctx.permissions, "substitution.manage");
  const canManageTimetable = can(ctx.permissions, "substitution.timetable.manage");

  const today = new Date().toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

  const [staff, recent] = await Promise.all([
    listStaff(institutionId, authUserId),
    listSubstitutions(institutionId, authUserId, { from: fourteenDaysAgo }),
  ]);

  const suggestions = canManage && absentStaffId && date
    ? await generateSubstitutionSuggestions(institutionId, authUserId, absentStaffId, date)
    : null;
  const absentStaffName = staff.find((s) => s.id === absentStaffId)?.full_name ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Substitution</h1>
        <div className="flex gap-4 text-sm">
          {can(ctx.permissions, "substitution.view") ? <Link href="/substitution/report" className="text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Report →</Link> : null}
          {canManageTimetable ? <Link href="/substitution/timetable" className="text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Timetable →</Link> : null}
        </div>
      </div>

      {canManage ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Find substitutes for an absent teacher</h2>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Absent staff member</label>
              <select name="absentStaffId" defaultValue={absentStaffId} required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]">
                <option value="">Select…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}{s.staff_code ? ` (${s.staff_code})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Date</label>
              <input type="date" name="date" defaultValue={date || today} required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]" />
            </div>
            <button type="submit" className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
              Generate substitutes
            </button>
          </form>

          {absentStaffId && date ? (
            <div className="mt-5">
              {suggestions === null ? null : suggestions.length === 0 ? (
                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                  {absentStaffName || "This staff member"} has no timetabled periods on {formatDate(date)} — nothing to substitute
                  {canManageTimetable ? (
                    <> (set up the <Link href="/substitution/timetable" className="underline">timetable</Link> first if this is unexpected).</>
                  ) : "."}
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {absentStaffName} — {formatDate(date)} — {suggestions.length} period{suggestions.length === 1 ? "" : "s"} to cover.
                  </p>
                  <ConfirmSubstitutionsForm date={date} absentStaffId={absentStaffId} suggestions={suggestions} />
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Recent confirmed substitutions (last 14 days)</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No substitutions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <th className="py-1.5 pr-3">Date</th>
                  <th className="py-1.5 pr-3">Class</th>
                  <th className="py-1.5 pr-3">Period</th>
                  <th className="py-1.5 pr-3">Absent</th>
                  <th className="py-1.5 pr-3">Covering</th>
                  {canManage ? <th className="py-1.5 pr-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.className} – {r.sectionName}</td>
                    <td className="py-2 pr-3">{r.periodNo}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.absentStaffName}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.coveringStaffName ?? <span className="text-zinc-400">— unfilled —</span>}</td>
                    {canManage ? <td className="py-2 pr-3"><DeleteSubstitutionButton substitutionId={r.id} /></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
