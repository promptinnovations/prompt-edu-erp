"use client";

import { useActionState, useState } from "react";
import {
  createExamTypeAction, updateExamTypeAction, deleteExamTypeAction,
  type GradingActionState,
} from "./actions";

interface ExamType { id: string; code: string; name: string; category: string | null }

const INIT: GradingActionState = { error: null };

function ExamTypeRow({ examType, canManage }: { examType: ExamType; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateExamTypeAction, INIT);
  const [, deleteAction] = useActionState(deleteExamTypeAction, INIT);

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
        <form action={updateAction} className="flex flex-wrap items-center gap-2" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="examTypeId" value={examType.id} />
          <input name="name" defaultValue={examType.name} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
          <input name="category" defaultValue={examType.category ?? ""} placeholder="Category (e.g. Islamic, Academic)" className="w-56 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs" />
          <button type="submit" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">Cancel</button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600 dark:text-red-400">{updateState.error}</span> : null}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span>
        <strong className="text-zinc-900 dark:text-zinc-50">{examType.name}</strong>{" "}
        <span className="text-zinc-400 dark:text-zinc-500">({examType.code})</span>
        {examType.category ? (
          <span className="ml-2 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-xs text-indigo-700 dark:text-indigo-300">{examType.category}</span>
        ) : null}
      </span>
      {canManage ? (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">Edit</button>
          <form action={deleteAction} onSubmit={(e) => { if (!confirm(`Delete exam type "${examType.name}"?`)) e.preventDefault(); }}>
            <input type="hidden" name="examTypeId" value={examType.id} />
            <button type="submit" className="text-xs text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300">Delete</button>
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
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Exam types feed the &quot;Create Exam&quot; dropdown in Examinations. Category is an optional label
        (e.g. Islamic for Madrasa/Moral Science subjects, Academic for school subjects) — this institution can
        add as many types and categories as it needs.
      </p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {examTypes.length === 0 ? <li className="py-1 text-xs text-zinc-400 dark:text-zinc-500">No exam types yet.</li> : null}
        {examTypes.map((et) => <ExamTypeRow key={et.id} examType={et} canManage={canManage} />)}
      </ul>

      {canManage ? (
        <form action={createAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Code</label>
            <input name="code" required placeholder="e.g. MS-MID" className="w-28 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Name</label>
            <input name="name" required placeholder="e.g. Moral Science Mid Term" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Category (optional)</label>
            <input name="category" placeholder="Islamic / Academic" className="w-48 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
          </div>
          <button type="submit" className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Add exam type
          </button>
        </form>
      ) : null}
      {createState.error ? <p className="text-xs text-red-600 dark:text-red-400">{createState.error}</p> : null}
    </div>
  );
}
