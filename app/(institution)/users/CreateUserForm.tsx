"use client";

import { useActionState } from "react";
import { createUserAction } from "./actions";
import type { InstitutionRoleOption } from "../../../services/users/user-management-service";

export default function CreateUserForm({ roleOptions }: { roleOptions: InstitutionRoleOption[] }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createUserAction, { error: null });

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Email</label>
          <input autoComplete="off"
            name="email"
            type="email"
            required
            placeholder="person@example.com"
            className="rounded-full border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Full name</label>
          <input autoComplete="off" name="fullName" required className="rounded-full border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Password</label>
          <input autoComplete="off"
            name="password"
            type="text"
            required
            minLength={6}
            placeholder="At least 6 characters"
            className="rounded-full border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">Roles</label>
        <div className="flex flex-wrap gap-3">
          {roleOptions.map((r) => (
            <label key={r.id} className="flex items-center gap-1.5 text-sm text-zinc-700">
              <input autoComplete="off" type="checkbox" name="roleCodes" value={r.code} className="rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
              {r.name}
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
      >
        Create login
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
