"use client";

import { useActionState, useState } from "react";
import { submitSkillAction } from "./actions";

interface Activity { id: string; skill_type_id: string; name: string }

export default function SubmitSkillForm({
  students,
  skillTypes,
  activities,
}: {
  students: Array<{ id: string; full_name: string }>;
  skillTypes: Array<{ id: string; name: string }>;
  activities: Activity[];
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(submitSkillAction, { error: null });
  const [skillTypeId, setSkillTypeId] = useState(skillTypes[0]?.id ?? "");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Student</label>
        <select name="studentId" required className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Skill type</label>
        <select
          value={skillTypeId}
          onChange={(e) => setSkillTypeId(e.target.value)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
        >
          {skillTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Activity</label>
        <select name="skillActivityId" required className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          {activities.filter((a) => a.skill_type_id === skillTypeId).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Notes</label>
        <input name="notes" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Evidence (optional)</label>
        <input name="evidence" type="file" className="w-48 rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
      </div>
      <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Submit
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
