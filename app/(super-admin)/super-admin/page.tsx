import Link from "next/link";
import { StatTile } from "../../components/portal/viz/blocks";
import { decorColor } from "../../components/portal/viz/palette";
import { PromptWordmark } from "../../components/PromptLogo";
import { headers } from "next/headers";
import { requireSuperAdminContext } from "../../../services/request-context";
import { listInstitutions, getPlatformUsageOverview } from "../../../services/super-admin/super-admin-service";
import CreateInstitutionForm from "../CreateInstitutionForm";
import InstitutionStatusForm from "../InstitutionStatusForm";
import InstitutionUrlCell from "../InstitutionUrlCell";
import InstitutionNameCell from "../InstitutionNameCell";

export default async function SuperAdminOverviewPage() {
  const ctx = await requireSuperAdminContext();

  const [institutions, usage, requestHeaders] = await Promise.all([
    listInstitutions(ctx.session.authUserId),
    getPlatformUsageOverview(ctx.session.authUserId),
    headers(),
  ]);
  const usageByInstitution = new Map(usage.map((u) => [u.institution_id, u]));

  // Derived from the actual incoming request rather than an env var, so
  // each institution's shareable link (§137 follow-up) is correct whether
  // this is running on prompt-edu-erp.vercel.app, a future custom domain,
  // or localhost during development — nothing to configure.
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const totals = usage.reduce(
    (acc, u) => ({
      students: acc.students + u.student_count,
      staff: acc.staff + u.staff_count,
      users: acc.users + u.user_count,
    }),
    { students: 0, staff: 0, users: 0 }
  );
  // §Palette-matching icons: a line icon per figure (was an empty square).
  const summary: Array<[string, number, string]> = [
    ["Institutions", institutions.length, "🏫"],
    ["Students", totals.students, "🎒"],
    ["Staff", totals.staff, "🧑‍💼"],
    ["Platform users", totals.users, "👥"],
  ];

  return (
    <div className="space-y-6">
      {/* §Brand ("why only 2 colours here; why isn't the PROMPT EDU ERP
          logo the original one"): the console header carries the approved
          logo, the Scholar Teal gradient with its coral accent, and the four
          figures as theme stat tiles in the full approved family (teal,
          coral, deep teal, light teal) instead of four identical
          white-on-teal boxes. */}
      <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] p-6 text-white shadow-float sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-white/5 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-200">Super Admin Console</div>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Institutions</h1>
            <span aria-hidden className="mt-3 block h-1 w-14 rounded-full bg-accent-500" />
          </div>
          <PromptWordmark size={46} light className="max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary.map(([label, value, icon], i) => (
          <StatTile key={label} label={label} value={value.toLocaleString("en-IN")} icon={icon} color={decorColor(i)} />
        ))}
      </div>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Create a new institution</h2>
        <CreateInstitutionForm />
      </section>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">All institutions ({institutions.length})</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Usage counts below are live, on-demand totals — not the scheduled `usage_metrics` rollup described in
          ARCHITECTURE.md §W.1 (no job scheduler is wired up yet, same as the analytics-refresh follow-up; see docs/SETUP.md).
        </p>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
              <tr>
                <th className="py-1.5 pr-4">Name</th>
                <th className="py-1.5 pr-4">URL</th>
                <th className="py-1.5 pr-4">Type</th>
                <th className="py-1.5 pr-4">Students</th>
                <th className="py-1.5 pr-4">Staff</th>
                <th className="py-1.5 pr-4">Users</th>
                <th className="py-1.5 pr-4">Files</th>
                <th className="py-1.5 pr-4">Status</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {institutions.map((inst) => {
                const u = usageByInstitution.get(inst.id);
                return (
                  <tr key={inst.id}>
                    <td className="py-1.5 pr-4">
                      <InstitutionNameCell institutionId={inst.id} name={inst.name} />
                    </td>
                    <td className="py-1.5 pr-4">
                      <InstitutionUrlCell institutionId={inst.id} code={inst.code} baseUrl={baseUrl} />
                    </td>
                    <td className="py-1.5 pr-4 text-zinc-500">
                      {inst.type}
                      {inst.board ? <span className="ml-1 uppercase text-[10px] text-indigo-500">({inst.board})</span> : null}
                    </td>
                    <td className="py-1.5 pr-4">{u?.student_count ?? 0}</td>
                    <td className="py-1.5 pr-4">{u?.staff_count ?? 0}</td>
                    <td className="py-1.5 pr-4">{u?.user_count ?? 0}</td>
                    <td className="py-1.5 pr-4">{u?.file_count ?? 0}</td>
                    <td className="py-1.5 pr-4">
                      <InstitutionStatusForm institutionId={inst.id} currentStatus={inst.status} />
                    </td>
                    <td className="py-1.5 text-right">
                      <Link
                        href={`/super-admin/institutions/${inst.id}`}
                        className="whitespace-nowrap rounded-full border px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                      >
                        Manage modules
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {institutions.length === 0 ? (
                <tr><td colSpan={9} className="py-4 text-center text-zinc-500">No institutions yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
