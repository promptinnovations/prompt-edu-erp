"use client";

import { useActionState, useState } from "react";
import { updateSectionAction, deleteSectionAction } from "./actions";

export default function SectionRow({
  sectionId, classLabel, name, canManage,
}: {
  sectionId: string; classLabel: string; name: string; canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState<{ error: string | null }, FormData>(updateSectionAction, { error: null });
  const [deleteState, deleteAction, deletePending] = useActionState<{ error: string | null }, FormData>(deleteSectionAction, { error: null });

  if (editing) {
    return (
      <li className="py-2">
        <form action={updateAction} className="flex flex-wrap items-center gap-2" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="sectionId" value={sectionId} />
          <span className="text-zinc-500">{classLabel} —</span>
          <input
            name="name"
            defaultValue={name}
            required
            className="w-20 rounded-full border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          />
          <button type="submit" disabled={updatePending} className="rounded-full border px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-700">
            Cancel
          </button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600">{updateState.error}</span> : null}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span>{classLabel} — {name}</span>
      {canManage ? (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">
            Edit
          </button>
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!confirm(`Delete division "${classLabel} — ${name}"? This can't be undone.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="sectionId" value={sectionId} />
            <button type="submit" disabled={deletePending} className="text-xs text-red-600 underline hover:text-red-800 disabled:opacity-50">
              Delete
            </button>
          </form>
        </span>
      ) : null}
      {deleteState.error ? <span className="text-xs text-red-600">{deleteState.error}</span> : null}
    </li>
  );
}
