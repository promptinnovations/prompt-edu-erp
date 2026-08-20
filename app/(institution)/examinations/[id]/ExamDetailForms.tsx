"use client";

import { useActionState } from "react";
import { addExamSubjectAction, addExamClassAction, computeResultsAction } from "../actions";

export function AddExamSubjectForm({
  examinationId, subjects,
}: { examinationId: string; subjects: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(addExamSubjectAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="examinationId" value={examinationId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Subject</label>
        <select name="subjectId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Max marks</label>
        <input name="maxMarks" type="number" defaultValue={100} className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Pass marks</label>
        <input name="passMarks" type="number" defaultValue={35} className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Add subject
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

export function AddExamClassForm({
  examinationId, sections,
}: { examinationId: string; sections: Array<{ id: string; classId: string; label: string }> }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(addExamClassAction, { error: null });
  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="examinationId" value={examinationId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class / Division</label>
        <select name="sectionAndClass" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {sections.map((s) => (
            <option key={s.id} value={`${s.classId}|${s.id}`}>{s.label}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Link class
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

export function ComputeResultsButton({ examinationId }: { examinationId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(computeResultsAction, { error: null });
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="examinationId" value={examinationId} />
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Compute results
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
