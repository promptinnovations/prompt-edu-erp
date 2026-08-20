"use client";

import { useActionState } from "react";
import { assignSectionHeadAction, removeSectionHeadAssignmentAction } from "./actions";

export interface SectionHeadRow { id: string; user_id: string; user_full_name: string; stage: string }

function RemoveButton({ assignmentId }: { assignmentId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(removeSectionHeadAssignmentAction, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <button type="submit" disabled={pending} className="text-xs text-red-600 dark:text-red-400 underline disabled:opacity-50">Remove</button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

/** §Attendance-follow-up-3 "section wise for section heads". A user must
 *  ALSO hold the Section Head role (Users & Roles) for this assignment to
 *  unlock the stage-wide Daily overview/trend — this form only records
 *  WHICH section(s) they're responsible for, same "assignment separate from
 *  role grant" split TeacherAssignmentForm right above it already uses.
 *  `stages` is the distinct set of stage values currently in use on any
 *  class (listDistinctStages()) — a plain text fallback input is offered
 *  too, since a brand-new institution may not have tagged any class with a
 *  stage yet. */
export default function SectionHeadAssignmentForm({
  staff, stages, assignments, canManage,
}: {
  staff: Array<{ userId: string; full_name: string }>;
  stages: string[];
  assignments: SectionHeadRow[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(assignSectionHeadAction, { error: null });

  return (
    <div className="space-y-4">
      {canManage ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Staff member</label>
            <select name="userId" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
              {staff.map((s) => <option key={s.userId} value={s.userId}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Section (e.g. KG, LP, UP, HS, HSS)</label>
            {stages.length > 0 ? (
              <select name="stage" required className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
                {stages.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input name="stage" required placeholder="e.g. HSS" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
            )}
          </div>
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Assign
          </button>
          {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
        </form>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr><th className="py-1.5">Staff member</th><th className="py-1.5">Section</th><th className="py-1.5" /></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {assignments.map((a) => (
              <tr key={a.id}>
                <td className="py-1.5">{a.user_full_name}</td>
                <td className="py-1.5">{a.stage}</td>
                <td className="py-1.5">{canManage ? <RemoveButton assignmentId={a.id} /> : null}</td>
              </tr>
            ))}
            {assignments.length === 0 ? (
              <tr><td colSpan={3} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No Section Heads assigned yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
