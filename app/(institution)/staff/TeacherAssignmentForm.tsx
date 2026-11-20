"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createTeacherAssignmentAction, changeAssignmentTeacherAction, removeTeacherAssignmentAction,
} from "./actions";

export interface AssignmentRow {
  id: string; user_id?: string; teacher_name: string; class_name: string; section_name: string | null;
  subject_name: string | null; role_type: string;
}

const field = "rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400";

/** One assignment row. "Change" swaps the teacher (e.g. Maths 5A moves to
 *  another teacher — subject, class, division and role stay); "Remove"
 *  deletes the assignment after an inline confirmation. */
function AssignmentRowView({
  a, teachers, canManage,
}: { a: AssignmentRow; teachers: Array<{ userId: string; full_name: string }>; canManage: boolean }) {
  const [mode, setMode] = useState<"view" | "change" | "remove">("view");
  const [changeState, changeAction, changing] = useActionState<{ error: string | null }, FormData>(changeAssignmentTeacherAction, { error: null });
  const [removeState, removeAction, removing] = useActionState<{ error: string | null }, FormData>(removeTeacherAssignmentAction, { error: null });
  const error = changeState.error ?? removeState.error;

  return (
    <tr className="align-top">
      <td className="py-1.5">{a.teacher_name}</td>
      <td className="py-1.5 text-zinc-500">{a.class_name}{a.section_name ? ` — ${a.section_name}` : " (all divisions)"}</td>
      <td className="py-1.5">{a.subject_name ?? "—"}</td>
      <td className="py-1.5 capitalize">{a.role_type.replace("_", " ")}</td>
      {canManage ? (
        <td className="py-1.5 text-right">
          {mode === "view" ? (
            <span className="whitespace-nowrap text-xs">
              <button type="button" onClick={() => setMode("change")} className="text-indigo-600 underline hover:text-indigo-800">Change teacher</button>
              <span className="mx-1.5 text-zinc-300">|</span>
              <button type="button" onClick={() => setMode("remove")} className="text-red-600 underline hover:text-red-800">Remove</button>
            </span>
          ) : mode === "change" ? (
            <form action={changeAction} className="inline-flex flex-wrap items-center justify-end gap-1.5">
              <input type="hidden" name="assignmentId" value={a.id} />
              <select name="userId" defaultValue={a.user_id} className="rounded-full border px-2 py-1 text-xs">
                {teachers.map((t) => <option key={t.userId} value={t.userId}>{t.full_name}</option>)}
              </select>
              <button type="submit" disabled={changing} className="rounded-full bg-[var(--brand)] px-2 py-1 text-xs text-white disabled:opacity-50">
                {changing ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setMode("view")} className="text-xs text-zinc-500">Cancel</button>
            </form>
          ) : (
            <form action={removeAction} className="inline-flex items-center justify-end gap-1.5 text-xs">
              <input type="hidden" name="assignmentId" value={a.id} />
              <span className="text-zinc-600">Remove this assignment?</span>
              <button type="submit" disabled={removing} className="rounded-full bg-red-600 px-2 py-1 text-white disabled:opacity-50">
                {removing ? "Removing…" : "Yes, remove"}
              </button>
              <button type="button" onClick={() => setMode("view")} className="text-zinc-500">No</button>
            </form>
          )}
          {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
        </td>
      ) : null}
    </tr>
  );
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
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const classSections = sections.filter((s) => s.class_id === classId);
  const shown = useMemo(() => assignments.filter((a) =>
    (!teacherFilter || a.teacher_name === teacherFilter) && (!classFilter || a.class_name === classFilter)
  ), [assignments, teacherFilter, classFilter]);
  const teacherNames = useMemo(() => [...new Set(assignments.map((a) => a.teacher_name))].sort((x, y) => x.localeCompare(y)), [assignments]);

  return (
    <div className="space-y-4">
      {canManage ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="academicYearId" value={academicYearId} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Teacher</label>
            <select name="userId" required className={field}>
              {teachers.map((t) => <option key={t.userId} value={t.userId}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Class</label>
            <select name="classId" required value={classId} onChange={(e) => setClassId(e.target.value)} className={field}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Division (optional)</label>
            <select name="sectionId" key={classId} className={field}>
              <option value="">All divisions</option>
              {classSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Subject (optional)</label>
            <select name="subjectId" className={field}>
              <option value="">—</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Role</label>
            <select name="roleType" className={field}>
              <option value="subject_teacher">Subject teacher</option>
              <option value="class_teacher">Class teacher</option>
            </select>
          </div>
          <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Assign
          </button>
          {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        </form>
      ) : null}

      {assignments.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Show teacher</label>
            <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className={field}>
              <option value="">All teachers</option>
              {teacherNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Show class</label>
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={field}>
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <span className="pb-2 text-xs text-zinc-500">{shown.length} of {assignments.length} assignments</span>
        </div>
      ) : null}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
          <tr>
            <th className="py-1.5">Teacher</th>
            <th className="py-1.5">Class / Division</th>
            <th className="py-1.5">Subject</th>
            <th className="py-1.5">Role</th>
            {canManage ? <th className="py-1.5" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y">
          {shown.map((a) => <AssignmentRowView key={a.id} a={a} teachers={teachers} canManage={canManage} />)}
          {assignments.length === 0 ? (
            <tr><td colSpan={5} className="py-4 text-center text-zinc-500">No teacher assignments yet.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
