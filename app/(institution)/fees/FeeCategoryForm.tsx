"use client";

import { useActionState } from "react";
import { createFeeCategoryAction } from "./actions";

export default function FeeCategoryForm() {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createFeeCategoryAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Category name</label>
        <input name="name" required placeholder="e.g. Tuition Fee" className="w-56 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Description (optional)</label>
        <input name="description" className="w-56 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Add category
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
