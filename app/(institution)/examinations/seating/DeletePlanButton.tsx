"use client";

import { useActionState } from "react";
import { deleteSeatingPlanAction } from "./actions";

export default function DeletePlanButton({ examinationId }: { examinationId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(deleteSeatingPlanAction, { error: null });
  return (
    <form action={formAction} className="no-print flex items-center gap-2">
      <input type="hidden" name="examinationId" value={examinationId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        Delete plan
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
