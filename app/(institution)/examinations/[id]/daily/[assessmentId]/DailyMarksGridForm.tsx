"use client";

import { useActionState } from "react";
import { saveDailyAssessmentMarksAction } from "../../../actions";

export interface DailyGridStudent {
  student_id: string; student_name: string; admission_number: string;
  marks_obtained: string | null; is_absent: boolean;
}

/** Simpler than the standard exam module's MarksGridForm -- no
 *  submit/verify/approve/lock chain, since the spec calls for a plain
 *  Status field rather than a formal multi-stage approval workflow.
 *  Saving is disabled entirely once the assessment date has passed
 *  (isToday=false) -- same "same-day" rule enterDailyAssessmentMarks()
 *  itself enforces server-side; this just avoids letting anyone fill the
 *  form out only to have the save rejected. */
export default function DailyMarksGridForm({
  students, examinationId, dailyAssessmentId, canEnter, isToday, maxMarks,
}: {
  students: DailyGridStudent[];
  examinationId: string;
  dailyAssessmentId: string;
  canEnter: boolean;
  isToday: boolean;
  maxMarks: string;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(saveDailyAssessmentMarksAction, { error: null });
  const editable = canEnter && isToday;

  return (
    <form action={formAction}>
      <input type="hidden" name="examinationId" value={examinationId} />
      <input type="hidden" name="dailyAssessmentId" value={dailyAssessmentId} />
      {!isToday ? (
        <p className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          This assessment&apos;s date has passed — marks can only be entered on the same day it was conducted.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Admission #</th>
              <th className="py-1.5">Student</th>
              <th className="py-1.5">Marks (of {maxMarks})</th>
              <th className="py-1.5">Absent</th>
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
                    disabled={!editable}
                    className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm disabled:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  />
                </td>
                <td className="py-1.5">
                  <input name={`absent_${s.student_id}`} type="checkbox" defaultChecked={s.is_absent} disabled={!editable} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? (
        <button type="submit" disabled={pending} className="mt-3 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Save marks
        </button>
      ) : null}
      {state.error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
    </form>
  );
}
