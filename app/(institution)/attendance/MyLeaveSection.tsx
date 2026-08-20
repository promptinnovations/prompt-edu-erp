"use client";

import { useActionState } from "react";
import { applyForOwnLeaveAction } from "./actions";

export interface MyLeaveRow {
  id: string; start_date: string; end_date: string; reason: string | null; status: string;
}

/** Self-service "My leave" (§Page-4 follow-up) — every staff member applies
 *  for their OWN leave here (no picking a name from a list, unlike the old
 *  admin-side form this replaces), and sees their own application history,
 *  read-only. Approval happens elsewhere (StaffLeaveReviewTable, principal-
 *  only) — this component never shows Approve/Reject controls, even to an
 *  admin viewing their own leave. */
export default function MyLeaveSection({ leaves }: { leaves: MyLeaveRow[] }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(applyForOwnLeaveAction, { error: null });

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">From</label>
          <input type="date" name="startDate" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">To</label>
          <input type="date" name="endDate" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Reason</label>
          <input name="reason" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
        </div>
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Apply
        </button>
        {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Dates</th>
              <th className="py-1.5">Reason</th>
              <th className="py-1.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {leaves.map((l) => (
              <tr key={l.id}>
                <td className="py-1.5">{l.start_date} → {l.end_date}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{l.reason || "—"}</td>
                <td className="py-1.5 capitalize">{l.status}</td>
              </tr>
            ))}
            {leaves.length === 0 ? (
              <tr><td colSpan={3} className="py-4 text-center text-zinc-400 dark:text-zinc-500">You haven&apos;t applied for leave yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
