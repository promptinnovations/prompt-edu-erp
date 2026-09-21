"use client";

import { useActionState } from "react";
import { toggleCalendarEventConductedAction } from "./actions";

/** §10 "tick events conducted" — a checkbox-styled toggle button per event
 *  row; submits the whole tiny form on click (no separate "Save" step,
 *  matching DeleteEventButton's one-click pattern right next to it). */
export default function ToggleConductedButton({ eventId, conducted }: { eventId: string; conducted: boolean }) {
  const [, formAction, pending] = useActionState<{ error: string | null }, FormData>(toggleCalendarEventConductedAction, { error: null });

  return (
    <form action={formAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={conducted}
        className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
          conducted
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-zinc-200 text-zinc-500 hover:bg-zinc-100"
        }`}
      >
        <span
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
            conducted ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300 bg-white"
          }`}
        >
          {conducted ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-2.5 w-2.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : null}
        </span>
        {conducted ? "Conducted" : "Mark conducted"}
      </button>
    </form>
  );
}
