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
        <label className="mb-1 block text-xs text-zinc-500">Student</label>
        <select name="studentId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Category</label>
        <select name="categoryId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Level</label>
        <select name="levelId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          {levels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Title</label>
        <input name="title" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Position</label>
        <input name="position" placeholder="e.g. 1st" className="w-24 rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Points</label>
        <input name="points" type="number" step="0.01" className="w-24 rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Certificate (optional)</label>
        <input name="certificate" type="file" className="w-48 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
      </div>
      <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Submit
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
