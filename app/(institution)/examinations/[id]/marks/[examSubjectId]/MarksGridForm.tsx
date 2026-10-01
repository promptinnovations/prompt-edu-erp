"use client";

import { Fragment, useActionState, useState } from "react";
import { saveMarksAction, deleteMarkAction, correctMarkAction } from "../../../actions";
import ConfirmSubmitButton from "../../../../../components/ui/ConfirmSubmitButton";
import { formatMarks } from "../../../../../../services/format/marks";

export interface GridStudent {
  student_id: string; student_name: string; admission_number: string;
  /** §"this (subject) should also be class wise, class should be specified
   *  on top" — used to group the grid into per-class sections with their
   *  own header, when this exam_subject's scope spans more than one class. */
  class_id: string; class_name: string | null; stage: string | null; section_name: string | null;
  mark_id: string | null; marks_obtained: string | null; is_absent: boolean; entry_status: string | null;
}

/** "Grade 5 A" style label — stage is left off (it's the institution's own
 *  grouping vocabulary, already implied by context on this page) so this
 *  stays compact as a grid section header. */
function classLabel(s: Pick<GridStudent, "class_name" | "section_name">): string {
  const parts = [s.class_name, s.section_name].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length > 0 ? parts.join(" ") : "Unassigned class";
}

/** Edits a mark of any status (correctMark() — kept as its own
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
  students, examinationId, examSubjectId, canEnter, canCorrect, examinationClosed,
  ceComponents = [], ceMarks = [],
}: {
  students: GridStudent[];
  examinationId: string;
  examSubjectId: string;
  canEnter: boolean;
  /** §"1 for admin 2 for teachers" — admin/principal composite; can correct
   *  any mark regardless of examinationClosed. */
  canCorrect: boolean;
  /** §"admin will switch mark entry Open > Closed > Published > Archived"
   *  — true once the admin has closed mark entry for this examination;
   *  teachers (canEnter) can no longer write marks until it's reopened. */
  examinationClosed: boolean;
  /** §CE — one extra marks + absent column pair per CE component, saved by
   *  the same Save marks submit. */
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
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((s, i) => {
              // §"admin will switch mark entry Open > Closed > Published >
              // Archived ... 2 for teachers" — a teacher can write marks
              // only while the examination isn't Closed; the per-mark
              // entry_status no longer gates this (the old submit/verify/
              // approve/lock chain is retired from the UI).
              const teacherCanEdit = canEnter && !examinationClosed;
              // §"this (subject) should also be class wise, class should be
              // specified on the top" — students is already sorted class-
              // then-division-then-roll (sortRoster(), service.ts), so a
              // group boundary is just "the label changed from the row
              // before"; one header row above the first row of each group.
              const label = classLabel(s);
              const prevLabel = i > 0 ? classLabel(students[i - 1]) : null;
              const showHeader = label !== prevLabel;
              return (
              <Fragment key={s.student_id}>
              {showHeader ? (
                <tr key={`${s.class_id}-${s.section_name ?? ""}-header`} className="bg-zinc-50">
                  <td colSpan={5 + ceComponents.length} className="py-1.5 px-1 text-xs font-semibold uppercase tracking-[0.06em] text-zinc-600">
                    {label}
                  </td>
                </tr>
              ) : null}
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
                    disabled={!teacherCanEdit}
                    className="w-24 rounded-full border px-2 py-1 text-sm disabled:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  />
                </td>
                <td className="py-1.5">
                  <input autoComplete="off"
                    name={`absent_${s.student_id}`}
                    type="checkbox"
                    defaultChecked={s.is_absent}
                    disabled={!teacherCanEdit}
                  />
                </td>
                {ceComponents.map((c) => {
                  const m = ceByKey.get(`${c.id}:${s.student_id}`);
                  const ceEditable = teacherCanEdit;
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
                <td className="py-1.5 text-right whitespace-nowrap">
                  {teacherCanEdit && s.mark_id ? (
                    <form action={deleteAction} className="inline">
                      <input type="hidden" name="examinationId" value={examinationId} />
                      <input type="hidden" name="examSubjectId" value={examSubjectId} />
                      <input type="hidden" name="markId" value={s.mark_id} />
                      <ConfirmSubmitButton message={`Remove ${s.student_name}'s mark entry?`} className="text-xs text-red-600 underline hover:text-red-800">
                        Remove
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                  {canCorrect && s.mark_id ? (
                    <CorrectMarkRow student={s} examinationId={examinationId} examSubjectId={examSubjectId} />
                  ) : null}
                </td>
              </tr>
              </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
        {canEnter && !examinationClosed ? (
          <button type="submit" disabled={pending} className="mt-3 rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Save marks
          </button>
        ) : null}
        {canEnter && examinationClosed ? (
          <p className="mt-2 text-xs text-zinc-500">Mark entry is closed for this examination — ask an admin to reopen it to make changes.</p>
        ) : null}
        {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
      </form>
    </div>
  );
}
