"use client";

import { useActionState } from "react";
import { createTeacherAssignmentAction } from "./actions";

export interface AssignmentRow {
  id: string; teacher_name: string; class_name: string; section_name: string | null;
  subject_name: string | null; role_type: string;
}

export default function TeacherAssignmentForm({
  teachers, classes, sections, subjects, academicYearId, assignments, canManage,
}: {
  teachers: Array<{ userId: string; full_name: string }>;
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; class_id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  academicYearId: string;
  assignments: AssignmentRow[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createTeacherAssignmentAction, { error: null });

  return (
    <div className="space-y-4">
      {canManage ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="academicYearId" value={academicYearId} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Teacher</label>
            <select name="userId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
              {teachers.map((t) => <option key={t.userId} value={t.userId}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class</label>
            <select name="classId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Section (optional)</label>
            <select name="sectionId" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
              <option value="">—</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Subject (optional)</label>
            <select name="subjectId" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
              <option value="">—</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Role</label>
            <select name="roleType" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
              <option value="subject_teacher">Subject teacher</option>
              <option value="class_teacher">Class teacher</option>
            </select>
          </div>
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Assign
          </button>
          {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
        </form>
      ) : null}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <tr>
            <th className="py-1.5">Teacher</th>
            <th className="py-1.5">Class / Section</th>
            <th className="py-1.5">Subject</th>
            <th className="py-1.5">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {assignments.map((a) => (
            <tr key={a.id}>
              <td className="py-1.5">{a.teacher_name}</td>
              <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{a.class_name}{a.section_name ? ` — ${a.section_name}` : ""}</td>
              <td className="py-1.5">{a.subject_name ?? "—"}</td>
              <td className="py-1.5 capitalize">{a.role_type.replace("_", " ")}</td>
            </tr>
          ))}
          {assignments.length === 0 ? (
            <tr><td colSpan={4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No teacher assignments yet.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
