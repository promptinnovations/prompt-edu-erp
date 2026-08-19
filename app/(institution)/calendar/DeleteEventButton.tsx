"use client";

import { useActionState } from "react";
import { deleteCalendarEventAction } from "./actions";

export default function DeleteEventButton({ eventId }: { eventId: string }) {
  const [, formAction, pending] = useActionState<{ error: string | null }, FormData>(deleteCalendarEventAction, { error: null });

  return (
    <form action={formAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 disabled:opacity-50"
      >
        Remove
      </button>
    </form>
  );
}
