"use client";

import { useActionState } from "react";
import { createStaffAction } from "./actions";

export default function AddStaffForm({ roleOptions }: { roleOptions: string[] }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createStaffAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Full name</label>
        <input name="fullName" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Email</label>
        <input name="email" type="email" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Staff code</label>
        <input name="staffCode" required className="w-28 rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Designation</label>
        <input name="designation" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Department</label>
        <input name="department" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Joining date</label>
        <input name="joiningDate" type="date" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Role</label>
        <select name="roleCode" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">—</option>
          {roleOptions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Add staff member
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
