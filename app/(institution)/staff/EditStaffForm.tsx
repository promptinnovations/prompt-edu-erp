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
        className="text-sm text-zinc-600 underline hover:text-zinc-900"
      >
        Edit details
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 rounded-card border p-3">
      <input type="hidden" name="staffId" value={staffId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Staff code</label>
        <input autoComplete="off" name="staffCode" defaultValue={staffCode} required className="w-32 rounded-full border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Full name</label>
        <input autoComplete="off" name="fullName" defaultValue={fullName} required className="rounded-full border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Designation</label>
        <input autoComplete="off" name="designation" defaultValue={designation ?? ""} className="rounded-full border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Department</label>
        <input autoComplete="off" name="department" defaultValue={department ?? ""} className="rounded-full border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Employment status</label>
        <select name="employmentStatus" defaultValue={employmentStatus} className="rounded-full border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          <option value="active">Active</option>
          <option value="on_leave">On leave</option>
          <option value="resigned">Resigned</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm text-zinc-500 hover:text-zinc-700">
        Cancel
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
