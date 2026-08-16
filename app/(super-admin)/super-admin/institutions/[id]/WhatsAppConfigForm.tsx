"use client";

import { useActionState } from "react";
import { updateWhatsAppConfigAction } from "./actions";

export default function WhatsAppConfigForm({
  institutionId,
  idInstance,
  apiTokenInstance,
}: {
  institutionId: string;
  idInstance: string | null;
  apiTokenInstance: string | null;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null; saved?: boolean }, FormData>(
    updateWhatsAppConfigAction,
    { error: null }
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="institutionId" value={institutionId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">ID Instance</label>
        <input
          name="idInstance"
          defaultValue={idInstance ?? ""}
          placeholder="e.g. 1101123456"
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">API Token Instance</label>
        <input
          name="apiTokenInstance"
          defaultValue={apiTokenInstance ?? ""}
          placeholder="e.g. d3f9c8a1b2..."
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        />
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
    </form>
  );
}
