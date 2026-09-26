"use client";

import { useActionState } from "react";
import { submitOwnAchievementAction } from "./actions";

export default function SubmitAchievementForm({
  categories, levels,
}: {
  categories: Array<{ id: string; name: string }>;
  levels: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(submitOwnAchievementAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Category</label>
        <select name="categoryId" required className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Level</label>
        <select name="levelId" required className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div className="flex-1">
        <label className="mb-1 block text-xs text-zinc-500">Title</label>
        <input autoComplete="off" name="title" required className="w-full rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Position</label>
        <input autoComplete="off" name="position" placeholder="1st" className="w-20 rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Submit
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
