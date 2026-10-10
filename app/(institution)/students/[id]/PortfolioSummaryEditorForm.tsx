"use client";

import { useActionState } from "react";
import { upsertPortfolioSummaryAction } from "../actions";

/** §Portfolio-dashboard follow-up — the staff-only editor for the standing
 *  Teacher's Overall Remark / Strengths / Areas for Improvement / Future
 *  Goals record (modules/portfolio-summary/service.ts), rendered inside
 *  StudentPortfolioDashboard's Teacher Remarks tab via its `remarkEditor`
 *  slot. Gated by the caller behind `student.edit` (same as the rest of
 *  the Student Portfolio tab's edit affordances) — this component itself
 *  assumes it's only ever rendered for someone who already has that
 *  permission. One item per line in each textarea; see the server action
 *  for how that's split/joined against the newline-separated `text`
 *  columns. */
export default function PortfolioSummaryEditorForm({
  studentId, academicYearId, initial,
}: {
  studentId: string;
  academicYearId: string;
  initial: { overallRemark: string | null; strengths: string[]; areasForImprovement: string[]; futureGoals: string[] };
}) {
  const [state, action, pending] = useActionState<{ error: string | null }, FormData>(
    upsertPortfolioSummaryAction, { error: null }
  );

  return (
    <form action={action} className="space-y-3 rounded-card border bg-zinc-50 p-4">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <h3 className="section-label">Edit teacher&apos;s remark</h3>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">Overall remark</label>
        <textarea
          name="overallRemark"
          defaultValue={initial.overallRemark ?? ""}
          rows={2}
          className="w-full rounded-lg border p-2 text-sm"
          placeholder="e.g. Bright and hardworking student with strong leadership potential."
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Strengths (one per line)</label>
          <textarea name="strengths" defaultValue={initial.strengths.join("\n")} rows={4} className="w-full rounded-lg border p-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Areas for improvement (one per line)</label>
          <textarea name="areasForImprovement" defaultValue={initial.areasForImprovement.join("\n")} rows={4} className="w-full rounded-lg border p-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Future goals (one per line)</label>
          <textarea name="futureGoals" defaultValue={initial.futureGoals.join("\n")} rows={4} className="w-full rounded-lg border p-2 text-sm" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save remark"}
        </button>
        {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      </div>
    </form>
  );
}
