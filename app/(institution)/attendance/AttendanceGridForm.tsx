"use client";

import { useActionState, useEffect, useState } from "react";
import { markAttendanceAction, sendAttendanceAlertsAction } from "./actions";

export interface AttendanceStatusOption { id: string; label: string; is_default: boolean }
export interface GridStudent {
  student_id: string; student_name: string; admission_number: string;
  status_id: string | null; is_late: boolean; late_minutes: number | null;
}
export interface AlertCandidate {
  studentId: string; studentName: string; admissionNumber: string;
  statusLabel: string; countsAsPresent: boolean; isLate: boolean; lateMinutes: number | null;
  phone: string | null; defaultMessage: string;
}

const markState: { error: string | null; marked?: number; alerts?: AlertCandidate[] } = { error: null };
const sendState: { error: string | null; sent?: number; skipped?: number } = { error: null };

/** The §D.6 follow-up "preview of absentee and latecoming alert... editable,
 *  cancellable, then press confirm whatsapp message will be sent" step —
 *  rendered as its own inline sub-component so its message-editing/exclude
 *  state resets cleanly every time markAttendanceAction returns a fresh
 *  alerts array (a new key on the wrapping element, set from the parent,
 *  forces that reset rather than stale state leaking across separate
 *  "take attendance" submissions on the same page). */
function AlertPreview({ alerts, onDismiss }: { alerts: AlertCandidate[]; onDismiss: () => void }) {
  const [state, formAction, pending] = useActionState(sendAttendanceAlertsAction, sendState);
  const [messages, setMessages] = useState<Record<string, string>>(
    () => Object.fromEntries(alerts.map((a) => [a.studentId, a.defaultMessage]))
  );
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const sendable = alerts.filter((a) => a.phone && !excluded.has(a.studentId));

  if (state.sent !== undefined) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 p-4 text-sm text-emerald-800 dark:text-emerald-300">
        {state.sent} WhatsApp alert{state.sent === 1 ? "" : "s"} sent{state.skipped ? `, ${state.skipped} skipped (no phone on file)` : ""}.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-4">
      <h3 className="mb-1 text-sm font-semibold text-amber-900 dark:text-amber-200">
        Absentee &amp; late-coming alerts ({alerts.length})
      </h3>
      <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
        Attendance is already saved. Review the messages below, edit or exclude any, then confirm to send via WhatsApp.
      </p>
      <form action={formAction} className="space-y-3">
        {alerts.map((a) => {
          const isExcluded = excluded.has(a.studentId);
          const noPhone = !a.phone;
          return (
            <div key={a.studentId} className="rounded-lg border border-amber-200 dark:border-amber-900 bg-white dark:bg-zinc-900 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {a.studentName} <span className="text-zinc-400 dark:text-zinc-500">({a.admissionNumber})</span>{" "}
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">— {a.statusLabel}{a.isLate ? ` · Late${a.lateMinutes ? ` ${a.lateMinutes}m` : ""}` : ""}</span>
                </div>
                {noPhone ? (
                  <span className="text-xs text-red-600 dark:text-red-400">No phone on file</span>
                ) : (
                  <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={(e) =>
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.delete(a.studentId); else next.add(a.studentId);
                          return next;
                        })
                      }
                    />
                    Include
                  </label>
                )}
              </div>
              {noPhone ? null : (
                <>
                  {!isExcluded ? <input type="hidden" name="alertStudentId" value={a.studentId} /> : null}
                  <textarea
                    name={`alertMessage_${a.studentId}`}
                    value={messages[a.studentId] ?? a.defaultMessage}
                    onChange={(e) => setMessages((prev) => ({ ...prev, [a.studentId]: e.target.value }))}
                    disabled={isExcluded}
                    rows={2}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  />
                </>
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending || sendable.length === 0}
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
          >
            Confirm &amp; send ({sendable.length})
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
        </div>
      </form>
    </div>
  );
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
  const [state, formAction, pending] = useActionState(markAttendanceAction, markState);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  // Reset the "cancelled" flag whenever a NEW save produces a new alerts
  // array reference (a fresh submission), so a second "take attendance"
  // save on the same page shows its own preview again.
  useEffect(() => { setPreviewDismissed(false); }, [state.alerts]);
  const defaultStatusId = statuses.find((s) => s.is_default)?.id ?? statuses[0]?.id ?? "";
  const showPreview = !previewDismissed && state.alerts && state.alerts.length > 0;

  return (
    <div>
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
                  {/* §D.6 follow-up "attendance must present by default" — every
                     student with no existing record defaults to whichever
                     status is_default=true (normally "Present"); staff switch
                     individual students to Absent/Late/etc. as needed. */}
                  <select
                    name={`status_${s.student_id}`}
                    defaultValue={s.status_id ?? defaultStatusId}
                    disabled={!canEnter}
                    className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm disabled:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
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
                    className="w-20 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm disabled:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
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
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Save attendance
          </button>
        ) : null}
        {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
        {typeof state.marked === "number" ? <p className="text-sm text-zinc-500 dark:text-zinc-400">{state.marked} record(s) saved.</p> : null}
      </form>
      {showPreview ? (
        <AlertPreview key={JSON.stringify(state.alerts?.map((a) => a.studentId))} alerts={state.alerts!} onDismiss={() => setPreviewDismissed(true)} />
      ) : null}
    </div>
  );
}
