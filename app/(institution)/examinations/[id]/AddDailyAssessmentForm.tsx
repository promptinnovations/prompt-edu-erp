"use client";

import { useActionState, useMemo, useState } from "react";
import { createDailyAssessmentAction } from "../actions";

export interface ClassOption { id: string; name: string }
export interface SubjectOption { id: string; name: string }

/** "Each Daily Assessment should include: Date, Class, Subject, Portion,
 *  Maximum Mark and Status" -- Status isn't a form field (always starts
 *  'pending', set server-side). Subject options narrow to the selected
 *  class's own class_subjects when that mapping exists for the class, and
 *  fall back to every institution subject otherwise (a class with no
 *  class_subjects rows configured yet shouldn't dead-end this form). */
export default function AddDailyAssessmentForm({
  examinationId, classes, subjectsByClass, allSubjects,
}: {
  examinationId: string;
  classes: ClassOption[];
  subjectsByClass: Record<string, SubjectOption[]>;
  allSubjects: SubjectOption[];
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createDailyAssessmentAction, { error: null });
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const subjectOptions = (subjectsByClass[classId]?.length ? subjectsByClass[classId] : allSubjects);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="examinationId" value={examinationId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Date</label>
        <input name="assessmentDate" type="date" required defaultValue={today} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class</label>
        <select name="classId" required value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Subject</label>
        <select name="subjectId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {subjectOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="min-w-[220px] flex-1">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Portion</label>
        <input name="portion" required placeholder="e.g. Chapter 3: Fractions" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Maximum mark</label>
        <input name="maxMarks" type="number" min="1" step="0.5" required defaultValue={20} className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" disabled={pending || classes.length === 0} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Add
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
