"use client";

import { useActionState, useState } from "react";
import { createStudentLoginAction, resetStudentLoginAction } from "./actions";

/** §137 follow-up ("their log in id (must be student name, password- phone
 *  number of parent)"). The login id itself is always just shown, never
 *  editable directly here — it's derived from the student's name at
 *  creation time (see modules/portal/service.ts's
 *  generateUniqueLoginId()); renaming the student via EditStudentForm does
 *  NOT retroactively change an already-issued login id, so a family's
 *  saved login keeps working even if a spelling correction happens later. */
export default function StudentLoginSection({
  studentId, loginId, defaultParentPhone,
}: {
  studentId: string; loginId: string | null; defaultParentPhone: string;
}) {
  const [createState, createAction, createPending] = useActionState<{ error: string | null }, FormData>(createStudentLoginAction, { error: null });
  const [resetState, resetAction, resetPending] = useActionState<{ error: string | null }, FormData>(resetStudentLoginAction, { error: null });
  const [resetting, setResetting] = useState(false);

  if (loginId) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-zinc-700 dark:text-zinc-300">
          Login ID: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-50">{loginId}</span>
          <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">Password: the parent&apos;s phone number</span>
        </p>
        {resetting ? (
          <form action={resetAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="studentId" value={studentId} />
            <div>
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">New password (parent&apos;s phone number)</label>
              <input name="parentPhone" defaultValue={defaultParentPhone} required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
            </div>
            <button type="submit" disabled={resetPending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
              Reset password
            </button>
            <button type="button" onClick={() => setResetting(false)} className="text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200">
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setResetting(true)} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">
            Reset password
          </button>
        )}
        {resetState.error ? <p className="text-xs text-red-600 dark:text-red-400">{resetState.error}</p> : null}
      </div>
    );
  }

  return (
    <form action={createAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="studentId" value={studentId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Parent&apos;s phone number (becomes the password)</label>
        <input name="parentPhone" defaultValue={defaultParentPhone} required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" disabled={createPending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Create student login
      </button>
      {createState.error ? <span className="text-sm text-red-600 dark:text-red-400">{createState.error}</span> : null}
    </form>
  );
}
