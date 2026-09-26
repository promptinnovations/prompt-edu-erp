"use client";

import { useActionState } from "react";
import { createAcademicYearAction } from "./actions";

/** "Academic Structure > Academic years" follow-up — createAcademicYear()
 *  (modules/academic/service.ts) has existed since Phase 2 but had no UI
 *  anywhere in the app; institutions only ever got one via the demo seed.
 *  Mirrors ClassForm.tsx's shape. */
export default function AcademicYearForm() {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createAcademicYearAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Name</label>
        <input autoComplete="off"
          name="name"
          required
          placeholder="e.g. 2026-2027"
          className="w-32 rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Start date</label>
        <input autoComplete="off"
          name="startDate"
          type="date"
          required
          className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">End date</label>
        <input autoComplete="off"
          name="endDate"
          type="date"
          required
          className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        />
      </div>
      <label className="flex items-center gap-1.5 pb-2 text-xs text-zinc-500">
        <input autoComplete="off" type="checkbox" name="isCurrent" />
        Set as current year
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
      >
        Add
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
