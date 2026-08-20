"use client";

import { useActionState } from "react";
import { approveLeaveAction, rejectLeaveAction } from "./actions";

export interface StaffLeaveReviewRow {
  id: string; applicant_name: string; start_date: string; end_date: string; reason: string | null; status: string;
}

function ReviewButton({ action, label, leaveId }: { action: typeof approveLeaveAction; label: string; leaveId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(action, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="leaveId" value={leaveId} />
      <button type="submit" disabled={pending} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

/** Principal/admin-only review table for staff leave (§Page-4 follow-up
 *  "principal for staff...will approve") — read + Approve/Reject only, no
 *  apply-on-behalf form (that UI is retired; staff apply for themselves via
 *  MyLeaveSection now). Reuses the exact same generic approveLeaveAction/
 *  rejectLeaveAction the student leave table uses — canReviewLeaveApplication()
 *  already refuses these for anyone without unrestricted attendance.edit, so
 *  this component doesn't need its own authorization logic, only its own
 *  visibility gate (rendered by the caller only when hasUnrestrictedEdit). */
export default function StaffLeaveReviewTable({ leaves }: { leaves: StaffLeaveReviewRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <tr>
            <th className="py-1.5">Staff</th>
            <th className="py-1.5">Dates</th>
            <th className="py-1.5">Reason</th>
            <th className="py-1.5">Status</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {leaves.map((l) => (
            <tr key={l.id}>
              <td className="py-1.5">{l.applicant_name}</td>
              <td className="py-1.5">{l.start_date} → {l.end_date}</td>
              <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{l.reason || "—"}</td>
              <td className="py-1.5 capitalize">{l.status}</td>
              <td className="py-1.5">
                {l.status === "pending" ? (
                  <div className="flex gap-1">
                    <ReviewButton action={approveLeaveAction} label="Approve" leaveId={l.id} />
                    <ReviewButton action={rejectLeaveAction} label="Reject" leaveId={l.id} />
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
          {leaves.length === 0 ? (
            <tr><td colSpan={5} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No pending staff leave applications.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
