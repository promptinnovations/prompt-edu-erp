"use client";

import { useActionState } from "react";
import { toggleRegisterHolidayAction } from "./actions";

/** §Attendance-register follow-up ("there should be an option for marking
 *  holidays") — one button per day-of-month header cell; click toggles that
 *  single day as a holiday (see actions.ts for exactly what "toggle" means
 *  for a day that's part of a multi-day holiday). Same one-click submit
 *  pattern as the Calendar page's ToggleConductedButton. */
export default function MarkHolidayButton({ date, isHoliday }: { date: string; isHoliday: boolean }) {
  const [, formAction, pending] = useActionState<{ error: string | null }, FormData>(toggleRegisterHolidayAction, { error: null });

  return (
    <form action={formAction}>
      <input type="hidden" name="date" value={date} />
      <button
        type="submit"
        disabled={pending}
        title={isHoliday ? "Click to unmark holiday" : "Click to mark as holiday"}
        className={`block w-full px-1 py-1 text-center text-[10px] font-normal ${
          isHoliday ? "bg-rose-100 text-rose-700" : "text-zinc-400 hover:bg-zinc-100"
        } disabled:opacity-50`}
      >
        {date.slice(-2).replace(/^0/, "")}
      </button>
    </form>
  );
}
