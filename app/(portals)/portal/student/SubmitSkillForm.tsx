"use client";

import { useActionState } from "react";
import { submitOwnSkillAction } from "./actions";

export default function SubmitSkillForm({ activities }: { activities: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(submitOwnSkillAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Activity</label>
        <select name="skillActivityId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <button type="submit" disabled={pending || activities.length === 0} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Submit
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
