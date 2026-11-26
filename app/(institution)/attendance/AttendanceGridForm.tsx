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
      <div className="mt-4 rounded-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {state.sent} WhatsApp alert{state.sent === 1 ? "" : "s"} sent{state.skipped ? `, ${state.skipped} skipped (no phone on file)` : ""}.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-card border border-amber-200 bg-amber-50 p-4">
      <h3 className="mb-1 text-sm font-semibold text-amber-900">
        Absentee &amp; late-coming alerts ({alerts.length})
      </h3>
      <p className="mb-3 text-xs text-amber-700">
        Attendance is already saved. Review the messages below, edit or exclude any, then confirm to send via WhatsApp.
      </p>
      <form action={formAction} className="space-y-3">
        {alerts.map((a) => {
          const isExcluded = excluded.has(a.studentId);
          const noPhone = !a.phone;
          return (
            <div key={a.studentId} className="rounded-card border border-amber-200 bg-white p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-zinc-900">
                  {a.studentName} <span className="text-zinc-500">({a.admissionNumber})</span>{" "}
                  <span className="text-xs text-zinc-500">— {a.statusLabel}{a.isLate ? ` · Late${a.lateMinutes ? ` ${a.lateMinutes}m` : ""}` : ""}</span>
                </div>
                {noPhone ? (
                  <span className="text-xs text-red-600">No phone on file</span>
                ) : (
                  <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <input autoComplete="off"
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
                    className="w-full rounded-lg border px-2 py-1.5 text-sm disabled:bg-zinc-100 disabled:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
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
            className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
          >
            Confirm &amp; send ({sendable.length})
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
          {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
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
  // Everybody starts as present (the default status); the teacher only taps
  // the ones who are not. The summary and highlights follow what is chosen.
  const [sel, setSel] = useState<Record<string, string>>(() => Object.fromEntries(students.map((s) => [s.student_id, s.status_id ?? defaultStatusId])));
  const [late, setLate] = useState<Record<string, boolean>>(() => Object.fromEntries(students.map((s) => [s.student_id, s.is_late])));
  const labelOf = new Map(statuses.map((st) => [st.id, st.label]));
  const counts = new Map<string, number>();
  for (const s of students) { const l = labelOf.get(sel[s.student_id]) ?? "—"; counts.set(l, (counts.get(l) ?? 0) + 1); }
  const lateCount = students.filter((s) => late[s.student_id]).length;
  const showPreview = !previewDismissed && state.alerts && state.alerts.length > 0;

  return (
    <div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="sectionId" value={sectionId} />
        <input type="hidden" name="date" value={date} />
        {students.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
            <span className="font-medium text-[var(--heading)]">{students.length} students</span>
            {[...counts.entries()].map(([l, n]) => <span key={l} className="text-zinc-600">{n} {l.toLowerCase()}</span>)}
            {lateCount > 0 ? <span className="text-zinc-600">{lateCount} late</span> : null}
            {canEnter ? (
              <button
                type="button"
                onClick={() => { setSel(Object.fromEntries(students.map((s) => [s.student_id, defaultStatusId]))); setLate(Object.fromEntries(students.map((s) => [s.student_id, false]))); }}
                className="ml-auto rounded-full border border-[var(--border-subtle)] bg-white px-3 py-1 text-xs hover:bg-primary-50"
              >Everyone {labelOf.get(defaultStatusId)?.toLowerCase() ?? "present"}</button>
            ) : null}
          </div>
        ) : null}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
            <tr>
              <th className="hidden py-1.5 sm:table-cell">Admission #</th>
              <th className="py-1.5">Student</th>
              <th className="py-1.5">Status</th>
              <th className="py-1.5">Late</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((s) => (
              <tr key={s.student_id} className={sel[s.student_id] !== defaultStatusId ? "bg-amber-50" : undefined}>
                <td className="hidden py-2 sm:table-cell">
                  <input type="hidden" name="studentId" value={s.student_id} />
                  {s.admission_number}
                </td>
                <td className="py-2 pr-2">
                  {s.student_name}
                </td>
                <td className="py-1.5">
                  {/* §D.6 follow-up "attendance must present by default" — every
                     student with no existing record defaults to whichever
                     status is_default=true (normally "Present"); staff switch
                     individual students to Absent/Late/etc. as needed. */}
                  <select
                    name={`status_${s.student_id}`}
                    value={sel[s.student_id]}
                    onChange={(e) => setSel((p) => ({ ...p, [s.student_id]: e.target.value }))}
                    disabled={!canEnter}
                    className="min-h-9 rounded-full border px-3 py-1 text-sm disabled:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  >
                    {statuses.map((st) => (
                      <option key={st.id} value={st.id}>{st.label}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <input
                      autoComplete="off" type="checkbox" name={`late_${s.student_id}`} className="h-5 w-5"
                      checked={Boolean(late[s.student_id])} disabled={!canEnter}
                      onChange={(e) => setLate((p) => ({ ...p, [s.student_id]: e.target.checked }))}
                      aria-label={`${s.student_name} came late`}
                    />
                    {late[s.student_id] ? (
                      <input autoComplete="off"
                        type="number" min={0} placeholder="min"
                        name={`lateMinutes_${s.student_id}`}
                        defaultValue={s.late_minutes ?? ""}
                        disabled={!canEnter}
                        aria-label={`${s.student_name} minutes late`}
                        className="w-16 rounded-full border px-2 py-1 text-sm disabled:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {students.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-zinc-500">No students enrolled in this section.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
        {canEnter && students.length > 0 ? (
          <div className="sticky bottom-0 -mx-1 flex items-center gap-3 bg-white/95 px-1 py-2 backdrop-blur">
            <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
              {pending ? "Saving…" : "Save attendance"}
            </button>
            {typeof state.marked === "number" ? <span className="text-sm text-emerald-700">✓ Saved for {state.marked} students</span> : null}
          </div>
        ) : null}
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </form>
      {showPreview ? (
        <AlertPreview key={JSON.stringify(state.alerts?.map((a) => a.studentId))} alerts={state.alerts!} onDismiss={() => setPreviewDismissed(true)} />
      ) : null}
    </div>
  );
}
