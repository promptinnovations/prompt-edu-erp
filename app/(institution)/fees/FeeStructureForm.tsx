"use client";

import { useActionState } from "react";
import { createFeeStructureAction, assignFeeStructureAction } from "./actions";

export interface Option { id: string; name: string }

export function FeeStructureForm({ categories, classes, academicYears }: { categories: Option[]; classes: Option[]; academicYears: Option[] }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createFeeStructureAction, { error: null });
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Category</label>
        <select name="feeCategoryId" required defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="" disabled>Select…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Academic year</label>
        <select name="academicYearId" required defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="" disabled>Select…</option>
          {academicYears.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class (blank = all classes)</label>
        <select name="classId" defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="">Every class</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Amount (₹)</label>
        <input name="amount" type="number" min={0} step="0.01" required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Due date (optional)</label>
        <input name="dueDate" type="date" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Add fee structure
        </button>
        {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}

export function AssignFeeStructureButton({ feeStructureId }: { feeStructureId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null; message?: string | null }, FormData>(
    assignFeeStructureAction, { error: null, message: null }
  );
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="feeStructureId" value={feeStructureId} />
      <button type="submit" disabled={pending} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50">
        Assign to students
      </button>
      {state.message ? <span className="text-xs text-emerald-600 dark:text-emerald-400">{state.message}</span> : null}
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
