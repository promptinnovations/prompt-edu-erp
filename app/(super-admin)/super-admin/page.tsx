import Link from "next/link";
import { headers } from "next/headers";
import { requireSuperAdminContext } from "../../../services/request-context";
import { listInstitutions, getPlatformUsageOverview } from "../../../services/super-admin/super-admin-service";
import CreateInstitutionForm from "../CreateInstitutionForm";
import InstitutionStatusForm from "../InstitutionStatusForm";
import InstitutionUrlCell from "../InstitutionUrlCell";

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
  const summary: Array<[string, number, string]> = [
    ["Institutions", institutions.length, "from-indigo-500 to-violet-500"],
    ["Students", totals.students, "from-violet-500 to-fuchsia-500"],
    ["Staff", totals.staff, "from-fuchsia-500 to-pink-500"],
    ["Platform users", totals.users, "from-sky-500 to-indigo-500"],
  ];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-indigo-950 to-violet-950 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-2xl" />
        <div className="relative">
          <div className="text-xs font-medium uppercase tracking-wide text-white/60">Super Admin Console</div>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Institutions</h1>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summary.map(([label, value, accent]) => (
            <div key={label} className="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <div className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${accent}`} />
              <div className="text-xl font-semibold">{value}</div>
              <div className="mt-0.5 text-xs text-white/70">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Create a new institution</h2>
        <CreateInstitutionForm />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">All institutions ({institutions.length})</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
          Usage counts below are live, on-demand totals — not the scheduled `usage_metrics` rollup described in
          ARCHITECTURE.md §W.1 (no job scheduler is wired up yet, same as the analytics-refresh follow-up; see docs/SETUP.md).
        </p>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
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
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {institutions.map((inst) => {
                const u = usageByInstitution.get(inst.id);
                return (
                  <tr key={inst.id}>
                    <td className="py-1.5 pr-4 font-medium text-zinc-900 dark:text-zinc-100">{inst.name}</td>
                    <td className="py-1.5 pr-4">
                      <InstitutionUrlCell institutionId={inst.id} code={inst.code} baseUrl={baseUrl} />
                    </td>
                    <td className="py-1.5 pr-4 text-zinc-500 dark:text-zinc-400">{inst.type}</td>
                    <td className="py-1.5 pr-4 dark:text-zinc-300">{u?.student_count ?? 0}</td>
                    <td className="py-1.5 pr-4 dark:text-zinc-300">{u?.staff_count ?? 0}</td>
                    <td className="py-1.5 pr-4 dark:text-zinc-300">{u?.user_count ?? 0}</td>
                    <td className="py-1.5 pr-4 dark:text-zinc-300">{u?.file_count ?? 0}</td>
                    <td className="py-1.5 pr-4">
                      <InstitutionStatusForm institutionId={inst.id} currentStatus={inst.status} />
                    </td>
                    <td className="py-1.5 text-right">
                      <Link
                        href={`/super-admin/institutions/${inst.id}`}
                        className="whitespace-nowrap rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                      >
                        Manage modules
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {institutions.length === 0 ? (
                <tr><td colSpan={9} className="py-4 text-center text-zinc-400">No institutions yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
