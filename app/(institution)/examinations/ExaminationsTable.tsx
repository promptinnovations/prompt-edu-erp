"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updateExaminationAction, deleteExaminationAction } from "./actions";
import ConfirmSubmitButton from "../../components/ui/ConfirmSubmitButton";

interface ExaminationRow { id: string; name: string; status: string; academic_year_id: string }
interface AcademicYearOption { id: string; name: string; is_current: boolean }

const INIT = { error: null };

/** §"add edit & remove button where they are required ... a created exam"
 *  follow-up — same inline "click Edit, fields swap in, Save/Cancel" shape
 *  GradeScaleCard (Settings → Grading) already uses, reused here so a
 *  mistyped exam name or wrong academic year doesn't require deleting and
 *  recreating the whole exam. Delete is guarded server-side
 *  (deleteExamination()) — refused once any marks/results exist under it. */
function ExaminationRow({
  exam, academicYears, canManage,
}: { exam: ExaminationRow; academicYears: AcademicYearOption[]; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateExaminationAction, INIT);
  const [deleteState, deleteAction] = useActionState(deleteExaminationAction, INIT);

  if (editing) {
    return (
      <tr>
        <td colSpan={3} className="px-4 py-2">
          <form action={updateAction} className="flex flex-wrap items-center gap-2" onSubmit={() => setEditing(false)}>
            <input type="hidden" name="examinationId" value={exam.id} />
            <input name="name" defaultValue={exam.name} className="rounded-full border px-2 py-1 text-sm" />
            <select name="academicYearId" defaultValue={exam.academic_year_id} className="rounded-full border px-2 py-1 text-sm">
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
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
      <td className="px-4 py-2">{exam.name}</td>
      <td className="px-4 py-2 capitalize">{exam.status}</td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-3">
          <Link href={`/examinations/${exam.id}`} className="text-sm text-zinc-600 underline">
            Open
          </Link>
          {canManage ? (
            <>
              <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">Edit</button>
              <form action={deleteAction} className="inline">
                <input type="hidden" name="examinationId" value={exam.id} />
                <ConfirmSubmitButton message={`Delete "${exam.name}"? This can't be undone.`} className="text-xs text-red-600 underline hover:text-red-800">
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

export default function ExaminationsTable({
  examinations, academicYears, canManage,
}: {
  examinations: ExaminationRow[];
  academicYears: AcademicYearOption[];
  canManage: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {examinations.map((e) => (
            <ExaminationRow key={e.id} exam={e} academicYears={academicYears} canManage={canManage} />
          ))}
          {examinations.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">—</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
