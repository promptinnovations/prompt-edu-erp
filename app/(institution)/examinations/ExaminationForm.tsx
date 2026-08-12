"use client";

import { useActionState } from "react";
import { createExaminationAction } from "./actions";

export default function ExaminationForm({
  examTypes,
  academicYears,
}: {
  examTypes: Array<{ id: string; name: string }>;
  academicYears: Array<{ id: string; name: string; is_current: boolean }>;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createExaminationAction, { error: null });

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Exam type</label>
        <select name="examTypeId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          {examTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Academic year</label>
        <select name="academicYearId" required defaultValue={academicYears.find((y) => y.is_current)?.id} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          {academicYears.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Name</label>
        <input name="name" required placeholder="e.g. Term 1 Academic Main Exam" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Create
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
