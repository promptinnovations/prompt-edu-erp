"use client";

import { useActionState, useMemo, useState } from "react";
import { createExaminationAction } from "./actions";

interface ExamTypeOption { id: string; name: string; category: string | null; periodicity: string | null }

/** §418 "for concerned institution an option for choosing between Academic/
 *  Islamic also should be there at the create exam" — only shown for a
 *  'both'-mode institution (§407's education_mode); everyone else keeps
 *  the plain Exam type dropdown exactly as before. The track choice is
 *  purely a client-side FILTER on the existing exam_types.category field
 *  (§409) — nothing new is written to the database, "Islamic"/"Academic"
 *  was already there, this just makes it easy to find the right exam type
 *  among a long combined list instead of scrolling through both tracks. */
export default function ExaminationForm({
  examTypes, academicYears, educationMode,
}: {
  examTypes: ExamTypeOption[];
  academicYears: Array<{ id: string; name: string; is_current: boolean }>;
  educationMode: "academic" | "islamic" | "both";
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createExaminationAction, { error: null });
  const [track, setTrack] = useState<"" | "academic" | "islamic">("");

  const visibleExamTypes = useMemo(() => {
    if (!track) return examTypes;
    const wanted = track === "academic" ? "academic" : "islamic";
    return examTypes.filter((t) => (t.category ?? "").toLowerCase() === wanted);
  }, [examTypes, track]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {educationMode === "both" ? (
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Track</label>
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value as "" | "academic" | "islamic")}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          >
            <option value="">All</option>
            <option value="academic">Academic</option>
            <option value="islamic">Islamic</option>
          </select>
        </div>
      ) : null}
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Exam type</label>
        <select name="examTypeId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {visibleExamTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}{t.periodicity ? ` (${t.periodicity})` : ""}{t.category ? ` — ${t.category}` : ""}
            </option>
          ))}
        </select>
        {visibleExamTypes.length === 0 ? (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">No exam types for this track yet — add one in Settings → Grading.</p>
        ) : null}
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Academic year</label>
        <select name="academicYearId" required defaultValue={academicYears.find((y) => y.is_current)?.id} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          {academicYears.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Name</label>
        <input name="name" required placeholder="e.g. Term 1 Academic Main Exam" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" disabled={pending || visibleExamTypes.length === 0} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Create
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
