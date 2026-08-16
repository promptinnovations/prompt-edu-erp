"use client";

import { useActionState, useState } from "react";
import { createStaffLoginAction, resetStaffLoginPasswordAction } from "./actions";

/** §137 follow-up ("mail id can be their user id and phone number as
 *  passwords... should be editable anytime") — a per-staff-row inline
 *  control: "Create login" for a staff member who only has a claimable
 *  placeholder account (added via the Directory form above), or "Reset
 *  password" for one who already has a real login, so it's editable any
 *  time, not just at creation. */
export default function StaffLoginCell({ staffId, hasLogin, canManage }: { staffId: string; hasLogin: boolean; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const action = hasLogin ? resetStaffLoginPasswordAction : createStaffLoginAction;
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(action, { error: null });

  if (!canManage) return <span className="text-xs text-zinc-400 dark:text-zinc-500">{hasLogin ? "Has login" : "No login yet"}</span>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300"
      >
        {hasLogin ? "Reset password" : "Create login"}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="staffId" value={staffId} />
      <input
        name="password"
        type="text"
        required
        minLength={4}
        maxLength={30}
        placeholder="Password (e.g. phone number)"
        className="w-40 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
      />
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-2 py-1 text-xs text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        {hasLogin ? "Reset" : "Create"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
        Cancel
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
