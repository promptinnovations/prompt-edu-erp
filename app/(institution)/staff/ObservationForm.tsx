"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { recordTeacherObservationWithRubricAction } from "./actions";
import type { ObservationCriterionRecord } from "../../../modules/staff/service";

/**
 * §Teacher-Profile feature ("Classroom Observations... for each component
 * (criteria) 3 items should be shown — descriptor, Score, explanation... if
 * the observer touch any of the three for marking from dropdown the other
 * two also related to that will appear automatically"). Implemented as ONE
 * dropdown per criterion, its options labelled "Score N — Descriptor" —
 * picking one fixes all three fields (score/descriptor/explanation)
 * together as a single unit (they were never independent in the rubric to
 * begin with, see observation_criteria.levels_jsonb's own doc comment in
 * migration 0036), which is what "the other two appear automatically"
 * means in practice: the explanation renders immediately below once picked.
 *
 * "give total score out of 100" — shown live here as a provisional running
 * total (client-side, exactly mirroring how the server computes it —
 * modules/staff/service.ts's recordTeacherObservationWithRubric()), scaled
 * by however many of the rubric's criteria have been answered so far.
 */
export default function ObservationForm({
  teacherId, criteria,
}: {
  teacherId: string;
  criteria: ObservationCriterionRecord[];
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(
    recordTeacherObservationWithRubricAction, { error: null }
  );

  const domains = useMemo(() => {
    const map = new Map<string, ObservationCriterionRecord[]>();
    for (const c of criteria) {
      if (!map.has(c.domain)) map.set(c.domain, []);
      map.get(c.domain)!.push(c);
    }
    return Array.from(map.entries());
  }, [criteria]);

  const maxPossible = criteria.length * 5;
  const answeredSum = Object.values(scores).reduce((s, v) => s + v, 0);
  const answeredCount = Object.keys(scores).length;
  const provisionalTotal = maxPossible > 0 && answeredCount > 0
    ? Math.round((answeredSum / (answeredCount * 5)) * 10000) / 100
    : null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="teacherId" value={teacherId} />

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Date</label>
          <input name="date" type="date" required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Term</label>
          <input name="term" placeholder="e.g. Term 1" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class &amp; division</label>
          <input name="classDiv" placeholder="e.g. UP 6 B" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Content</label>
          <input name="content" placeholder="Lesson / topic observed" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
        </div>
      </div>

      <div className="space-y-4">
        {domains.map(([domain, items]) => (
          <fieldset key={domain} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <legend className="px-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{domain}</legend>
            <div className="space-y-3">
              {items.map((c) => {
                const selected = c.levels_jsonb.find((l) => l.score === scores[c.id]);
                return (
                  <div key={c.id} className="grid gap-2 sm:grid-cols-3 sm:items-start">
                    <input type="hidden" name="criteriaId" value={c.id} />
                    <div className="sm:col-span-1 text-sm text-zinc-700 dark:text-zinc-300">{c.criteria_text}</div>
                    <div className="sm:col-span-1">
                      <select
                        name={`score_${c.id}`}
                        defaultValue=""
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setScores((prev) => v ? { ...prev, [c.id]: v } : (() => { const n = { ...prev }; delete n[c.id]; return n; })());
                        }}
                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm"
                      >
                        <option value="">Not scored</option>
                        {[...c.levels_jsonb].sort((a, b) => b.score - a.score).map((l) => (
                          <option key={l.score} value={l.score}>{l.score} — {l.descriptor}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {selected ? selected.explanation : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
        <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">
          Provisional total: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{provisionalTotal ?? "—"}{provisionalTotal !== null ? "%" : ""}</span>
          {answeredCount > 0 ? <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">({answeredCount} of {criteria.length} criteria scored)</span> : null}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Strengths observed</label>
            <textarea name="overallNotes" rows={3} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Areas to improve</label>
            <textarea name="followUpNotes" rows={3} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {pending ? "Saving…" : "Record observation"}
        </button>
        {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}
