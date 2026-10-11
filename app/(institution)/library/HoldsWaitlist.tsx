"use client";

import { useActionState } from "react";
import { cancelHoldAdminAction } from "./actions";

export interface HoldRow { id: string; book_title: string; student_name: string; status: string; requested_at: string }

function CancelButton({ holdId }: { holdId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(cancelHoldAdminAction, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="holdId" value={holdId} />
      <button type="submit" disabled={pending} className="text-xs text-red-600 underline disabled:opacity-50">Cancel</button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

/** §Page-8 follow-up — the librarian's waitlist view. Notification is
 *  automatic (returnBook() handles it), this is purely visibility + a
 *  manual cancel for stale/obsolete holds. */
export default function HoldsWaitlist({ holds }: { holds: HoldRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
          <tr>
            <th className="py-1.5">Book</th>
            <th className="py-1.5">Student</th>
            <th className="py-1.5">Status</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {holds.map((h) => (
            <tr key={h.id}>
              <td className="py-1.5">{h.book_title}</td>
              <td className="py-1.5">{h.student_name} <span className="text-xs text-zinc-400">· {new Date(h.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></td>
              <td className="py-1.5">
                <span className={`rounded-full px-2 py-0.5 text-xs ${h.status === "notified" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {h.status === "notified" ? "Ready to collect" : "Waiting for a return"}
                </span>
              </td>
              <td className="py-1.5"><CancelButton holdId={h.id} /></td>
            </tr>
          ))}
          {holds.length === 0 ? (
            <tr><td colSpan={4} className="py-4 text-center text-zinc-500">No bookings right now.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
