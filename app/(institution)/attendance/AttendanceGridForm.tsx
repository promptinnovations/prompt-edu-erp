"use client";

import { useActionState } from "react";
import { markAttendanceAction } from "./actions";

export interface AttendanceStatusOption { id: string; label: string; is_default: boolean }
export interface GridStudent {
  student_id: string; student_name: string; admission_number: string;
  status_id: string | null; is_late: boolean; late_minutes: number | null;
}

export default function AttendanceGridForm({
  students,
  statuses,
  classId,
  sectionId,
  date,
  canEnter,
}: {
  students: GridStudent[];
  statuses: AttendanceStatusOption[];
  classId: string;
  sectionId: string;
  date: string;
  canEnter: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null; marked?: number }, FormData>(
    markAttendanceAction,
    { error: null }
  );
  const defaultStatusId = statuses.find((s) => s.is_default)?.id ?? statuses[0]?.id ?? "";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="date" value={date} />
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <tr>
            <th className="py-1.5">Admission #</th>
            <th className="py-1.5">Student</th>
            <th className="py-1.5">Status</th>
            <th className="py-1.5">Late</th>
            <th className="py-1.5">Late (min)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {students.map((s) => (
            <tr key={s.student_id}>
              <td className="py-1.5">
                <input type="hidden" name="studentId" value={s.student_id} />
                {s.admission_number}
              </td>
              <td className="py-1.5">{s.student_name}</td>
              <td className="py-1.5">
                <select
                  name={`status_${s.student_id}`}
                  defaultValue={s.status_id ?? defaultStatusId}
                  disabled={!canEnter}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm disabled:bg-zinc-100"
                >
                  {statuses.map((st) => (
                    <option key={st.id} value={st.id}>{st.label}</option>
                  ))}
                </select>
              </td>
              <td className="py-1.5">
                <input type="checkbox" name={`late_${s.student_id}`} defaultChecked={s.is_late} disabled={!canEnter} />
              </td>
              <td className="py-1.5">
                <input
                  type="number"
                  min={0}
                  name={`lateMinutes_${s.student_id}`}
                  defaultValue={s.late_minutes ?? ""}
                  disabled={!canEnter}
                  className="w-20 rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm disabled:bg-zinc-100"
                />
              </td>
            </tr>
          ))}
          {students.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-zinc-400 dark:text-zinc-500">No students enrolled in this section.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
      {canEnter && students.length > 0 ? (
        <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Save attendance
        </button>
      ) : null}
      {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      {typeof state.marked === "number" ? <p className="text-sm text-zinc-500 dark:text-zinc-400">{state.marked} record(s) saved.</p> : null}
    </form>
  );
}
