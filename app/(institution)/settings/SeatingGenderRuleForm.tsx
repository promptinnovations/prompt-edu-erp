"use client";

import { useActionState } from "react";
import { updateSeatingGenderRuleAction } from "./actions";

const OPTIONS: Array<{ value: "hard" | "best_effort"; label: string; body: string }> = [
  {
    value: "hard",
    label: "Hard rule — never mix",
    body: "Boys and girls are never seated in the same room. If the chosen rooms can't hold both groups separately, generation stops and says exactly how many seats are short.",
  },
  {
    value: "best_effort",
    label: "Best effort — mix only if needed",
    body: "Boys and girls are kept apart wherever capacity allows, and share a room only as a last resort. The plan tells you which rooms ended up mixed.",
  },
];

/** Examinations > Seating Arrangement's boys/girls rule. Changing it
 *  affects the NEXT plan generated — each existing plan keeps the rule it
 *  was generated under, so an old chart never starts describing itself
 *  wrongly. */
export default function SeatingGenderRuleForm({ current }: { current: "hard" | "best_effort" }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateSeatingGenderRuleAction, { error: null });
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-start gap-2 rounded-card border p-3 text-sm hover:border-[var(--brand)]"
          >
            <input type="radio" name="examSeatingGenderRule" value={opt.value} defaultChecked={current === opt.value} className="mt-0.5 h-4 w-4" />
            <span>
              <span className="block font-medium text-zinc-800">{opt.label}</span>
              <span className="mt-0.5 block text-xs text-zinc-500">{opt.body}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Save
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
