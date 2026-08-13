"use client";

import { useActionState } from "react";
import { updateUserRolesAction } from "./actions";
import type { InstitutionRoleOption } from "../../../services/users/user-management-service";

export default function UserRolesForm({
  userId,
  roleOptions,
  currentRoleCodes,
}: {
  userId: string;
  roleOptions: InstitutionRoleOption[];
  currentRoleCodes: string[];
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateUserRolesAction, { error: null });
  const currentSet = new Set(currentRoleCodes);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap justify-end gap-2">
        {roleOptions.map((r) => (
          <label key={r.id} className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" name="roleCodes" value={r.code} defaultChecked={currentSet.has(r.code)} className="rounded border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
            {r.name}
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
      >
        Save roles
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
