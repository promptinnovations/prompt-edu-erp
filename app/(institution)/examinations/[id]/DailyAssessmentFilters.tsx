"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface FilterOption { id: string; name: string }

/** Class/Subject filters for the monthly consolidated result and the
 *  student-wise analysis table -- plain GET-style navigation via query
 *  params (?classId=&subjectId=&analysisClassId=) so every filtered view
 *  is server-rendered and bookmarkable, same convention as the Consolidated
 *  Marks page's own class dropdown filter (§304). */
export default function DailyAssessmentFilters({
  classes, subjects, classParam, subjectParam,
}: {
  classes: FilterOption[];
  subjects: FilterOption[];
  classParam: string;
  subjectParam: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class</label>
        <select
          value={classParam}
          onChange={(e) => update("classId", e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        >
          <option value="">Select a class…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Subject (optional)</label>
        <select
          value={subjectParam}
          onChange={(e) => update("subjectId", e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    </div>
  );
}
