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
            <label className="mb-1 block text-xs text-zinc-500">Teacher</label>
            <select name="userId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              {teachers.map((t) => <option key={t.userId} value={t.userId}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Class</label>
            <select name="classId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Section (optional)</label>
            <select name="sectionId" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              <option value="">—</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Subject (optional)</label>
            <select name="subjectId" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              <option value="">—</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Role</label>
            <select name="roleType" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              <option value="subject_teacher">Subject teacher</option>
              <option value="class_teacher">Class teacher</option>
            </select>
          </div>
          <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Assign
          </button>
          {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        </form>
      ) : null}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="py-1.5">Teacher</th>
            <th className="py-1.5">Class / Section</th>
            <th className="py-1.5">Subject</th>
            <th className="py-1.5">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {assignments.map((a) => (
            <tr key={a.id}>
              <td className="py-1.5">{a.teacher_name}</td>
              <td className="py-1.5 text-zinc-500">{a.class_name}{a.section_name ? ` — ${a.section_name}` : ""}</td>
              <td className="py-1.5">{a.subject_name ?? "—"}</td>
              <td className="py-1.5 capitalize">{a.role_type.replace("_", " ")}</td>
            </tr>
          ))}
          {assignments.length === 0 ? (
            <tr><td colSpan={4} className="py-4 text-center text-zinc-400">No teacher assignments yet.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
