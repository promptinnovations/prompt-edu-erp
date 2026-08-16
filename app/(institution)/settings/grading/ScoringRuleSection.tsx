"use client";

import { useActionState, useState } from "react";
import { createScoringRuleAction, updateScoringRuleAction, deleteScoringRuleAction, type GradingActionState } from "./actions";

interface ScoringRule {
  id: string; module: string; activity_code: string; points: string; max_points: string | null; is_active: boolean;
}

const INIT: GradingActionState = { error: null };

function ScoringRuleRow({ rule }: { rule: ScoringRule }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateScoringRuleAction, INIT);
  const [, deleteAction] = useActionState(deleteScoringRuleAction, INIT);

  if (editing) {
    return (
      <tr className="border-b border-zinc-100 dark:border-zinc-800">
        <td colSpan={5} className="py-2">
          <form action={updateAction} className="flex flex-wrap items-center gap-2" onSubmit={() => setEditing(false)}>
            <input type="hidden" name="scoringRuleId" value={rule.id} />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">{rule.module} / {rule.activity_code}</span>
            <label className="text-xs text-zinc-500 dark:text-zinc-400">Points
              <input name="points" type="number" step="0.01" defaultValue={rule.points} className="ml-1 w-20 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs" />
            </label>
            <label className="text-xs text-zinc-500 dark:text-zinc-400">Max
              <input name="maxPoints" type="number" step="0.01" defaultValue={rule.max_points ?? ""} className="ml-1 w-20 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs" />
            </label>
            <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <input type="checkbox" name="isActive" defaultChecked={rule.is_active} /> Active
            </label>
            <button type="submit" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">Cancel</button>
          </form>
          {updateState.error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{updateState.error}</p> : null}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800">
      <td className="py-2 text-zinc-500 dark:text-zinc-400">{rule.module}</td>
      <td className="py-2 text-zinc-900 dark:text-zinc-50">{rule.activity_code}</td>
      <td className="py-2 text-zinc-700 dark:text-zinc-300">{rule.points}{rule.max_points ? ` (max ${rule.max_points})` : ""}</td>
      <td className="py-2">
        {rule.is_active ? (
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">Active</span>
        ) : (
          <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">Inactive</span>
        )}
      </td>
      <td className="py-2 text-right">
        <span className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">Edit</button>
          <form action={deleteAction} onSubmit={(e) => { if (!confirm(`Delete scoring rule "${rule.module} / ${rule.activity_code}"?`)) e.preventDefault(); }}>
            <input type="hidden" name="scoringRuleId" value={rule.id} />
            <button type="submit" className="text-xs text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300">Delete</button>
          </form>
        </span>
      </td>
    </tr>
  );
}

export default function ScoringRuleSection({ rules, canManage }: { rules: ScoringRule[]; canManage: boolean }) {
  const [createState, createAction] = useActionState(createScoringRuleAction, INIT);

  return (
    <div className="space-y-4">
      {rules.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No scoring rules yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-400 dark:text-zinc-500">
                <th className="pb-2 font-medium">Module</th>
                <th className="pb-2 font-medium">Activity</th>
                <th className="pb-2 font-medium">Points</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => <ScoringRuleRow key={r.id} rule={r} />)}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        <form action={createAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Module</label>
            <input name="module" required placeholder="reading" className="w-28 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Activity code</label>
            <input name="activityCode" required placeholder="fiction_book" className="w-36 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Points</label>
            <input name="points" type="number" step="0.01" required className="w-20 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Max points</label>
            <input name="maxPoints" type="number" step="0.01" className="w-20 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-1 pb-2 text-xs text-zinc-500 dark:text-zinc-400">
            <input type="checkbox" name="verificationRequired" defaultChecked /> Needs verification
          </label>
          <label className="flex items-center gap-1 pb-2 text-xs text-zinc-500 dark:text-zinc-400">
            <input type="checkbox" name="approvalRequired" defaultChecked /> Needs approval
          </label>
          <button type="submit" className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Add scoring rule
          </button>
          {createState.error ? <p className="w-full text-xs text-red-600 dark:text-red-400">{createState.error}</p> : null}
        </form>
      ) : null}
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Advanced condition/bonus thresholds (e.g. &quot;min 50 pages&quot;) aren&apos;t editable here yet — use this form for
        the common case of a flat points value per activity; contact support for conditional rules.
      </p>
    </div>
  );
}
