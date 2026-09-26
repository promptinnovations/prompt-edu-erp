"use client";

import { useActionState, useState } from "react";
import { updateClassAction, deleteClassAction } from "./actions";
import ConfirmSubmitButton from "../../components/ui/ConfirmSubmitButton";

/** §137 follow-up ("should be able edit, delete, search") — inline
 *  edit/delete for one class row on the Academic Setup page. Delete is a
 *  hard DELETE at the database layer (see deleteClass() in
 *  modules/academic/service.ts) guarded server-side against classes that
 *  still have actively enrolled students, so the confirm() here is just a
 *  first line of defense against a stray click, not the only guard. */
export default function ClassRow({
  classId, name, sectionsLabel, canManage, stage,
}: {
  classId: string; name: string; sectionsLabel: string; canManage: boolean; stage?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState<{ error: string | null }, FormData>(updateClassAction, { error: null });
  const [deleteState, deleteAction, deletePending] = useActionState<{ error: string | null }, FormData>(deleteClassAction, { error: null });

  if (editing) {
    return (
      <li className="py-2">
        <form
          action={updateAction}
          className="flex flex-wrap items-center gap-2"
          onSubmit={() => setEditing(false)}
        >
          <input type="hidden" name="classId" value={classId} />
          <input autoComplete="off"
            name="name"
            defaultValue={name}
            required
            className="rounded-full border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          />
          <input autoComplete="off"
            name="stage"
            defaultValue={stage ?? ""}
            placeholder="Stage (LP/UP/HS/HSS)"
            className="w-32 rounded-full border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
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
      <span>{name}{stage ? <span className="ml-2 text-xs text-zinc-500">({stage})</span> : null}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">{sectionsLabel}</span>
        {canManage ? (
          <>
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">
              Edit
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="classId" value={classId} />
              <ConfirmSubmitButton
                message={`Delete class "${name}"? This can't be undone.`}
                disabled={deletePending}
                className="text-xs text-red-600 underline hover:text-red-800 disabled:opacity-50"
              >
                Delete
              </ConfirmSubmitButton>
            </form>
          </>
        ) : null}
      </span>
      {deleteState.error ? <span className="text-xs text-red-600">{deleteState.error}</span> : null}
    </li>
  );
}
