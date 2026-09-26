"use client";
import { nowISTYear } from "../../../services/datetime/ist";

import { useActionState } from "react";
import { computeConsolidatedScoreAction } from "./actions";

export default function ComputeScoreForm({
  students,
}: {
  students: Array<{ id: string; full_name: string }>;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(computeConsolidatedScoreAction, { error: null });
  const currentYear = nowISTYear();

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Student</label>
        <select name="studentId" required className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Period label</label>
        <input autoComplete="off" name="period" required defaultValue={`${currentYear} Consolidated`} className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">From date</label>
        <input autoComplete="off" type="date" name="fromDate" required defaultValue={`${currentYear}-01-01`} className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">To date</label>
        <input autoComplete="off" type="date" name="toDate" required defaultValue={`${currentYear}-12-31`} className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Compute
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
