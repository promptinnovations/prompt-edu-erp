"use client";

import { useActionState, useState } from "react";
import {
  createSkillTypeAction, updateSkillTypeAction, deleteSkillTypeAction,
  createSkillActivityAction, updateSkillActivityAction, deleteSkillActivityAction,
  type GradingActionState,
} from "./actions";

interface SkillType { id: string; code: string; name: string }
interface SkillActivity { id: string; skill_type_id: string; name: string; is_active: boolean }

const INIT: GradingActionState = { error: null };

function ActivityRow({ activity, canManage }: { activity: SkillActivity; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateSkillActivityAction, INIT);
  const [deleteState, deleteAction] = useActionState(deleteSkillActivityAction, INIT);

  if (editing) {
    return (
      <li className="py-1">
        <form action={updateAction} className="flex flex-wrap items-center gap-2" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="skillActivityId" value={activity.id} />
          <input name="name" defaultValue={activity.name} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
          <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <input type="checkbox" name="isActive" defaultChecked={activity.is_active} /> Active
          </label>
          <button type="submit" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">Cancel</button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600 dark:text-red-400">{updateState.error}</span> : null}
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-zinc-900 dark:text-zinc-50">
        {activity.name}{" "}
        {!activity.is_active ? <span className="ml-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">Inactive</span> : null}
      </span>
      {canManage ? (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">Edit</button>
          <form action={deleteAction} onSubmit={(e) => { if (!confirm(`Delete activity "${activity.name}"?`)) e.preventDefault(); }}>
            <input type="hidden" name="skillActivityId" value={activity.id} />
            <button type="submit" className="text-xs text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300">Delete</button>
          </form>
        </span>
      ) : null}
      {deleteState.error ? <span className="text-xs text-red-600 dark:text-red-400">{deleteState.error}</span> : null}
    </li>
  );
}

function SkillTypeCard({
  type, activities, canManage,
}: { type: SkillType; activities: SkillActivity[]; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateSkillTypeAction, INIT);
  const [deleteState, deleteAction] = useActionState(deleteSkillTypeAction, INIT);
  const [, addActivityAction] = useActionState(createSkillActivityAction, INIT);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        {editing ? (
          <form action={updateAction} className="flex items-center gap-2" onSubmit={() => setEditing(false)}>
            <input type="hidden" name="skillTypeId" value={type.id} />
            <input name="name" defaultValue={type.name} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
            <button type="submit" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">Cancel</button>
          </form>
        ) : (
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{type.name}</h3>
        )}
        {canManage && !editing ? (
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">Rename</button>
            <form action={deleteAction} onSubmit={(e) => { if (!confirm(`Delete skill type "${type.name}"?`)) e.preventDefault(); }}>
              <input type="hidden" name="skillTypeId" value={type.id} />
              <button type="submit" className="text-xs text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300">Delete</button>
            </form>
          </span>
        ) : null}
      </div>
      {updateState.error ? <p className="mb-2 text-xs text-red-600 dark:text-red-400">{updateState.error}</p> : null}
      {deleteState.error ? <p className="mb-2 text-xs text-red-600 dark:text-red-400">{deleteState.error}</p> : null}

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {activities.length === 0 ? <li className="py-1 text-xs text-zinc-400 dark:text-zinc-500">No activities yet.</li> : null}
        {activities.map((a) => <ActivityRow key={a.id} activity={a} canManage={canManage} />)}
      </ul>

      {canManage ? (
        <form action={addActivityAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <input type="hidden" name="skillTypeId" value={type.id} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">New activity</label>
            <input name="name" required placeholder="e.g. Weekly reading log" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-1 pb-2 text-xs text-zinc-500 dark:text-zinc-400">
            <input type="checkbox" name="evidenceRequired" /> Evidence
          </label>
          <label className="flex items-center gap-1 pb-2 text-xs text-zinc-500 dark:text-zinc-400">
            <input type="checkbox" name="verificationRequired" defaultChecked /> Verification
          </label>
          <label className="flex items-center gap-1 pb-2 text-xs text-zinc-500 dark:text-zinc-400">
            <input type="checkbox" name="approvalRequired" /> Approval
          </label>
          <button type="submit" className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Add activity
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default function SkillConfigSection({
  skillTypes, activitiesByType, canManage,
}: { skillTypes: SkillType[]; activitiesByType: Record<string, SkillActivity[]>; canManage: boolean }) {
  const [, createAction] = useActionState(createSkillTypeAction, INIT);

  return (
    <div className="space-y-4">
      {skillTypes.length === 0 ? <p className="text-sm text-zinc-400 dark:text-zinc-500">No skill types yet.</p> : null}
      {skillTypes.map((t) => (
        <SkillTypeCard key={t.id} type={t} activities={activitiesByType[t.id] ?? []} canManage={canManage} />
      ))}

      {canManage ? (
        <form action={createAction} className="flex items-end gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">New skill type</label>
            <input name="name" required placeholder="e.g. Reading" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
          </div>
          <button type="submit" className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Add skill type
          </button>
        </form>
      ) : null}
    </div>
  );
}
