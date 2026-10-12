import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStaff } from "../../../modules/staff/service";
import { generateSubstitutionSuggestions, listSubstitutions } from "../../../modules/substitution/service";
import ConfirmSubstitutionsForm from "./ConfirmSubstitutionsForm";
import DeleteSubstitutionButton from "./DeleteSubstitutionButton";
import { todayIST, daysAgoIST, formatDateIST } from "../../../services/datetime/ist";
import { Panel } from "../../components/portal/viz/blocks";
import { CountBars } from "../../components/staff/insights";
import { seriesColor } from "../../components/portal/viz/palette";

function formatDate(d: string) {
  return formatDateIST(d);
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

  const today = todayIST();
  const fourteenDaysAgo = daysAgoIST(14);

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
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Substitution</h1>
        <div className="flex gap-4 text-sm">
          {can(ctx.permissions, "substitution.view") ? <Link href="/substitution/report" className="text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Report →</Link> : null}
          {canManageTimetable ? <Link href="/substitution/timetable" className="text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Timetable →</Link> : null}
        </div>
      </div>

      {/* §Staff-pages-visual — the last 14 days of substitutions at a glance
          (same rows as the list below). */}
      {recent.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Covered most" subtitle="Periods covered, last 14 days." color={seriesColor(5)}>
            <CountBars rows={recent.filter((r) => r.coveringStaffName)} label={(r) => r.coveringStaffName} color={seriesColor(5)} limit={8} />
          </Panel>
          <Panel title="Absent most" subtitle="Periods needing cover, last 14 days." color={seriesColor(7)}>
            <CountBars rows={recent} label={(r) => r.absentStaffName} color={seriesColor(7)} limit={8} />
          </Panel>
        </div>
      ) : null}

      {canManage ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Find substitutes for an absent teacher</h2>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Absent staff member</label>
              <select name="absentStaffId" defaultValue={absentStaffId} required className="rounded-full border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]">
                <option value="">Select…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}{s.staff_code ? ` (${s.staff_code})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Date</label>
              <input autoComplete="off" type="date" name="date" defaultValue={date || today} required className="rounded-full border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]" />
            </div>
            <button type="submit" className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
              Generate substitutes
            </button>
          </form>

          {absentStaffId && date ? (
            <div className="mt-5">
              {suggestions === null ? null : suggestions.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  {absentStaffName || "This staff member"} has no timetabled periods on {formatDate(date)} — nothing to substitute
                  {canManageTimetable ? (
                    <> (set up the <Link href="/substitution/timetable" className="underline">timetable</Link> first if this is unexpected).</>
                  ) : "."}
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-zinc-500">
                    {absentStaffName} — {formatDate(date)} — {suggestions.length} period{suggestions.length === 1 ? "" : "s"} to cover.
                  </p>
                  <ConfirmSubstitutionsForm date={date} absentStaffId={absentStaffId} suggestions={suggestions} />
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Recent confirmed substitutions (last 14 days)</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">No substitutions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                  <th className="py-1.5 pr-3">Date</th>
                  <th className="py-1.5 pr-3">Class</th>
                  <th className="py-1.5 pr-3">Period</th>
                  <th className="py-1.5 pr-3">Absent</th>
                  <th className="py-1.5 pr-3">Covering</th>
                  {canManage ? <th className="py-1.5 pr-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.className} – {r.sectionName}</td>
                    <td className="py-2 pr-3">{r.periodNo}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.absentStaffName}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.coveringStaffName ?? <span className="text-zinc-500">— unfilled —</span>}</td>
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
