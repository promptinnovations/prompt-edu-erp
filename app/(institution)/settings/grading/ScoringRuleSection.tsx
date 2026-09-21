"use client";

import { useActionState, useState } from "react";
import { createScoringRuleAction, updateScoringRuleAction, deleteScoringRuleAction, type GradingActionState } from "./actions";
import ConfirmSubmitButton from "../../../components/ui/ConfirmSubmitButton";

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
      <tr className="border-b">
        <td colSpan={5} className="py-2">
          <form action={updateAction} className="flex flex-wrap items-center gap-2" onSubmit={() => setEditing(false)}>
            <input type="hidden" name="scoringRuleId" value={rule.id} />
            <span className="text-sm text-zinc-500">{rule.module} / {rule.activity_code}</span>
            <label className="text-xs text-zinc-500">Points
              <input name="points" type="number" step="0.01" defaultValue={rule.points} className="ml-1 w-20 rounded-full border px-2 py-1 text-xs" />
            </label>
            <label className="text-xs text-zinc-500">Max
              <input name="maxPoints" type="number" step="0.01" defaultValue={rule.max_points ?? ""} className="ml-1 w-20 rounded-full border px-2 py-1 text-xs" />
            </label>
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              <input type="checkbox" name="isActive" defaultChecked={rule.is_active} /> Active
            </label>
            <button type="submit" className="rounded-full border px-2 py-1 text-xs hover:bg-zinc-100">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
          </form>
          {updateState.error ? <p className="mt-1 text-xs text-red-600">{updateState.error}</p> : null}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b">
      <td className="py-2 text-zinc-500">{rule.module}</td>
      <td className="py-2 text-zinc-900">{rule.activity_code}</td>
      <td className="py-2 text-zinc-700">{rule.points}{rule.max_points ? ` (max ${rule.max_points})` : ""}</td>
      <td className="py-2">
        {rule.is_active ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Active</span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">Inactive</span>
        )}
      </td>
      <td className="py-2 text-right">
        <span className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">Edit</button>
          <form action={deleteAction}>
            <input type="hidden" name="scoringRuleId" value={rule.id} />
            <ConfirmSubmitButton message={`Delete scoring rule "${rule.module} / ${rule.activity_code}"?`} className="text-xs text-red-600 underline hover:text-red-800">Delete</ConfirmSubmitButton>
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
        <p className="text-sm text-zinc-500">No scoring rules yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-500">
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
        <form action={createAction} className="flex flex-wrap items-end gap-2 rounded-card border border-dashed p-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Module</label>
            <input name="module" required placeholder="reading" className="w-28 rounded-full border px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Activity code</label>
            <input name="activityCode" required placeholder="fiction_book" className="w-36 rounded-full border px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Points</label>
            <input name="points" type="number" step="0.01" required className="w-20 rounded-full border px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Max points</label>
            <input name="maxPoints" type="number" step="0.01" className="w-20 rounded-full border px-2 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-1 pb-2 text-xs text-zinc-500">
            <input type="checkbox" name="verificationRequired" defaultChecked /> Needs verification
          </label>
          <label className="flex items-center gap-1 pb-2 text-xs text-zinc-500">
            <input type="checkbox" name="approvalRequired" defaultChecked /> Needs approval
          </label>
          <button type="submit" className="rounded-full bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Add scoring rule
          </button>
          {createState.error ? <p className="w-full text-xs text-red-600">{createState.error}</p> : null}
        </form>
      ) : null}
      <p className="text-xs text-zinc-500">
        Advanced condition/bonus thresholds (e.g. &quot;min 50 pages&quot;) aren&apos;t editable here yet — use this form for
        the common case of a flat points value per activity; contact support for conditional rules.
      </p>
    </div>
  );
}
