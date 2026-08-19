import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { can } from "../../../../services/permissions/permission-service";
import { getSubstitutionReport } from "../../../../modules/substitution/service";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date) {
  const day = d.getDay() === 0 ? 7 : d.getDay(); // ISO: Monday=1
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day - 1));
  return monday;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function SubstitutionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "substitution");
  if (!can(ctx.permissions, "substitution.view")) redirect("/dashboard");

  const now = new Date();
  const effectiveFrom = from || isoDate(startOfWeek(now));
  const effectiveTo = to || isoDate(now);

  const report = await getSubstitutionReport(institutionId, authUserId, effectiveFrom, effectiveTo);
  const totalGiven = report.reduce((sum, r) => sum + r.subsGiven, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/substitution" className="text-sm text-zinc-500 dark:text-zinc-400 underline">← Back to Substitution</Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Substitution Report</h1>
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">From</label>
              <input type="date" name="from" defaultValue={effectiveFrom} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">To</label>
              <input type="date" name="to" defaultValue={effectiveTo} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]" />
            </div>
            <button type="submit" className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">Load</button>
          </form>
          <div className="flex gap-2 text-sm">
            <Link href={`/substitution/report?from=${isoDate(startOfWeek(now))}&to=${isoDate(now)}`} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800">This week</Link>
            <Link href={`/substitution/report?from=${isoDate(startOfMonth(now))}&to=${isoDate(now)}`} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800">This month</Link>
          </div>
        </div>

        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          {effectiveFrom} – {effectiveTo} · {totalGiven} substitution{totalGiven === 1 ? "" : "s"} confirmed
        </p>

        {report.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No substitutions in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <th className="py-1.5 pr-3">Staff</th>
                  <th className="py-1.5 pr-3">Subs given</th>
                  <th className="py-1.5 pr-3">Times needed a sub</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {report.map((r) => (
                  <tr key={r.staffId}>
                    <td className="py-2 pr-3">{r.staffName}</td>
                    <td className="py-2 pr-3 font-medium">{r.subsGiven}</td>
                    <td className="py-2 pr-3">{r.subsNeeded}</td>
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
