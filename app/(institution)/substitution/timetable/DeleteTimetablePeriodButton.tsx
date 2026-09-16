"use client";

import { useActionState } from "react";
import { deleteTimetablePeriodAction } from "../actions";

export default function DeleteTimetablePeriodButton({ periodId }: { periodId: string }) {
  const [, formAction, pending] = useActionState<{ error: string | null }, FormData>(deleteTimetablePeriodAction, { error: null });

  return (
    <form action={formAction}>
      <input type="hidden" name="periodId" value={periodId} />
      <button type="submit" disabled={pending} className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50">
        Remove
      </button>
    </form>
  );
}
