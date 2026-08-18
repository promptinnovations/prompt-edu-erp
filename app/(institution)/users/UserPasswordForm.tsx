"use client";

/** §137 follow-up ("add and show current password of each user in the users
 *  & roles section") — shows the current password (users.phone, plain text,
 *  not masked — the whole point is the admin can read/relay it) with an
 *  editable field right next to it so a forgotten/lost password (e.g. the
 *  two staff accounts that prompted this feature) can be reset on the spot,
 *  same "Create login"/"Reset password" pairing modules/staff/service.ts's
 *  StaffLoginCell.tsx already established. */
import { useActionState, useState } from "react";
import { setUserPasswordAction } from "./actions";

export default function UserPasswordForm({ userId, currentPassword }: { userId: string; currentPassword: string | null }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(setUserPasswordAction, { error: null });
  const [value, setValue] = useState(currentPassword ?? "");

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="password"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={currentPassword ? undefined : "Not set"}
        minLength={6}
        className="w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
      />
      <button
        type="submit"
        disabled={pending || value.length < 6}
        className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
