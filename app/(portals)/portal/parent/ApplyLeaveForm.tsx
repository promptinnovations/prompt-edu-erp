"use client";

import { useActionState } from "react";
import { applyLeaveForChildAction } from "./actions";

export interface ParentLeaveRow {
  id: string; start_date: string; end_date: string; reason: string | null; status: string;
}

export default function ApplyLeaveForm({
  studentId,
  studentName,
  leaves,
}: {
  studentId: string;
  studentName: string;
  leaves: ParentLeaveRow[];
}) {
  const [state, formAction, pending] = useActionState(applyLeaveForChildAction, { error: null });

  return (
    <div className="rounded-card border bg-white p-6">
      <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">
        Apply for leave — {studentName}
      </h2>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="studentId" value={studentId} />
        <div>
          <label className="mb-1 block text-xs text-zinc-500">From</label>
          <input type="date" name="startDate" required className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">To</label>
          <input type="date" name="endDate" required className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label className="mb-1 block text-xs text-zinc-500">Reason</label>
          <input name="reason" className="w-full rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
        </div>
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Apply
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </form>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
            <tr>
              <th className="py-1.5">Dates</th>
              <th className="py-1.5">Reason</th>
              <th className="py-1.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {leaves.map((l) => (
              <tr key={l.id}>
                <td className="py-1.5">{l.start_date} → {l.end_date}</td>
                <td className="py-1.5 text-zinc-500">{l.reason || "—"}</td>
                <td className="py-1.5 capitalize">{l.status}</td>
              </tr>
            ))}
            {leaves.length === 0 ? (
              <tr><td colSpan={3} className="py-4 text-center text-zinc-500">No leave applications yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
