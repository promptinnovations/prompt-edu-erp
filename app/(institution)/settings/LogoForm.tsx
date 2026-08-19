"use client";

import { useActionState } from "react";
import { uploadInstitutionLogoAction, removeInstitutionLogoAction } from "./actions";

/** "Can I add institution logo?" follow-up — preview of the current logo (if
 *  any, via the same /api/institution-logo/<code> URL the sidebar/login page
 *  use — one URL, one source of truth, no separate authenticated download
 *  path needed here), a file picker to replace it, and a Remove button. */
export default function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const [uploadState, uploadAction, uploadPending] = useActionState<{ error: string | null }, FormData>(
    uploadInstitutionLogoAction,
    { error: null }
  );
  const [removeState, removeAction, removePending] = useActionState<{ error: string | null }, FormData>(
    removeInstitutionLogoAction,
    { error: null }
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external/dynamic per-institution URL, not a static asset next/image can optimize meaningfully here
            <img src={logoUrl} alt="Institution logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">No logo</span>
          )}
        </div>

        <form action={uploadAction} className="flex flex-1 flex-wrap items-center gap-2">
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            required
            className="max-w-full text-sm text-zinc-600 dark:text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent-teal)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
          />
          <button
            type="submit"
            disabled={uploadPending}
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
          >
            {logoUrl ? "Replace logo" : "Upload logo"}
          </button>
        </form>

        {logoUrl ? (
          <form action={removeAction}>
            <button
              type="submit"
              disabled={removePending}
              className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-white disabled:opacity-50"
            >
              Remove
            </button>
          </form>
        ) : null}
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        PNG, JPEG, GIF, or WebP. Shown in the sidebar, the login page, report cards, and the installed app icon.
      </p>
      {uploadState.error ? <p className="text-xs text-red-600 dark:text-red-400">{uploadState.error}</p> : null}
      {removeState.error ? <p className="text-xs text-red-600 dark:text-red-400">{removeState.error}</p> : null}
    </div>
  );
}
