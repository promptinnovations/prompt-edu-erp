"use client";

import { useActionState } from "react";
import { updateBoardAction } from "./actions";

export default function BoardConfigForm({
  institutionId,
  board,
}: {
  institutionId: string;
  board: string | null;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null; saved?: boolean }, FormData>(
    updateBoardAction,
    { error: null }
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="institutionId" value={institutionId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Educational board</label>
        <select
          name="board"
          defaultValue={board ?? "sksvb"}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        >
          <option value="sksvb">SKSVB</option>
          <option value="skimvb">SKIMVB</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        Save
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      {state.saved ? <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</span> : null}
      <p className="w-full text-[11px] text-zinc-400 dark:text-zinc-500">
        Setting SKSVB (re-)creates classes 1–12 and their subjects for this institution — safe to run again, existing
        classes/subjects are matched by name, never duplicated.
      </p>
    </form>
  );
}
