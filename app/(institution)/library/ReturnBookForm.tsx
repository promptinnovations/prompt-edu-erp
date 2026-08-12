"use client";

import { useActionState } from "react";
import { returnBookAction } from "./actions";

export default function ReturnBookForm({ bookIssueId, isOverdue }: { bookIssueId: string; isOverdue: boolean }) {
  const [state, formAction, pending] = useActionState<{ error: string | null; fineAmount?: number }, FormData>(returnBookAction, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="bookIssueId" value={bookIssueId} />
      <select name="conditionOnReturn" defaultValue="good" className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
        <option value="good">Good</option>
        <option value="damaged">Damaged</option>
        <option value="lost">Lost</option>
      </select>
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
        Return
      </button>
      {isOverdue ? <span className="text-xs text-red-600">Overdue</span> : null}
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      {typeof state.fineAmount === "number" ? <span className="text-xs text-zinc-500">Fine: {state.fineAmount}</span> : null}
    </form>
  );
}
