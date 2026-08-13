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
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="person@example.com"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Full name</label>
          <input name="fullName" required className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Roles</label>
        <div className="flex flex-wrap gap-3">
          {roleOptions.map((r) => (
            <label key={r.id} className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" name="roleCodes" value={r.code} className="rounded border-zinc-300 dark:border-zinc-700" />
              {r.name}
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand)] px-4 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
      >
        Create login
      </button>
      {state.error ? <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p> : null}
    </form>
  );
}
