"use client";

import { useActionState } from "react";
import { setUserMembershipStatusAction } from "./actions";

export default function UserStatusForm({ userId, currentStatus }: { userId: string; currentStatus: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(setUserMembershipStatusAction, { error: null });
  const nextStatus = currentStatus === "active" ? "inactive" : "active";

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={nextStatus} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
      >
        {currentStatus === "active" ? "Deactivate" : "Reactivate"}
      </button>
      {state.error ? <span className="ml-1 text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
