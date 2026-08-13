"use client";

import { useActionState } from "react";
import {
  saveMarksAction, submitMarksAction, verifyMarksAction, approveMarksAction, lockMarksAction,
} from "../../../actions";

export interface GridStudent {
  student_id: string; student_name: string; admission_number: string;
  marks_obtained: string | null; is_absent: boolean; entry_status: string | null;
}

function WorkflowButton({
  action, label, examinationId, examSubjectId,
}: { action: typeof submitMarksAction; label: string; examinationId: string; examSubjectId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null; count?: number }, FormData>(action, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="examinationId" value={examinationId} />
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <button type="submit" disabled={pending} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
      {typeof state.count === "number" ? <span className="text-xs text-zinc-400 dark:text-zinc-500">({state.count} updated)</span> : null}
    </form>
  );
}

export default function MarksGridForm({
  students, examinationId, examSubjectId, canEnter, canVerify, canApprove, canLock,
}: {
  students: GridStudent[];
  examinationId: string;
  examSubjectId: string;
  canEnter: boolean; canVerify: boolean; canApprove: boolean; canLock: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(saveMarksAction, { error: null });

  return (
    <div className="space-y-4">
      <form action={formAction}>
        <input type="hidden" name="examinationId" value={examinationId} />
        <input type="hidden" name="examSubjectId" value={examSubjectId} />
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Admission #</th>
              <th className="py-1.5">Student</th>
              <th className="py-1.5">Marks</th>
              <th className="py-1.5">Absent</th>
              <th className="py-1.5">Status</th>
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
                  <input
                    name={`marks_${s.student_id}`}
                    type="number"
                    step="0.01"
                    defaultValue={s.marks_obtained ?? ""}
                    disabled={!canEnter || (s.entry_status !== null && s.entry_status !== "draft")}
                    className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm disabled:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  />
                </td>
                <td className="py-1.5">
                  <input
                    name={`absent_${s.student_id}`}
                    type="checkbox"
                    defaultChecked={s.is_absent}
                    disabled={!canEnter || (s.entry_status !== null && s.entry_status !== "draft")}
                  />
                </td>
                <td className="py-1.5 text-xs text-zinc-500 dark:text-zinc-400">{s.entry_status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {canEnter ? (
          <button type="submit" disabled={pending} className="mt-3 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Save marks
          </button>
        ) : null}
        {state.error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      </form>

      <div className="flex flex-wrap gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-4">
        {canEnter ? <WorkflowButton action={submitMarksAction} label="Submit" examinationId={examinationId} examSubjectId={examSubjectId} /> : null}
        {canVerify ? <WorkflowButton action={verifyMarksAction} label="Verify" examinationId={examinationId} examSubjectId={examSubjectId} /> : null}
        {canApprove ? <WorkflowButton action={approveMarksAction} label="Approve" examinationId={examinationId} examSubjectId={examSubjectId} /> : null}
        {canLock ? <WorkflowButton action={lockMarksAction} label="Lock" examinationId={examinationId} examSubjectId={examSubjectId} /> : null}
      </div>
    </div>
  );
}
