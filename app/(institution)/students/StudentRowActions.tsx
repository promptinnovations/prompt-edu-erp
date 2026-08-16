"use client";

import { useActionState } from "react";
import { deleteStudentAction, restoreStudentAction } from "./actions";

/** §137 follow-up ("should be able ... delete") — Delete/Restore for one
 *  row on the students list. Delete is a soft-delete (status set to
 *  'withdrawn' — see modules/students/service.ts's deleteStudent()), so
 *  it's reversible via Restore rather than a one-way destructive action,
 *  and the confirm() below is a lighter-weight check than deleteClass()'s
 *  equivalent for that reason. */
export default function StudentRowActions({
  studentId, fullName, withdrawn, canDelete, canManage,
}: {
  studentId: string; fullName: string; withdrawn: boolean; canDelete: boolean; canManage: boolean;
}) {
  const [deleteState, deleteAction, deletePending] = useActionState<{ error: string | null }, FormData>(deleteStudentAction, { error: null });
  const [restoreState, restoreAction, restorePending] = useActionState<{ error: string | null }, FormData>(restoreStudentAction, { error: null });

  if (withdrawn) {
    if (!canManage) return null;
    return (
      <form action={restoreAction}>
        <input type="hidden" name="studentId" value={studentId} />
        <button type="submit" disabled={restorePending} className="text-sm text-emerald-700 dark:text-emerald-400 underline hover:text-emerald-900 dark:hover:text-emerald-300 disabled:opacity-50">
          Restore
        </button>
        {restoreState.error ? <span className="ml-2 text-xs text-red-600 dark:text-red-400">{restoreState.error}</span> : null}
      </form>
    );
  }

  if (!canDelete) return null;
  return (
    <form
      action={deleteAction}
      onSubmit={(e) => {
        if (!confirm(`Remove ${fullName} from the active students list? This can be undone from "Show removed students".`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="studentId" value={studentId} />
      <button type="submit" disabled={deletePending} className="text-sm text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50">
        Delete
      </button>
      {deleteState.error ? <span className="ml-2 text-xs text-red-600 dark:text-red-400">{deleteState.error}</span> : null}
    </form>
  );
}
