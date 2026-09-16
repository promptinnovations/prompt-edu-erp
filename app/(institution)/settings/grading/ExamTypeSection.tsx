"use client";

import { useActionState, useState } from "react";
import {
  createExamTypeAction, updateExamTypeAction, deleteExamTypeAction,
  type GradingActionState,
} from "./actions";

interface ExamType { id: string; code: string; name: string; category: string | null; periodicity: string | null }

const INIT: GradingActionState = { error: null };

/** §418 "institution should be able to enter the type of examination, it
 *  will be like periodic, cyclic, term, monthly etc." — common suggestions
 *  only, via a <datalist>; the field itself stays free text (§K "never a
 *  hard-coded institutional value") so an institution can type anything of
 *  its own, exactly like the existing Category field beside it. */
const PERIODICITY_SUGGESTIONS = ["Periodic", "Cyclic", "Term", "Monthly", "Weekly", "Half-yearly", "Annual"];

function ExamTypeRow({ examType, canManage }: { examType: ExamType; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateExamTypeAction, INIT);
  const [, deleteAction] = useActionState(deleteExamTypeAction, INIT);

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
        <form action={updateAction} className="flex flex-wrap items-center gap-2" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="examTypeId" value={examType.id} />
          <input name="name" defaultValue={examType.name} className="rounded-full border px-2 py-1 text-sm" />
          <select name="category" defaultValue={examType.category ?? ""} className="w-40 rounded-full border px-2 py-1 text-xs">
            <option value="">No category</option>
            <option value="Academic">Academic</option>
            <option value="Islamic">Islamic</option>
          </select>
          <input
            name="periodicity" list="periodicity-suggestions" defaultValue={examType.periodicity ?? ""}
            placeholder="Periodicity (e.g. Term)"
            className="w-36 rounded-full border px-2 py-1 text-xs"
          />
          <button type="submit" className="rounded-full border px-2 py-1 text-xs hover:bg-zinc-100">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600">{updateState.error}</span> : null}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span>
        <strong className="text-zinc-900">{examType.name}</strong>{" "}
        <span className="text-zinc-500">({examType.code})</span>
        {examType.category ? (
          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{examType.category}</span>
        ) : null}
        {examType.periodicity ? (
          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{examType.periodicity}</span>
        ) : null}
      </span>
      {canManage ? (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">Edit</button>
          <form action={deleteAction} onSubmit={(e) => { if (!confirm(`Delete exam type "${examType.name}"?`)) e.preventDefault(); }}>
            <input type="hidden" name="examTypeId" value={examType.id} />
            <button type="submit" className="text-xs text-red-600 underline hover:text-red-800">Delete</button>
          </form>
        </span>
      ) : null}
    </li>
  );
}

export default function ExamTypeSection({ examTypes, canManage }: { examTypes: ExamType[]; canManage: boolean }) {
  const [createState, createAction] = useActionState(createExamTypeAction, INIT);

  return (
    <div className="space-y-3">
      <datalist id="periodicity-suggestions">
        {PERIODICITY_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
      </datalist>
      <p className="text-xs text-zinc-500">
        Exam types feed the &quot;Create Exam&quot; dropdown in Examinations. Category is optional — Academic
        or Islamic — and drives which track section an exam shows up in wherever this institution splits
        results by track. Periodicity is optional too — how often it recurs (Periodic, Cyclic, Term,
        Monthly, or your own wording).
      </p>
      <ul className="divide-y">
        {examTypes.length === 0 ? <li className="py-1 text-xs text-zinc-500">No exam types yet.</li> : null}
        {examTypes.map((et) => <ExamTypeRow key={et.id} examType={et} canManage={canManage} />)}
      </ul>

      {canManage ? (
        <form action={createAction} className="flex flex-wrap items-end gap-2 rounded-card border border-dashed p-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Code</label>
            <input name="code" required placeholder="e.g. MS-MID" className="w-28 rounded-full border px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Name</label>
            <input name="name" required placeholder="e.g. Moral Science Mid Term" className="rounded-full border px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Category (optional)</label>
            <select name="category" defaultValue="" className="w-40 rounded-full border px-2 py-1.5 text-sm">
              <option value="">No category</option>
              <option value="Academic">Academic</option>
              <option value="Islamic">Islamic</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Periodicity (optional)</label>
            <input
              name="periodicity" list="periodicity-suggestions" placeholder="e.g. Term"
              className="w-36 rounded-full border px-2 py-1.5 text-sm"
            />
          </div>
          <button type="submit" className="rounded-full bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Add exam type
          </button>
        </form>
      ) : null}
      {createState.error ? <p className="text-xs text-red-600">{createState.error}</p> : null}
    </div>
  );
}
