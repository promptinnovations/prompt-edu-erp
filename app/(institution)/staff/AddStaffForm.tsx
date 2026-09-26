"use client";

import { useActionState } from "react";
import { createStaffAction } from "./actions";

export default function AddStaffForm({ roleOptions }: { roleOptions: string[] }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createStaffAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Full name</label>
        <input autoComplete="off" name="fullName" required className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Email</label>
        <input autoComplete="off" name="email" type="email" required className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Staff code</label>
        <input autoComplete="off" name="staffCode" required className="w-28 rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Designation</label>
        <input autoComplete="off" name="designation" className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Department</label>
        <input autoComplete="off" name="department" className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Joining date</label>
        <input autoComplete="off" name="joiningDate" type="date" className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Role</label>
        <select name="roleCode" className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          <option value="">—</option>
          {roleOptions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Add staff member
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
