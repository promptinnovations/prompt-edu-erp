"use client";

import { useActionState, useState } from "react";
import { updateInstitutionNameAction } from "./actions";

/** Super Admin console's Name column — inline-editable, same pattern as
 *  InstitutionUrlCell's code edit beside it. Until this existed, an
 *  institution's display name (shown in its sidebar, Settings, report
 *  cards, login screen, etc. wherever its own `appName` isn't set) was
 *  create-time-only: fixing a typo or renaming an institution afterwards
 *  (e.g. "B CareExc Science" -> "B CareExc Science Home") had no in-app
 *  path at all — exactly the direct-database-edit shortcut §K says to
 *  avoid. */
export default function InstitutionNameCell({ institutionId, name }: { institutionId: string; name: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateInstitutionNameAction, { error: null });
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form
        action={formAction}
        className="flex items-center gap-1"
        onSubmit={() => {
          // Optimistic exit, matching InstitutionUrlCell — a real error
          // re-shows below via state.error without re-entering edit mode.
          setEditing(false);
        }}
      >
        <input type="hidden" name="institutionId" value={institutionId} />
        <input
          name="name"
          defaultValue={name}
          required
          minLength={2}
          maxLength={200}
          className="w-40 rounded-full border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        />
        <button type="submit" disabled={pending} className="rounded-full border px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-700">
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-zinc-900">{name}</span>
        <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs text-zinc-500 underline hover:text-zinc-700">
          Edit
        </button>
      </div>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </div>
  );
}
