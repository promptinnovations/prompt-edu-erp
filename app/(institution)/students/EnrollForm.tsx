"use client";

import { useActionState } from "react";
import { enrollStudentAction } from "./actions";

interface SectionOption { id: string; classId: string; label: string }

export default function EnrollForm({
  studentId,
  academicYearId,
  sections,
}: {
  studentId: string;
  academicYearId: string;
  sections: SectionOption[];
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(enrollStudentAction, { error: null });

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class / Division</label>
        <select
          name="sectionAndClass"
          required
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          onChange={(e) => {
            const [classId, sectionId] = e.currentTarget.value.split("|");
            const form = e.currentTarget.form!;
            (form.elements.namedItem("classId") as HTMLInputElement).value = classId;
            (form.elements.namedItem("sectionId") as HTMLInputElement).value = sectionId;
          }}
        >
          <option value="">Select…</option>
          {sections.map((s) => (
            <option key={s.id} value={`${s.classId}|${s.id}`}>
              {s.label}
            </option>
          ))}
        </select>
        <input type="hidden" name="classId" />
        <input type="hidden" name="sectionId" />
      </div>
      <button
        type="submit"
        disabled={pending || sections.length === 0}
        className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
      >
        Enroll
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
