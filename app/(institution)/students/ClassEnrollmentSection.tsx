"use client";

/**
 * PROMPT EDU ERP — §137 follow-up "adding, removing, and moving from one
 * class to another": renders the student's current active enrollment (with
 * its roll number) plus Move/Remove forms, and a collapsible history of
 * past (removed/transferred) enrollments with a Restore button on each —
 * "removed data should be stored ... if required for restoring."
 */
import { useActionState } from "react";
import { moveStudentAction, removeFromClassAction, restoreEnrollmentAction } from "./actions";

interface SectionOption { id: string; classId: string; label: string }
interface HistoryRow {
  id: string; status: string; class_name: string; section_name: string;
  academic_year_name: string; exit_date: string | null; exit_reason: string | null; roll_number: number | null;
}

const initialState = { error: null as string | null };

export default function ClassEnrollmentSection({
  studentId,
  currentClassLabel,
  currentRollNumber,
  sections,
  history,
  canManage,
}: {
  studentId: string;
  currentClassLabel: string | null;
  currentRollNumber: number | null;
  sections: SectionOption[];
  history: HistoryRow[];
  canManage: boolean;
}) {
  const [moveState, moveAction, moving] = useActionState(moveStudentAction, initialState);
  const [removeState, removeAction, removing] = useActionState(removeFromClassAction, initialState);
  const [restoreState, restoreAction, restoring] = useActionState(restoreEnrollmentAction, initialState);

  const pastRows = history.filter((h) => h.status !== "active");

  return (
    <div className="space-y-4">
      {currentClassLabel ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Enrolled in <span className="font-medium">{currentClassLabel}</span> for the current academic year
            {currentRollNumber ? <> — roll no. <span className="font-medium">{currentRollNumber}</span></> : null}.
          </p>

          {canManage ? (
            <div className="flex flex-wrap items-end gap-4">
              <form action={moveAction} className="flex items-end gap-2">
                <input type="hidden" name="studentId" value={studentId} />
                <div>
                  <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Move to</label>
                  <select
                    name="sectionAndClass"
                    required
                    className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                    onChange={(e) => {
                      const [classId, sectionId] = e.currentTarget.value.split("|");
                      const form = e.currentTarget.form!;
                      (form.elements.namedItem("classId") as HTMLInputElement).value = classId;
                      (form.elements.namedItem("sectionId") as HTMLInputElement).value = sectionId;
                    }}
                  >
                    <option value="">Select…</option>
                    {sections.map((s) => (
                      <option key={s.id} value={`${s.classId}|${s.id}`}>{s.label}</option>
                    ))}
                  </select>
                  <input type="hidden" name="classId" />
                  <input type="hidden" name="sectionId" />
                </div>
                <button type="submit" disabled={moving} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">
                  {moving ? "Moving…" : "Move"}
                </button>
              </form>

              <form action={removeAction}>
                <input type="hidden" name="studentId" value={studentId} />
                <button
                  type="submit"
                  disabled={removing}
                  onClick={(e) => { if (!confirm("Remove this student from their current class? Their record is kept and can be restored.")) e.preventDefault(); }}
                  className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                >
                  {removing ? "Removing…" : "Remove from class"}
                </button>
              </form>
            </div>
          ) : null}
          {moveState.error ? <p className="text-sm text-red-600 dark:text-red-400">{moveState.error}</p> : null}
          {removeState.error ? <p className="text-sm text-red-600 dark:text-red-400">{removeState.error}</p> : null}
        </div>
      ) : null}

      {pastRows.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500 dark:text-zinc-400 underline">
            Class history ({pastRows.length})
          </summary>
          <div className="mt-2 space-y-2">
            {pastRows.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs">
                <span className="text-zinc-600 dark:text-zinc-400">
                  {h.class_name} — {h.section_name} ({h.academic_year_name}) —{" "}
                  <span className={h.status === "transferred" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>{h.status}</span>
                  {h.exit_date ? ` on ${h.exit_date}` : ""}{h.exit_reason ? ` — ${h.exit_reason}` : ""}
                </span>
                {canManage ? (
                  <form action={restoreAction}>
                    <input type="hidden" name="studentId" value={studentId} />
                    <input type="hidden" name="enrollmentId" value={h.id} />
                    <button type="submit" disabled={restoring} className="text-indigo-600 dark:text-indigo-400 underline disabled:opacity-50">
                      {restoring ? "Restoring…" : "Restore"}
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
          {restoreState.error ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">{restoreState.error}</p> : null}
        </details>
      ) : null}
    </div>
  );
}
