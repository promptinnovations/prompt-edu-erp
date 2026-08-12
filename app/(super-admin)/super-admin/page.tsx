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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Institutions</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Create a new institution</h2>
        <CreateInstitutionForm />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">All institutions ({institutions.length})</h2>
        <p className="mb-3 text-xs text-zinc-400">
          Usage counts below are live, on-demand totals — not the scheduled `usage_metrics` rollup described in
          ARCHITECTURE.md §W.1 (no job scheduler is wired up yet, same as the analytics-refresh follow-up; see docs/SETUP.md).
        </p>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
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
            <tbody className="divide-y divide-zinc-100">
              {institutions.map((inst) => {
                const u = usageByInstitution.get(inst.id);
                return (
                  <tr key={inst.id}>
                    <td className="py-1.5 pr-4 font-medium text-zinc-900">{inst.name}</td>
                    <td className="py-1.5 pr-4">
                      <InstitutionUrlCell institutionId={inst.id} code={inst.code} baseUrl={baseUrl} />
                    </td>
                    <td className="py-1.5 pr-4 text-zinc-500">{inst.type}</td>
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
                        className="whitespace-nowrap rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
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
