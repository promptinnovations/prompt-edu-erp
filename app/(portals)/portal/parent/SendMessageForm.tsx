"use client";

import { useActionState } from "react";
import { sendParentMessageAction } from "./actions";

export interface StaffOption { userId: string; label: string }

export default function SendMessageForm({ staffOptions, studentId }: { staffOptions: StaffOption[]; studentId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(sendParentMessageAction, { error: null });
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">To</label>
        <select name="toUserId" required defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="" disabled>Select a teacher / staff…</option>
          {staffOptions.map((s) => <option key={s.userId} value={s.userId}>{s.label}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Subject</label>
        <input name="subject" required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Message</label>
        <textarea name="body" required rows={3} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Send message
        </button>
        {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}
