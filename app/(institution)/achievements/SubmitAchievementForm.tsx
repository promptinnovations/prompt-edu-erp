"use client";

import { useActionState } from "react";
import { submitAchievementAction } from "./actions";

export default function SubmitAchievementForm({
  students,
  categories,
  levels,
}: {
  students: Array<{ id: string; full_name: string }>;
  categories: Array<{ id: string; name: string }>;
  levels: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(submitAchievementAction, { error: null });

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Student</label>
        <select name="studentId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Category</label>
        <select name="categoryId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Level</label>
        <select name="levelId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {levels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Title</label>
        <input name="title" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Position</label>
        <input name="position" placeholder="e.g. 1st" className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Points</label>
        <input name="points" type="number" step="0.01" className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Certificate (optional)</label>
        <input name="certificate" type="file" className="w-48 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Submit
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
