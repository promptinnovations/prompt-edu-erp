"use client";

import { useActionState } from "react";
import { createCalendarEventAction } from "./actions";

const EVENT_TYPES: Array<{ value: string; label: string }> = [
  { value: "holiday", label: "Holiday" },
  { value: "exam", label: "Exam" },
  { value: "meeting", label: "Meeting" },
  { value: "ptm", label: "PTM" },
  { value: "other", label: "Other" },
];

export default function AddEventForm() {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createCalendarEventAction, { error: null });

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="sm:col-span-2 lg:col-span-2">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Title</label>
        <input name="title" required maxLength={200} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Type</label>
        <select name="eventType" defaultValue="other" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]">
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Start date</label>
        <input type="date" name="startDate" required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">End date (optional)</label>
        <input type="date" name="endDate" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]" />
      </div>
      <div className="sm:col-span-2 lg:col-span-1">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Description (optional)</label>
        <input name="description" maxLength={2000} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]" />
      </div>
      <div className="sm:col-span-2 lg:col-span-6 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {pending ? "Adding…" : "Add event"}
        </button>
        {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      </div>
    </form>
  );
}
