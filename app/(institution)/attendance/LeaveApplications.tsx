"use client";

import { useActionState } from "react";
import { approveLeaveAction, rejectLeaveAction } from "./actions";

export interface LeaveRow {
  id: string; applicant_type: string; applicant_id: string; applicant_name: string;
  start_date: string; end_date: string; reason: string | null; status: string;
  /** Per-row, not blanket — an institution_admin/management reviewer sees
   *  true on every row; a class-teacher reviewer sees true only on rows for
   *  their own assigned class (§D.6 follow-up "class teacher can sanction
   *  it" — computed server-side in page.tsx via canReviewLeaveApplication()). */
  canReview: boolean;
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

/** §Page-4-follow-up-2 "There should not be the area for filling, only
 *  showcase applied leaves... no room for entering leaves": this table is
 *  now READ-ONLY. Students/parents apply for their own leave from the
 *  parent portal (ApplyLeaveForm.tsx, attendance.leave.apply) — staff no
 *  longer get a "fill in a leave on a student's behalf" form on this page;
 *  it only shows what was already applied, plus the class teacher's own
 *  review (Approve/Reject). */
export default function LeaveApplications({
  leaves,
}: {
  leaves: LeaveRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <tr>
            <th className="py-1.5">Applicant</th>
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
                {l.canReview && l.status === "pending" ? (
                  <div className="flex gap-1">
                    <ReviewButton action={approveLeaveAction} label="Approve" leaveId={l.id} />
                    <ReviewButton action={rejectLeaveAction} label="Reject" leaveId={l.id} />
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
          {leaves.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-center text-zinc-400 dark:text-zinc-500">—</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
