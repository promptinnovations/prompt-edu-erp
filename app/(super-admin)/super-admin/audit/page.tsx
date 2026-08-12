import { requireSuperAdminContext } from "../../../../services/request-context";
import { listPlatformAuditLogs } from "../../../../services/super-admin/super-admin-service";

export default async function PlatformAuditPage() {
  const ctx = await requireSuperAdminContext();
  const logs = await listPlatformAuditLogs(ctx.session.authUserId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Platform Audit (§Y.3)</h1>
      <p className="text-sm text-zinc-500">
        Cross-tenant / Super Admin actions only — viewing this page is itself an audited action&apos;s counterpart
        (write path, not read path — see ARCHITECTURE.md §Y.3). Each institution&apos;s own day-to-day activity is in
        that institution&apos;s own audit log, not here.
      </p>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-1.5">When</th>
              <th className="py-1.5">Actor</th>
              <th className="py-1.5">Institution</th>
              <th className="py-1.5">Action</th>
              <th className="py-1.5">Entity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="py-1.5 text-zinc-500">{new Date(log.created_at).toLocaleString()}</td>
                <td className="py-1.5">{log.actor_name ?? "—"}</td>
                <td className="py-1.5 text-zinc-500">{log.institution_name ?? "—"}</td>
                <td className="py-1.5 capitalize">{log.action}</td>
                <td className="py-1.5 text-zinc-500">{log.entity_type}</td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-zinc-400">No platform-level activity yet.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
