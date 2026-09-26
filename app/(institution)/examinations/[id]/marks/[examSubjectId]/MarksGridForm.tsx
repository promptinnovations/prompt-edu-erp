"use client";

import { useActionState, useState } from "react";
import {
  saveMarksAction, submitMarksAction, verifyMarksAction, approveMarksAction, lockMarksAction,
  deleteMarkAction, correctMarkAction,
} from "../../../actions";
import ConfirmSubmitButton from "../../../../../components/ui/ConfirmSubmitButton";
import { formatMarks } from "../../../../../../services/format/marks";

export interface GridStudent {
  student_id: string; student_name: string; admission_number: string;
  mark_id: string | null; marks_obtained: string | null; is_absent: boolean; entry_status: string | null;
}

function WorkflowButton({
  action, label, examinationId, examSubjectId,
}: { action: typeof submitMarksAction; label: string; examinationId: string; examSubjectId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null; count?: number }, FormData>(action, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="examinationId" value={examinationId} />
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <button type="submit" disabled={pending} className="rounded-full border px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      {typeof state.count === "number" ? <span className="text-xs text-zinc-500">({state.count} updated)</span> : null}
    </form>
  );
}

/** Edits an already approved/locked mark (correctMark() — kept as its own
 *  history-preserving path rather than reusing the plain Save-marks form,
 *  which only ever touches 'draft' rows) — collapsed behind a small inline
 *  form, same "click Correct, fill in, Save" shape GradeBandRow's editing
 *  toggle uses elsewhere in the app. §"add edit & remove button ... student
 *  added mark entered" follow-up. */
function CorrectMarkRow({
  student, examinationId, examSubjectId,
}: { student: GridStudent; examinationId: string; examSubjectId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(correctMarkAction, { error: null });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">
        Correct
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5" onSubmit={() => setOpen(false)}>
      <input type="hidden" name="examinationId" value={examinationId} />
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <input type="hidden" name="markId" value={student.mark_id ?? ""} />
      <input autoComplete="off"
        name="newValue" type="number" step="0.01" defaultValue={formatMarks(student.marks_obtained)}
        placeholder="Marks" className="w-20 rounded-full border px-2 py-1 text-xs"
      />
      <input autoComplete="off" name="reason" required placeholder="Reason" className="w-32 rounded-full border px-2 py-1 text-xs" />
      <button type="submit" disabled={pending} className="rounded-full border px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50">Save</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

export interface GridCeComponent { id: string; name: string; maxMarks: string }
export interface GridCeMark { student_id: string; ce_component_id: string; marks_obtained: string | null; is_absent: boolean; entry_status: string }

export default function MarksGridForm({
  students, examinationId, examSubjectId, canEnter, canVerify, canApprove, canLock,
  ceComponents = [], ceMarks = [],
}: {
  students: GridStudent[];
  examinationId: string;
  examSubjectId: string;
  canEnter: boolean; canVerify: boolean; canApprove: boolean; canLock: boolean;
  /** §CE — one extra marks + absent column pair per CE component, saved by
   *  the same Save marks submit and the same workflow buttons. */
  ceComponents?: GridCeComponent[];
  ceMarks?: GridCeMark[];
}) {
  const ceByKey = new Map(ceMarks.map((m) => [`${m.ce_component_id}:${m.student_id}`, m]));
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(saveMarksAction, { error: null });
  const [, deleteAction] = useActionState<{ error: string | null }, FormData>(deleteMarkAction, { error: null });

  return (
    <div className="space-y-4">
      <form action={formAction}>
        <input type="hidden" name="examinationId" value={examinationId} />
        <input type="hidden" name="examSubjectId" value={examSubjectId} />
        {ceComponents.map((c) => <input key={c.id} type="hidden" name="ceComponentId" value={c.id} />)}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
            <tr>
              <th className="py-1.5">Admission #</th>
              <th className="py-1.5">Student</th>
              <th className="py-1.5">Marks</th>
              <th className="py-1.5">Absent</th>
              {ceComponents.map((c) => (
                <th key={c.id} className="py-1.5">{c.name} <span className="normal-case">/{formatMarks(c.maxMarks)}</span></th>
              ))}
              <th className="py-1.5">Status</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((s) => {
              const isDraftOrUnset = s.entry_status === null || s.entry_status === "draft";
              return (
              <tr key={s.student_id}>
                <td className="py-1.5">
                  <input type="hidden" name="studentId" value={s.student_id} />
                  {s.admission_number}
                </td>
                <td className="py-1.5">{s.student_name}</td>
                <td className="py-1.5">
                  <input autoComplete="off"
                    name={`marks_${s.student_id}`}
                    type="number"
                    step="0.01"
                    defaultValue={formatMarks(s.marks_obtained)}
                    disabled={!canEnter || !isDraftOrUnset}
                    className="w-24 rounded-full border px-2 py-1 text-sm disabled:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  />
                </td>
                <td className="py-1.5">
                  <input autoComplete="off"
                    name={`absent_${s.student_id}`}
                    type="checkbox"
                    defaultChecked={s.is_absent}
                    disabled={!canEnter || !isDraftOrUnset}
                  />
                </td>
                {ceComponents.map((c) => {
                  const m = ceByKey.get(`${c.id}:${s.student_id}`);
                  const ceEditable = canEnter && (!m || m.entry_status === "draft");
                  return (
                    <td key={c.id} className="py-1.5 whitespace-nowrap">
                      <input autoComplete="off"
                        name={`ce_${c.id}_${s.student_id}`}
                        type="number" step="0.01" min={0} max={Number(c.maxMarks)}
                        defaultValue={formatMarks(m?.marks_obtained)}
                        disabled={!ceEditable}
                        aria-label={`${c.name} for ${s.student_name}`}
                        className="w-16 rounded-full border px-2 py-1 text-sm disabled:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                      />
                      <label className="ml-1 text-[11px] text-zinc-500">
                        <input autoComplete="off" type="checkbox" name={`ceabsent_${c.id}_${s.student_id}`} defaultChecked={m?.is_absent ?? false} disabled={!ceEditable} /> AB
                      </label>
                    </td>
                  );
                })}
                <td className="py-1.5 text-xs text-zinc-500">{s.entry_status ?? "—"}</td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  {canEnter && isDraftOrUnset && s.mark_id ? (
                    <form action={deleteAction} className="inline">
                      <input type="hidden" name="examinationId" value={examinationId} />
                      <input type="hidden" name="examSubjectId" value={examSubjectId} />
                      <input type="hidden" name="markId" value={s.mark_id} />
                      <ConfirmSubmitButton message={`Remove ${s.student_name}'s mark entry?`} className="text-xs text-red-600 underline hover:text-red-800">
                        Remove
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                  {canLock && !isDraftOrUnset && s.mark_id ? (
                    <CorrectMarkRow student={s} examinationId={examinationId} examSubjectId={examSubjectId} />
                  ) : null}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {canEnter ? (
          <button type="submit" disabled={pending} className="mt-3 rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Save marks
          </button>
        ) : null}
        {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
      </form>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        {canEnter ? <WorkflowButton action={submitMarksAction} label="Submit" examinationId={examinationId} examSubjectId={examSubjectId} /> : null}
        {canVerify ? <WorkflowButton action={verifyMarksAction} label="Verify" examinationId={examinationId} examSubjectId={examSubjectId} /> : null}
        {canApprove ? <WorkflowButton action={approveMarksAction} label="Approve" examinationId={examinationId} examSubjectId={examSubjectId} /> : null}
        {canLock ? <WorkflowButton action={lockMarksAction} label="Lock" examinationId={examinationId} examSubjectId={examSubjectId} /> : null}
      </div>
    </div>
  );
}
