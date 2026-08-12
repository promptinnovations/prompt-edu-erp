"use client";

import { useActionState } from "react";
import { createDisciplineRecordAction, recordDisciplineFollowUpAction } from "./actions";

export interface DisciplineRow {
  id: string; student_name: string; category_name: string; is_positive: boolean;
  date: string; description: string | null; follow_up_notes: string | null;
}

function FollowUpForm({ disciplineRecordId }: { disciplineRecordId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(recordDisciplineFollowUpAction, { error: null });
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="disciplineRecordId" value={disciplineRecordId} />
      <input name="followUpNotes" placeholder="Follow-up note" className="rounded-md border border-zinc-300 px-2 py-1 text-xs" />
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
        Save
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

export default function DisciplineRecordForm({
  students, categories, records, canRecord,
}: {
  students: Array<{ id: string; full_name: string }>;
  categories: Array<{ id: string; name: string; is_positive: boolean }>;
  records: DisciplineRow[];
  canRecord: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createDisciplineRecordAction, { error: null });

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
            <label className="mb-1 block text-xs text-zinc-500">Category</label>
            <select name="categoryId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} {c.is_positive ? "(+)" : "(-)"}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Date</label>
            <input type="date" name="date" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-500">Description</label>
            <input name="description" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
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
            <th className="py-1.5">Category</th>
            <th className="py-1.5">Date</th>
            <th className="py-1.5">Description</th>
            <th className="py-1.5">Follow-up</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {records.map((r) => (
            <tr key={r.id}>
              <td className="py-1.5">{r.student_name}</td>
              <td className="py-1.5">
                <span className={r.is_positive ? "text-emerald-700" : "text-red-700"}>{r.category_name}</span>
              </td>
              <td className="py-1.5 text-zinc-500">{r.date}</td>
              <td className="py-1.5">{r.description || "—"}</td>
              <td className="py-1.5">
                {r.follow_up_notes ? r.follow_up_notes : canRecord ? <FollowUpForm disciplineRecordId={r.id} /> : "—"}
              </td>
            </tr>
          ))}
          {records.length === 0 ? (
            <tr><td colSpan={5} className="py-4 text-center text-zinc-400">No discipline records yet.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
