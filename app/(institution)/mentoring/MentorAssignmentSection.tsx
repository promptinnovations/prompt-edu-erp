"use client";

import { useActionState } from "react";
import { createMentorAssignmentAction, toggleMentorAssignmentActiveAction } from "./actions";

const INIT = { error: null as string | null };

export interface AssignmentRow {
  id: string; mentorStaffId: string; mentorName: string;
  studentId: string | null; studentName: string | null;
  classId: string | null; className: string | null;
  isActive: boolean;
}

function AssignmentRowItem({ a }: { a: AssignmentRow }) {
  const [, toggleAction] = useActionState(toggleMentorAssignmentActiveAction, INIT);
  return (
    <tr>
      <td className="py-1.5">{a.mentorName}</td>
      <td className="py-1.5">{a.studentName ? a.studentName : <span className="text-zinc-500 dark:text-zinc-400">Whole class: {a.className}</span>}</td>
      <td className="py-1.5">{a.isActive ? <span className="text-emerald-700 dark:text-emerald-400">Active</span> : <span className="text-zinc-400">Deactivated</span>}</td>
      <td className="py-1.5">
        <form action={toggleAction}>
          <input type="hidden" name="assignmentId" value={a.id} />
          <input type="hidden" name="isActive" value={a.isActive ? "false" : "true"} />
          <button type="submit" className={`text-xs underline ${a.isActive ? "text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300" : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300"}`}>
            {a.isActive ? "Deactivate" : "Reactivate"}
          </button>
        </form>
      </td>
    </tr>
  );
}

export default function MentorAssignmentSection({
  mentors, students, classes, assignments,
}: {
  mentors: Array<{ id: string; full_name: string }>;
  students: Array<{ id: string; full_name: string }>;
  classes: Array<{ id: string; name: string }>;
  assignments: AssignmentRow[];
}) {
  const [state, action] = useActionState(createMentorAssignmentAction, INIT);

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Assign a mentor to one student, or to an entire class (every student currently enrolled). The assigned
        mentor is then the only staff member who can record follow-ups for that student.
      </p>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Mentor (staff)</label>
          <select name="mentorStaffId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
            {mentors.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Assign to student</label>
          <select name="studentId" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
            <option value="">—</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <span className="pb-2 text-xs text-zinc-400">or</span>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Assign to whole class</label>
          <select name="classId" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
            <option value="">—</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
          Assign
        </button>
      </form>
      {state.error ? <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr><th className="py-1.5">Mentor</th><th className="py-1.5">Assigned to</th><th className="py-1.5">Status</th><th className="py-1.5"></th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {assignments.map((a) => <AssignmentRowItem key={a.id} a={a} />)}
            {assignments.length === 0 ? <tr><td colSpan={4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No mentor assignments yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
