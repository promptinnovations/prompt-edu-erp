"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendParentMessageAction } from "./actions";

export interface StaffOption { userId: string; label: string }

export default function SendMessageForm({ staffOptions, studentId }: { staffOptions: StaffOption[]; studentId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null; okAt?: number }, FormData>(sendParentMessageAction, { error: null });
  const formRef = useRef<HTMLFormElement>(null);
  // §495 "check if there is any bug in Message button": a successful send
  // used to leave the filled-in form sitting there with zero feedback,
  // indistinguishable from the button silently doing nothing -- clear the
  // fields and show a confirmation once okAt proves it actually went through.
  useEffect(() => {
    if (state.okAt) formRef.current?.reset();
  }, [state.okAt]);
  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500">To</label>
        <select name="toUserId" required defaultValue="" className="w-full rounded-full border px-3 py-1.5 text-sm">
          <option value="" disabled>Select a teacher / staff…</option>
          {staffOptions.map((s) => <option key={s.userId} value={s.userId}>{s.label}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Subject</label>
        <input autoComplete="off" name="subject" required className="w-full rounded-full border px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Message</label>
        <textarea name="body" required rows={3} className="w-full rounded-lg border px-3 py-1.5 text-sm" />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Send message
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {!state.error && state.okAt ? <span className="text-sm text-emerald-600">Message sent.</span> : null}
      </div>
    </form>
  );
}
