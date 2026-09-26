"use client";

import { useActionState } from "react";
import { setInstitutionCeDefaultsAction } from "../../examinations/actions";

/** EXAMINATION_SPEC §CE — institution-wide Continuous Evaluation defaults,
 *  copied onto every newly created (regular) examination; each exam can
 *  still switch CE on/off or change mode on its own detail page. Has no
 *  effect on Daily Assessment. */
export default function CeDefaultsForm({
  enabled, mode, canManage,
}: { enabled: boolean; mode: "total" | "components"; canManage: boolean }) {
  const [state, action, pending] = useActionState<{ error: string | null; saved?: boolean }, FormData>(
    setInstitutionCeDefaultsAction, { error: null }
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-4 text-sm">
      <label className="flex items-center gap-2">
        <input autoComplete="off" type="checkbox" name="ceEnabled" defaultChecked={enabled} disabled={!canManage} />
        Enable CE for new exams
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Default CE mode</span>
        <select name="ceMode" defaultValue={mode} disabled={!canManage} className="rounded-full border px-2 py-1 disabled:bg-zinc-100">
          <option value="total">Total (one CE mark)</option>
          <option value="components">Components (several CE parts)</option>
        </select>
      </label>
      {canManage ? (
        <button type="submit" disabled={pending} className="rounded-full bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
          Save
        </button>
      ) : null}
      {state.saved ? <span className="text-xs text-zinc-500">Saved.</span> : null}
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
