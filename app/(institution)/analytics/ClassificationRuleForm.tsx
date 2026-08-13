"use client";

import { useActionState } from "react";
import { setClassificationRuleAction } from "./actions";

export default function ClassificationRuleForm({
  highThreshold,
  lowThreshold,
}: {
  highThreshold: number;
  lowThreshold: number;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(setClassificationRuleAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">High achiever ≥ (%)</label>
        <input type="number" step="0.01" name="highThreshold" defaultValue={highThreshold} className="w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Low achiever &lt; (%)</label>
        <input type="number" step="0.01" name="lowThreshold" defaultValue={lowThreshold} className="w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Save thresholds
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
