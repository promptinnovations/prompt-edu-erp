"use client";

import { useActionState } from "react";
import { migrateStorageAction } from "./actions";
import type { MigrateActionState } from "./actions";

const initialState: MigrateActionState = { result: null, error: null };

export default function MigrateStorageForm({ activeProvider }: { activeProvider: string }) {
  const [state, formAction, pending] = useActionState(migrateStorageAction, initialState);

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Move every file to</label>
          <select name="targetProvider" defaultValue={activeProvider} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
            <option value="local">Local</option>
            <option value="supabase">Supabase</option>
          </select>
        </div>
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {pending ? "Migrating…" : "Migrate"}
        </button>
      </form>

      {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}

      {state.result ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-sm text-zinc-700 dark:text-zinc-300">
          <p>
            Considered {state.result.totalConsidered} file(s): {state.result.migrated} migrated,{" "}
            {state.result.alreadyOnTarget} already on target, {state.result.failed.length} failed.
          </p>
          {state.result.failed.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-red-600 dark:text-red-400">
              {state.result.failed.map((f) => (
                <li key={f.fileId}>{f.fileName}: {f.error}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
