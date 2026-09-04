"use client";

import { useActionState } from "react";
import { markOwnAttendanceAction } from "./actions";

export interface OwnAttendanceStatusOption { id: string; label: string; is_default: boolean }

/** Self-service "My attendance" (§415 "each staff mark own attendance and
 *  principal approve it") — a staff member marks TODAY's attendance here;
 *  the principal approves it simply by Saving the staff attendance grid on
 *  /staff (see markStaffAttendance()'s own comment). Mirrors
 *  MyLeaveSection.tsx's shape: a small submit form plus a read-only status
 *  line, no approve/reject controls here even for an admin viewing their
 *  own row. */
export default function MyAttendanceSection({
  today, statuses, existing,
}: {
  today: string;
  statuses: OwnAttendanceStatusOption[];
  existing: { status_label: string; approval_status: "pending" | "approved" } | null;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(
    markOwnAttendanceAction, { error: null }
  );
  const defaultStatusId = statuses.find((s) => s.is_default)?.id ?? statuses[0]?.id ?? "";

  return (
    <div className="space-y-3">
      {existing ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Today ({today}): marked as <span className="font-medium text-zinc-800 dark:text-zinc-200">{existing.status_label}</span>
          {existing.approval_status === "pending" ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              Pending approval
            </span>
          ) : (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              Approved
            </span>
          )}
        </p>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">You haven&apos;t marked today&apos;s attendance yet.</p>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="date" value={today} />
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Status</label>
          <select
            name="statusId"
            defaultValue={defaultStatusId}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {existing ? "Update my attendance" : "Mark my attendance"}
        </button>
        {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      </form>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Awaiting the principal&apos;s approval on the Staff attendance grid. You can update this until then.
      </p>
    </div>
  );
}
