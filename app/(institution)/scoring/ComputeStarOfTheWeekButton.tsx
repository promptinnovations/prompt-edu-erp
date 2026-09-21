"use client";

import { useActionState } from "react";
import { computeStarOfTheWeekAction } from "./actions";

export default function ComputeStarOfTheWeekButton() {
  const [state, formAction, pending] = useActionState<{ error: string | null; message?: string | null }, FormData>(
    computeStarOfTheWeekAction, { error: null }
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        {pending ? "Computing…" : "Compute this week's Star of the Week"}
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      {!state.error && state.message ? <span className="text-sm text-emerald-600">{state.message}</span> : null}
    </form>
  );
}
