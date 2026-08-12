"use client";

import { useActionState } from "react";
import { recordCharacterAssessmentAction } from "./actions";

export interface CharacterAssessmentRow {
  id: string; student_id: string; attribute_name: string; period: string; rating: number; notes: string | null;
}

export default function CharacterAssessmentForm({
  students, attributes, assessments, canRecord,
}: {
  students: Array<{ id: string; full_name: string }>;
  attributes: Array<{ id: string; name: string }>;
  assessments: CharacterAssessmentRow[];
  canRecord: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(recordCharacterAssessmentAction, { error: null });
  const studentNameById = new Map(students.map((s) => [s.id, s.full_name]));

  return (
    <div className="space-y-4">
      {canRecord ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Student</label>
            <select name="studentId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Attribute</label>
            <select name="attributeId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              {attributes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Period</label>
            <input name="period" required placeholder="Term 1" className="w-24 rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Rating (1-5)</label>
            <input type="number" name="rating" min={1} max={5} required className="w-20 rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-500">Notes</label>
            <input name="notes" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
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
            <th className="py-1.5">Student</th>
            <th className="py-1.5">Attribute</th>
            <th className="py-1.5">Period</th>
            <th className="py-1.5">Rating</th>
            <th className="py-1.5">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {assessments.map((a) => (
            <tr key={a.id}>
              <td className="py-1.5">{studentNameById.get(a.student_id) ?? "—"}</td>
              <td className="py-1.5">{a.attribute_name}</td>
              <td className="py-1.5 text-zinc-500">{a.period}</td>
              <td className="py-1.5">{a.rating} / 5</td>
              <td className="py-1.5 text-zinc-500">{a.notes || "—"}</td>
            </tr>
          ))}
          {assessments.length === 0 ? (
            <tr><td colSpan={5} className="py-4 text-center text-zinc-400">No character assessments yet.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
