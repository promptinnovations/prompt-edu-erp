"use client";

import { useActionState, useState } from "react";
import { updateStaffAction } from "./actions";

/** §Staff-edit follow-up ("editing student and staff details" option) --
 *  edits the staff member's own fields (staff code, name, designation,
 *  department, employment status). Mirrors students' EditStudentForm.tsx
 *  exactly (same collapsed-button -> inline-form -> Save/Cancel pattern).
 *  Class/subject assignment stays in TeacherAssignmentForm (a separate,
 *  already-existing concern), same reasoning as EditStudentForm's own
 *  note about EnrollForm. */
export default function EditStaffForm({
  staffId, staffCode, fullName, designation, department, employmentStatus,
}: {
  staffId: string; staffCode: string; fullName: string;
  designation: string | null; department: string | null; employmentStatus: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateStaffAction, { error: null });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm text-zinc-600 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        Edit details
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
      <input type="hidden" name="staffId" value={staffId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Staff code</label>
        <input name="staffCode" defaultValue={staffCode} required className="w-32 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Full name</label>
        <input name="fullName" defaultValue={fullName} required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Designation</label>
        <input name="designation" defaultValue={designation ?? ""} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Department</label>
        <input name="department" defaultValue={department ?? ""} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Employment status</label>
        <select name="employmentStatus" defaultValue={employmentStatus} className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          <option value="active">Active</option>
          <option value="on_leave">On leave</option>
          <option value="resigned">Resigned</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200">
        Cancel
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
