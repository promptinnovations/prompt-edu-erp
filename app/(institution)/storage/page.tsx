import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { getStorageProvider } from "../../../services/storage/storage-provider";
import { listFiles } from "../../../services/storage/file-service";
import MigrateStorageForm from "./MigrateStorageForm";

export default async function StoragePage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const canManage = can(ctx.permissions, "files.manage");

  const activeProvider = getStorageProvider().name;
  const files = canManage ? await listFiles(institutionId, authUserId) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Storage</h1>

      {!canManage ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">You do not have permission to manage institution file storage (&quot;files.manage&quot;).</p>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Active provider</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              New uploads are currently stored via <span className="font-medium capitalize">{activeProvider}</span>{" "}
              (selected automatically by which environment variables are configured — see docs/SETUP.md).
            </p>
          </section>

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Migrate existing files</h2>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              Moves every file not already on the chosen provider (§U.2) — byte-verified, one file at a time.
            </p>
            <MigrateStorageForm activeProvider={activeProvider} />
          </section>

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Recent files (this institution)</h2>
            {files.length === 0 ? (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">No files uploaded yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-1.5">Name</th>
                    <th className="py-1.5">Entity</th>
                    <th className="py-1.5">Provider</th>
                    <th className="py-1.5">Size</th>
                    <th className="py-1.5">Uploaded</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {files.map((f) => (
                    <tr key={f.id}>
                      <td className="py-1.5">{f.file_name}</td>
                      <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{f.entity_type ?? "—"}</td>
                      <td className="py-1.5 capitalize">{f.storage_provider}</td>
                      <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{Math.max(1, Math.round(Number(f.size_bytes) / 1024))} KB</td>
                      <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{new Date(f.created_at).toLocaleDateString()}</td>
                      <td className="py-1.5">
                        <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="text-zinc-600 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-white">
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
