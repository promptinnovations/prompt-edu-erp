"use client";

import { useActionState } from "react";
import { uploadStudentPhotoAction, removeStudentPhotoAction } from "./actions";

/** §Page-3 follow-up ("Student Profile ... Photo") — same shape as Settings'
 *  LogoForm.tsx: a preview (if any), a file picker to replace it, and a
 *  Remove button. */
export default function PhotoForm({ studentId, photoUrl }: { studentId: string; photoUrl: string | null }) {
  const [uploadState, uploadAction, uploadPending] = useActionState<{ error: string | null }, FormData>(
    uploadStudentPhotoAction, { error: null }
  );
  const [removeState, removeAction, removePending] = useActionState<{ error: string | null }, FormData>(
    removeStudentPhotoAction, { error: null }
  );

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated /api/files route, not a static asset
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">No photo</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <form action={uploadAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="studentId" value={studentId} />
          <input
            name="photo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            required
            className="max-w-full text-xs text-zinc-600 dark:text-zinc-300 file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--accent-teal)] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-white hover:file:opacity-90"
          />
          <button type="submit" disabled={uploadPending} className="rounded-lg bg-[var(--brand)] px-2.5 py-1 text-xs text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            {photoUrl ? "Replace" : "Upload"}
          </button>
        </form>
        {photoUrl ? (
          <form action={removeAction}>
            <input type="hidden" name="studentId" value={studentId} />
            <button type="submit" disabled={removePending} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-white disabled:opacity-50">
              Remove
            </button>
          </form>
        ) : null}
        {uploadState.error ? <p className="text-xs text-red-600 dark:text-red-400">{uploadState.error}</p> : null}
        {removeState.error ? <p className="text-xs text-red-600 dark:text-red-400">{removeState.error}</p> : null}
      </div>
    </div>
  );
}
