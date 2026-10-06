"use client";

import { useActionState } from "react";
import { addOwnLearnerEntryAction } from "./learner-actions";

/** "Add a reflection or goal" — the only part of the Learner Record a student
 *  writes themselves. */
export default function OwnLearnerEntryForm() {
  const [state, action, pending] = useActionState<{ error: string | null }, FormData>(addOwnLearnerEntryAction, { error: null });
  const input = "w-full rounded-lg border border-[var(--border-subtle)] bg-white px-2.5 py-1.5 text-sm";
  return (
    <form action={action} className="no-print space-y-2 rounded-card border border-dashed border-[var(--border-subtle)] p-5">
      <h2 className="text-sm font-semibold text-[var(--heading)]">Add a reflection or goal</h2>
      <p className="text-xs text-zinc-500">Write in your own words what you learned, or what you want to achieve next term.</p>
      <div className="flex flex-wrap gap-2">
        <select name="section" className={`${input} max-w-[11rem]`}><option value="reflection">Reflection</option><option value="goal">Goal</option></select>
        <input name="period" placeholder="Term (optional)" className={`${input} max-w-[12rem]`} />
      </div>
      <input name="title" required placeholder="Title" className={input} />
      <textarea name="detail" rows={3} placeholder="Your words" className={input} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">Add</button>
        {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
