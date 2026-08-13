"use client";

import { useActionState } from "react";
import { refreshAnalyticsAction } from "./actions";

export default function RefreshButton() {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(refreshAnalyticsAction, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <button type="submit" disabled={pending} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
        {pending ? "Refreshing…" : "Refresh analytics"}
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
