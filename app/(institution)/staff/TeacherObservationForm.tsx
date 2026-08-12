"use client";

import { useActionState } from "react";
import { recordTeacherObservationAction } from "./actions";

export interface ObservationRow {
  id: string; teacher_id: string; date: string; overall_notes: string | null; follow_up_notes: string | null;
}

export default function TeacherObservationForm({
  teachers, observations, canManage,
}: {
  teachers: Array<{ id: string; full_name: string }>;
  observations: ObservationRow[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(recordTeacherObservationAction, { error: null });
  const teacherNameById = new Map(teachers.map((t) => [t.id, t.full_name]));

  return (
    <div className="space-y-4">
      {canManage ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Teacher</label>
            <select name="teacherId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Date</label>
            <input type="date" name="date" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-500">Notes</label>
            <input name="overallNotes" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-500">Follow-up</label>
            <input name="followUpNotes" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Record
          </button>
          {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        </form>
      ) : null}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="py-1.5">Teacher</th>
            <th className="py-1.5">Date</th>
            <th className="py-1.5">Notes</th>
            <th className="py-1.5">Follow-up</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {observations.map((o) => (
            <tr key={o.id}>
              <td className="py-1.5">{teacherNameById.get(o.teacher_id) ?? "—"}</td>
              <td className="py-1.5 text-zinc-500">{o.date}</td>
              <td className="py-1.5">{o.overall_notes || "—"}</td>
              <td className="py-1.5 text-zinc-500">{o.follow_up_notes || "—"}</td>
            </tr>
          ))}
          {observations.length === 0 ? (
            <tr><td colSpan={4} className="py-4 text-center text-zinc-400">No observations recorded yet.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
