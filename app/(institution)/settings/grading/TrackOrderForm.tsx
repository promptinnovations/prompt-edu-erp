"use client";

import { useActionState } from "react";
import { updateTrackOrderAction, type GradingActionState } from "./actions";

const INIT: GradingActionState = { error: null };

/** Education Type follow-up — "which should come first will be decided by
 *  institute admin" (verbatim ask). Only rendered when this institution is
 *  in 'both' mode (see page.tsx) — controls display order everywhere
 *  Academic/Islamic sections appear side by side (Subjects, Student
 *  Portfolio, Result Analysis). */
export default function TrackOrderForm({ trackOrder, canManage }: { trackOrder: ("academic" | "islamic")[]; canManage: boolean }) {
  const [state, action] = useActionState(updateTrackOrderAction, INIT);
  const first = trackOrder[0] ?? "academic";
  if (!canManage) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-300">Shown first: <strong className="capitalize">{first}</strong></p>;
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Shown first</label>
        <select name="firstTrack" defaultValue={first} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm">
          <option value="academic">Academic</option>
          <option value="islamic">Islamic</option>
        </select>
      </div>
      <button type="submit" className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
        Save
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
      <p className="w-full text-[11px] text-zinc-400 dark:text-zinc-500">
        Controls the order Academic/Islamic sections appear in throughout this institution — Subjects, Student
        Portfolio, and Result Analysis.
      </p>
    </form>
  );
}
