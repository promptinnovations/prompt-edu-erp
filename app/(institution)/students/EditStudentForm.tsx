"use client";

import { useActionState, useState } from "react";
import { updateStudentAction } from "./actions";

/** §137 follow-up ("should be able edit ...") — edits the student's own
 *  fields (admission number, name, date of birth, gender). Class/section
 *  reassignment stays in EnrollForm (a separate, already-existing
 *  concern — see student_enrollments' own history-of-enrollments model in
 *  modules/students/service.ts, not a plain field on `students`). */
export default function EditStudentForm({
  studentId, admissionNumber, fullName, dateOfBirth, gender,
}: {
  studentId: string; admissionNumber: string; fullName: string; dateOfBirth: string | null; gender: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateStudentAction, { error: null });

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
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 p-3">
      <input type="hidden" name="studentId" value={studentId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Admission number</label>
        <input name="admissionNumber" defaultValue={admissionNumber} required className="w-32 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Full name</label>
        <input name="fullName" defaultValue={fullName} required className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Date of birth</label>
        <input type="date" name="dateOfBirth" defaultValue={dateOfBirth ?? ""} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Gender</label>
        <select name="gender" defaultValue={gender ?? ""} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          <option value="">—</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm text-zinc-500 hover:text-zinc-700">
        Cancel
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
