import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listImportEntityTypes, listRecentImportBatches, exportDefinitions } from "../../../modules/bulk/service";
import ImportWizard from "./ImportWizard";

export default async function ImportExportPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const canImport = can(ctx.permissions, "data.import");
  const canExport = can(ctx.permissions, "data.export");

  const [entities, recentBatches] = await Promise.all([
    Promise.resolve(listImportEntityTypes()),
    canImport ? listRecentImportBatches(institutionId, authUserId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Import / Export (§Q)</h1>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bulk import</h2>
        {canImport ? (
          <ImportWizard entities={entities.map((e) => ({ entityType: e.entityType, label: e.label }))} />
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">You do not have permission to bulk-import data (&quot;data.import&quot;).</p>
        )}
      </section>

      {canImport ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Recent imports (this institution)</h2>
          {recentBatches.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">No imports yet.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-400 dark:text-zinc-500">
                  <th className="pb-2 font-medium">File</th>
                  <th className="pb-2 font-medium">Entity</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Valid / Invalid / Duplicate</th>
                  <th className="pb-2 font-medium">Imported</th>
                  <th className="pb-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map((b) => (
                  <tr key={b.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">{b.filename}</td>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400">{b.entity_type}</td>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400">{b.status}</td>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400">{b.valid_rows} / {b.invalid_rows} / {b.duplicate_rows}</td>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400">{b.imported_rows}</td>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400">{new Date(b.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Raw data export</h2>
        {canExport ? (
          <div className="flex flex-wrap gap-3">
            {Object.entries(exportDefinitions).map(([key, def]) => (
              <div key={key} className="flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">{def.label}</span>
                <a href={`/api/export/${key}?format=csv`} className="text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-white">CSV</a>
                <a href={`/api/export/${key}?format=xlsx`} className="text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-white">Excel</a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">You do not have permission to export data (&quot;data.export&quot;).</p>
        )}
      </section>
    </div>
  );
}
