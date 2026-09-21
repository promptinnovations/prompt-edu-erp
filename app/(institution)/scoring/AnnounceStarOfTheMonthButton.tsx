"use client";

import { useActionState } from "react";
import { announceStarOfTheMonthAction } from "./actions";

export default function AnnounceStarOfTheMonthButton({ monthStart }: { monthStart: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null; message?: string | null }, FormData>(
    announceStarOfTheMonthAction, { error: null }
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="monthStart" value={monthStart} />
      <button type="submit" disabled={pending} className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending ? "Announcing…" : "Announce"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      {!state.error && state.message ? <span className="text-xs text-emerald-600">{state.message}</span> : null}
    </form>
  );
}
