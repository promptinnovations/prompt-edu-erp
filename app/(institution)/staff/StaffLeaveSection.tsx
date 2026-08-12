"use client";

import { useActionState } from "react";
import { applyForStaffLeaveAction, approveStaffLeaveAction, rejectStaffLeaveAction } from "./actions";

export interface StaffLeaveRow {
  id: string; applicant_id: string; applicant_name: string;
  start_date: string; end_date: string; reason: string | null; status: string;
}

function ReviewButton({ action, label, leaveId }: { action: typeof approveStaffLeaveAction; label: string; leaveId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(action, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="leaveId" value={leaveId} />
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

export default function StaffLeaveSection({
  leaves, staff, canApply, canReview,
}: {
  leaves: StaffLeaveRow[]; staff: Array<{ id: string; full_name: string }>; canApply: boolean; canReview: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(applyForStaffLeaveAction, { error: null });

  return (
    <div className="space-y-4">
      {canApply ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Staff member</label>
            <select name="staffId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">From</label>
            <input type="date" name="startDate" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">To</label>
            <input type="date" name="endDate" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-500">Reason</label>
            <input name="reason" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Apply
          </button>
          {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        </form>
      ) : null}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="py-1.5">Staff</th>
            <th className="py-1.5">Dates</th>
            <th className="py-1.5">Reason</th>
            <th className="py-1.5">Status</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {leaves.map((l) => (
            <tr key={l.id}>
              <td className="py-1.5">{l.applicant_name}</td>
              <td className="py-1.5">{l.start_date} → {l.end_date}</td>
              <td className="py-1.5 text-zinc-500">{l.reason || "—"}</td>
              <td className="py-1.5 capitalize">{l.status}</td>
              <td className="py-1.5">
                {canReview && l.status === "pending" ? (
                  <div className="flex gap-1">
                    <ReviewButton action={approveStaffLeaveAction} label="Approve" leaveId={l.id} />
                    <ReviewButton action={rejectStaffLeaveAction} label="Reject" leaveId={l.id} />
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
          {leaves.length === 0 ? (
            <tr><td colSpan={5} className="py-4 text-center text-zinc-400">—</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
