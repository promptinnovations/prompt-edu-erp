"use client";

import { useActionState } from "react";
import { toggleModuleAction } from "./actions";

export default function ModuleToggleForm({
  institutionId,
  moduleCode,
  isEnabled,
}: {
  institutionId: string;
  moduleCode: string;
  isEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(toggleModuleAction, { error: null });

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="moduleCode" value={moduleCode} />
      <input type="hidden" name="enabled" value={(!isEnabled).toString()} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
      >
        {isEnabled ? "Disable" : "Enable"}
      </button>
      {state.error ? <span className="ml-1 text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
