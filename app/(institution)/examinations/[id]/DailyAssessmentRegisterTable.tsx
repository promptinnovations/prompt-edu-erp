"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updateDailyAssessmentAction, deleteDailyAssessmentAction } from "../actions";
import ConfirmSubmitButton from "../../../components/ui/ConfirmSubmitButton";
import type { ClassOption, SubjectOption } from "./AddDailyAssessmentForm";
import type { DailyAssessmentRow } from "../../../../modules/examination/service";
import { formatDateIST } from "../../../../services/datetime/ist";

const INIT = { error: null };

function fmt(n: string | number | null) {
  if (n === null) return "—";
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** §505 "entered daily assessment should be editable and removable" — same
 *  inline "click Edit, fields swap in, Save/Cancel" shape ExaminationsTable
 *  already uses for the standard exam register, applied here to the Daily
 *  Assessment Register rows. No same-day restriction on either action
 *  (§506 removed that from mark entry too, and a typo in the portion text
 *  is just as fixable a week later as the same day). Delete cascades to
 *  any marks already saved under that session (see deleteDailyAssessment()'s
 *  own comment) — the confirm dialog says so explicitly. */
function DailyAssessmentRegisterRow({
  entry, examinationId, classes, subjectsByClass, allSubjects, canManage,
}: {
  entry: DailyAssessmentRow;
  examinationId: string;
  classes: ClassOption[];
  subjectsByClass: Record<string, SubjectOption[]>;
  allSubjects: SubjectOption[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [classId, setClassId] = useState(entry.class_id);
  const [updateState, updateAction] = useActionState(updateDailyAssessmentAction, INIT);
  const [deleteState, deleteAction] = useActionState(deleteDailyAssessmentAction, INIT);
  const subjectOptions = subjectsByClass[classId]?.length ? subjectsByClass[classId] : allSubjects;

  if (editing) {
    return (
      <tr>
        <td colSpan={7} className="py-2">
          <form action={updateAction} className="flex flex-wrap items-end gap-2" onSubmit={() => setEditing(false)}>
            <input type="hidden" name="dailyAssessmentId" value={entry.id} />
            <input type="hidden" name="examinationId" value={examinationId} />
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Date</label>
              <input name="assessmentDate" type="date" defaultValue={entry.assessment_date} className="rounded-full border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Class</label>
              <select name="classId" value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border px-2 py-1 text-sm">
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Subject</label>
              <select name="subjectId" defaultValue={entry.subject_id} className="rounded-full border px-2 py-1 text-sm">
                {subjectOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-zinc-500">Portion</label>
              <input name="portion" defaultValue={entry.portion} className="w-full rounded-full border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Max mark</label>
              <input name="maxMarks" type="number" min="1" step="0.5" defaultValue={entry.max_marks} className="w-20 rounded-full border px-2 py-1 text-sm" />
            </div>
            <button type="submit" className="rounded-full border px-3 py-1 text-xs hover:bg-zinc-100">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
            {updateState.error ? <span className="text-xs text-red-600">{updateState.error}</span> : null}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="py-1.5 pr-4">{formatDateIST(entry.assessment_date)}</td>
      <td className="py-1.5 pr-4">{entry.class_name}</td>
      <td className="py-1.5 pr-4">{entry.subject_name}</td>
      <td className="py-1.5 pr-4 max-w-xs truncate" title={entry.portion}>{entry.portion}</td>
      <td className="py-1.5 pr-4">{fmt(entry.max_marks)}</td>
      <td className="py-1.5 pr-4">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${entry.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {entry.status === "completed" ? "Completed" : "Pending"}
        </span>
      </td>
      <td className="py-1.5 text-right">
        <div className="flex items-center justify-end gap-3">
          <Link href={`/examinations/${examinationId}/daily/${entry.id}`} className="text-sm text-zinc-600 underline">
            {entry.status === "completed" ? "View marks" : "Enter marks"}
          </Link>
          {canManage ? (
            <>
              <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">Edit</button>
              <form action={deleteAction} className="inline">
                <input type="hidden" name="dailyAssessmentId" value={entry.id} />
                <input type="hidden" name="examinationId" value={examinationId} />
                <ConfirmSubmitButton
                  message={`Delete this ${formatDateIST(entry.assessment_date)} — ${entry.subject_name} session? ${entry.status === "completed" ? "Any marks already entered for it will be deleted too. " : ""}This can't be undone.`}
                  className="text-xs text-red-600 underline hover:text-red-800"
                >
                  Delete
                </ConfirmSubmitButton>
              </form>
            </>
          ) : null}
        </div>
        {deleteState.error ? <p className="mt-1 text-right text-xs text-red-600">{deleteState.error}</p> : null}
      </td>
    </tr>
  );
}

export default function DailyAssessmentRegisterTable({
  entries, examinationId, classes, subjectsByClass, allSubjects, canManage,
}: {
  entries: DailyAssessmentRow[];
  examinationId: string;
  classes: ClassOption[];
  subjectsByClass: Record<string, SubjectOption[]>;
  allSubjects: SubjectOption[];
  canManage: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
        <tr>
          <th className="py-1.5 pr-4">Date</th>
          <th className="py-1.5 pr-4">Class</th>
          <th className="py-1.5 pr-4">Subject</th>
          <th className="py-1.5 pr-4">Portion</th>
          <th className="py-1.5 pr-4">Max mark</th>
          <th className="py-1.5 pr-4">Status</th>
          <th className="py-1.5" />
        </tr>
      </thead>
      <tbody className="divide-y">
        {entries.map((e) => (
          <DailyAssessmentRegisterRow
            key={e.id} entry={e} examinationId={examinationId}
            classes={classes} subjectsByClass={subjectsByClass} allSubjects={allSubjects} canManage={canManage}
          />
        ))}
        {entries.length === 0 ? (
          <tr><td colSpan={7} className="py-4 text-center text-zinc-500">No assessments recorded yet this month.</td></tr>
        ) : null}
      </tbody>
    </table>
  );
}
