"use client";

import { useActionState } from "react";
import { updateInstitutionStatusAction } from "./actions";

const STATUSES = ["active", "inactive", "suspended", "trial"] as const;

export default function InstitutionStatusForm({ institutionId, currentStatus }: { institutionId: string; currentStatus: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateInstitutionStatusAction, { error: null });

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="institutionId" value={institutionId} />
      <select name="status" defaultValue={currentStatus} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
        Update
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
