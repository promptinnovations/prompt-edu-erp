"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { markStaffAttendanceAction } from "./actions";

export interface AttendanceStatusOption { id: string; label: string; is_default: boolean }
export interface StaffGridRow { staff_id: string; full_name: string; staff_code: string; status_id: string | null }

export default function StaffAttendanceGrid({
  rows, statuses, date, canEnter,
}: {
  rows: StaffGridRow[]; statuses: AttendanceStatusOption[]; date: string; canEnter: boolean;
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(date);
  const [state, formAction, pending] = useActionState<{ error: string | null; marked?: number }, FormData>(
    markStaffAttendanceAction, { error: null }
  );
  const defaultStatusId = statuses.find((s) => s.is_default)?.id ?? statuses[0]?.id ?? "";

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Date</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            router.push(`/staff?date=${e.target.value}`);
          }}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        />
      </div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="date" value={date} />
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Code</th>
              <th className="py-1.5">Staff</th>
              <th className="py-1.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <tr key={r.staff_id}>
                <td className="py-1.5">
                  <input type="hidden" name="staffId" value={r.staff_id} />
                  {r.staff_code}
                </td>
                <td className="py-1.5">{r.full_name}</td>
                <td className="py-1.5">
                  <select
                    name={`status_${r.staff_id}`}
                    defaultValue={r.status_id ?? defaultStatusId}
                    disabled={!canEnter}
                    className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm disabled:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  >
                    {statuses.map((st) => (
                      <option key={st.id} value={st.id}>{st.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No active staff yet.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
        {canEnter && rows.length > 0 ? (
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Save attendance
          </button>
        ) : null}
        {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
        {typeof state.marked === "number" ? <p className="text-sm text-zinc-500 dark:text-zinc-400">{state.marked} record(s) saved.</p> : null}
      </form>
    </div>
  );
}
