"use client";

import { useActionState } from "react";
import {
  createObservationCriterionAction, updateObservationCriterionAction, deleteObservationCriterionAction,
} from "./actions";
import type { ObservationCriterionRecord } from "../../../modules/staff/service";

const LevelFields = ({ score, defaults }: { score: number; defaults?: { descriptor: string; explanation: string } }) => (
  <div className="grid gap-2 sm:grid-cols-[3rem_1fr_2fr] sm:items-start">
    <div className="pt-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">Score {score}</div>
    <input
      name={`level_${score}_descriptor`}
      defaultValue={defaults?.descriptor ?? ""}
      placeholder="Descriptor"
      required
      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm"
    />
    <input
      name={`level_${score}_explanation`}
      defaultValue={defaults?.explanation ?? ""}
      placeholder="Explanation"
      required
      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm"
    />
  </div>
);

function CriterionEditor({ criterion }: { criterion: ObservationCriterionRecord }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(
    updateObservationCriterionAction, { error: null }
  );
  const [delState, delAction, delPending] = useActionState<{ error: string | null }, FormData>(
    deleteObservationCriterionAction, { error: null }
  );
  const byScore = new Map(criterion.levels_jsonb.map((l) => [l.score, l]));

  return (
    <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
      <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-300">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{criterion.domain}</span> — {criterion.criteria_text}
      </summary>
      <form action={formAction} className="mt-3 space-y-2">
        <input type="hidden" name="criterionId" value={criterion.id} />
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="domain" defaultValue={criterion.domain} placeholder="Domain" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
          <input name="criteriaText" defaultValue={criterion.criteria_text} placeholder="Criterion" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
        </div>
        <input name="sortOrder" type="number" defaultValue={criterion.sort_order} className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
        {[5, 4, 3, 2, 1].map((s) => <LevelFields key={s} score={s} defaults={byScore.get(s)} />)}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            {pending ? "Saving…" : "Save"}
          </button>
          {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
        </div>
      </form>
      <form action={delAction} className="mt-2">
        <input type="hidden" name="criterionId" value={criterion.id} />
        <button type="submit" disabled={delPending} className="text-xs text-red-600 dark:text-red-400 underline disabled:opacity-50">
          Delete this criterion
        </button>
        {delState.error ? <span className="ml-2 text-xs text-red-600 dark:text-red-400">{delState.error}</span> : null}
      </form>
    </details>
  );
}

function AddCriterionForm() {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(
    createObservationCriterionAction, { error: null }
  );
  return (
    <details className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
      <summary className="cursor-pointer text-sm text-zinc-600 dark:text-zinc-300">+ Add criterion</summary>
      <form action={formAction} className="mt-3 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="domain" placeholder="Domain (e.g. A. Planning &amp; Preparation)" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
          <input name="criteriaText" placeholder="Criterion" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
        </div>
        <input name="sortOrder" type="number" defaultValue={0} className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm" />
        {[5, 4, 3, 2, 1].map((s) => <LevelFields key={s} score={s} />)}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            {pending ? "Adding…" : "Add criterion"}
          </button>
          {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
        </div>
      </form>
    </details>
  );
}

/** §Teacher-Profile AskUserQuestion #1 ("Editable by admin") — the PDF's 20
 *  criteria are lazily seeded as a default (modules/staff/
 *  observation-rubric-defaults.ts) but freely editable/extendable here,
 *  same "institution configuration, not platform logic" pattern as Grade
 *  Scales (§Examination). Gated on staff.observation.manage only — see
 *  createObservationCriterionAction's doc comment for why a Section Head
 *  can't reach this. */
export default function RubricAdminSection({ criteria }: { criteria: ObservationCriterionRecord[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Each criterion is scored 1–5; every level needs its own descriptor and explanation text, shown together when an observer picks that score.
      </p>
      {criteria.map((c) => <CriterionEditor key={c.id} criterion={c} />)}
      <AddCriterionForm />
    </div>
  );
}
