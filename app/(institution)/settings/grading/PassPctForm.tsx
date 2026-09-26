"use client";

import { useActionState } from "react";
import { updatePassPctAction, type GradingActionState } from "./actions";

const INIT: GradingActionState = { error: null };

/** Result Analysis & Reporting spec — the tenant-wide default pass
 *  percentage. NOT a grade band (a grade label is purely descriptive);
 *  every "isPass()" call across marks entry/reports falls back to this
 *  value unless a subject's own pass_marks overrides it. */
export default function PassPctForm({ passPct, canManage }: { passPct: number; canManage: boolean }) {
  const [state, action] = useActionState(updatePassPctAction, INIT);
  if (!canManage) {
    return <p className="text-sm text-zinc-600">Current pass percentage: <strong>{passPct}%</strong></p>;
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Default pass percentage</label>
        <input autoComplete="off"
          name="passPct" type="number" step="0.01" min={0} max={100} defaultValue={passPct}
          className="w-24 rounded-full border px-2 py-1.5 text-sm"
        />
      </div>
      <button type="submit" className="rounded-full bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
        Save
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      <p className="w-full text-[11px] text-zinc-500">
        Used whenever a subject has no pass-marks override of its own — this is a separate rule from grade bands
        (a grade label like &ldquo;E&rdquo; or &ldquo;D&rdquo; is descriptive only; pass/fail is always this number).
      </p>
    </form>
  );
}
