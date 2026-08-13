"use client";

import { useActionState } from "react";
import { createPortionPlanAction, recordPortionCompletionAction } from "./actions";

export interface PortionPlanRow {
  id: string; class_name: string; subject_name: string; teacher_name: string;
  chapter_name: string; planned_date: string | null;
  latest_completion_percent: number | null; latest_completed_date: string | null;
}

function RecordCompletionForm({ portionPlanId }: { portionPlanId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(recordPortionCompletionAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-1">
      <input type="hidden" name="portionPlanId" value={portionPlanId} />
      <input type="date" name="completedDate" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      <input type="number" name="completionPercent" min={0} max={100} placeholder="%" required className="w-16 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      <button type="submit" disabled={pending} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
        Log
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

export default function PortionPlanSection({
  plans, classes, subjects, teachers, academicYearId, canManage,
}: {
  plans: PortionPlanRow[];
  classes: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; full_name: string }>;
  academicYearId: string;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createPortionPlanAction, { error: null });

  return (
    <div className="space-y-4">
      {canManage ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="academicYearId" value={academicYearId} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class</label>
            <select name="classId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Subject</label>
            <select name="subjectId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Teacher</label>
            <select name="teacherId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Chapter</label>
            <input name="chapterName" required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Planned date</label>
            <input type="date" name="plannedDate" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
          </div>
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Create plan
          </button>
          {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
        </form>
      ) : null}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <tr>
            <th className="py-1.5">Chapter</th>
            <th className="py-1.5">Class / Subject</th>
            <th className="py-1.5">Teacher</th>
            <th className="py-1.5">Progress</th>
            {canManage ? <th className="py-1.5">Log progress</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {plans.map((p) => (
            <tr key={p.id}>
              <td className="py-1.5">{p.chapter_name}</td>
              <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{p.class_name} — {p.subject_name}</td>
              <td className="py-1.5">{p.teacher_name}</td>
              <td className="py-1.5">
                {p.latest_completion_percent === null ? "Not started" : `${p.latest_completion_percent}% (as of ${p.latest_completed_date})`}
              </td>
              {canManage ? <td className="py-1.5"><RecordCompletionForm portionPlanId={p.id} /></td> : null}
            </tr>
          ))}
          {plans.length === 0 ? (
            <tr><td colSpan={canManage ? 5 : 4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No portion plans yet.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
