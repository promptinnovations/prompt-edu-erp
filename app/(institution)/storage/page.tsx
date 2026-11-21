import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { getStorageProvider } from "../../../services/storage/storage-provider";
import { listFiles } from "../../../services/storage/file-service";
import MigrateStorageForm from "./MigrateStorageForm";
import ActionForm from "../../components/ui/ActionForm";
import { disconnectDriveAction } from "./actions";
import { getDriveStatus } from "../../../services/storage/institution-storage";
import { isGoogleDriveConfigured } from "../../../services/storage/google-drive";
import { formatDateIST } from "../../../services/datetime/ist";

const DRIVE_MSG: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "Google Drive connected. New photos, certificates and documents are now saved in your Drive." },
  cancelled: { tone: "warn", text: "Google Drive was not connected — the Google sign-in was cancelled." },
  failed: { tone: "warn", text: "Google Drive could not be connected. Please try again." },
  forbidden: { tone: "warn", text: "Only someone who manages storage can connect Google Drive." },
  unavailable: { tone: "warn", text: "Google Drive isn't switched on for this server yet — ask Prompt Innovations." },
};

export default async function StoragePage({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  const { drive: driveParam } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const canManage = can(ctx.permissions, "files.manage");

  const appProvider = getStorageProvider().name;
  const [files, drive] = canManage
    ? await Promise.all([listFiles(institutionId, authUserId), getDriveStatus(institutionId, authUserId).catch(() => null)])
    : [[], null];
  const activeProvider = drive ? "google_drive" : appProvider;
  const driveReady = isGoogleDriveConfigured();
  const msg = driveParam ? DRIVE_MSG[driveParam] : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Storage</h1>

      {!canManage ? (
        <p className="text-sm text-zinc-500">You do not have permission to manage institution file storage (&quot;files.manage&quot;).</p>
      ) : (
        <>
          {msg ? (
            <p role="status" className={`rounded-card border px-4 py-3 text-sm ${msg.tone === "ok" ? "border-primary-200 bg-primary-50 text-primary-800" : "border-accent-200 bg-accent-50 text-accent-800"}`}>{msg.text}</p>
          ) : null}

          {/* Google Drive (migration 0073): the database stays in Supabase;
              the institution's FILES can live in its own Drive. */}
          <section className="rounded-card border bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[14rem] flex-1">
                <h2 className="text-sm font-semibold text-[var(--heading)]">Keep your files in your own Google Drive</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Student photos, certificates and documents can be saved in your institution&apos;s Google Drive instead of the app&apos;s storage.
                  The app can only see the files it puts there (in one folder), never the rest of your Drive. Your records stay in the app&apos;s database.
                </p>
              </div>
              {drive ? (
                <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">Connected</span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">Not connected</span>
              )}
            </div>
            {drive ? (
              <div className="mt-4 space-y-3">
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-zinc-500">Google account</dt><dd className="font-medium text-[var(--foreground)]">{drive.email ?? "—"}</dd></div>
                  <div><dt className="text-xs text-zinc-500">Files in Drive</dt><dd className="font-medium text-[var(--foreground)]">{drive.filesOnDrive}</dd></div>
                  <div><dt className="text-xs text-zinc-500">Folder</dt><dd><a className="font-medium text-[var(--brand)] underline" href={`https://drive.google.com/drive/folders/${drive.folderId}`} target="_blank" rel="noreferrer">Open in Google Drive</a></dd></div>
                </dl>
                <p className="text-xs text-zinc-500">New uploads go to Google Drive. To move files that are already in the app, use “Move existing files” below and choose “Our Google Drive”. The logo stays in the app (it is shown before sign-in and as the app icon).</p>
                <div className="flex flex-wrap gap-2">
                  <a href="/api/storage/google/connect" className="rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-[var(--surface-muted)]">Reconnect</a>
                  <ActionForm action={disconnectDriveAction} submitLabel="Disconnect" variant="danger" confirm="Disconnect Google Drive? Move every file back to the app first.">{null}</ActionForm>
                </div>
              </div>
            ) : driveReady ? (
              <div className="mt-4">
                <a href="/api/storage/google/connect" className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)]">Connect Google Drive</a>
                <p className="mt-2 text-xs text-zinc-500">Sign in with the institution&apos;s Google account (not a personal one) and allow access.</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">Google Drive isn&apos;t switched on for this server yet — ask Prompt Innovations to enable it.</p>
            )}
          </section>

          <section className="rounded-card border bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Where new files go</h2>
            <p className="text-sm text-zinc-600">
              New uploads are stored in <span className="font-medium">{drive ? "your Google Drive" : appProvider === "supabase" ? "the app's cloud storage" : "the app's local storage"}</span>.
            </p>
          </section>

          <section className="rounded-card border bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Move existing files</h2>
            <p className="mb-3 text-sm text-zinc-500">
              Moves every file not already on the chosen provider (§U.2) — byte-verified, one file at a time.
            </p>
            <MigrateStorageForm activeProvider={activeProvider} driveConnected={Boolean(drive)} />
          </section>

          <section className="rounded-card border bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Recent files (this institution)</h2>
            {files.length === 0 ? (
              <p className="text-sm text-zinc-500">No files uploaded yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                  <tr>
                    <th className="py-1.5">Name</th>
                    <th className="py-1.5">Entity</th>
                    <th className="py-1.5">Provider</th>
                    <th className="py-1.5">Size</th>
                    <th className="py-1.5">Uploaded</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {files.map((f) => (
                    <tr key={f.id}>
                      <td className="py-1.5">{f.file_name}</td>
                      <td className="py-1.5 text-zinc-500">{f.entity_type ?? "—"}</td>
                      <td className="py-1.5">{f.storage_provider === "google_drive" ? "Google Drive" : f.storage_provider === "supabase" ? "App cloud" : "Local"}</td>
                      <td className="py-1.5 text-zinc-500">{Math.max(1, Math.round(Number(f.size_bytes) / 1024))} KB</td>
                      <td className="py-1.5 text-zinc-500">{formatDateIST(f.created_at)}</td>
                      <td className="py-1.5">
                        <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="text-zinc-600 underline hover:text-zinc-900">
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
