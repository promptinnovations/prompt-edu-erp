"use client";

import { useActionState } from "react";
import { createMentoringRecordAction, updateMentoringRecordAction } from "./actions";

export interface MentoringRow {
  id: string; student_id: string; student_name: string; mentor_id: string; mentor_name: string;
  date: string; academic_observation: string | null; behaviour_observation: string | null;
  strengths: string | null; challenges: string | null; goals: string | null; action_plan: string | null;
  follow_up_date: string | null; confidentiality_level: string;
}

function EditGoalsForm({ record }: { record: MentoringRow }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateMentoringRecordAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-1">
      <input type="hidden" name="mentoringRecordId" value={record.id} />
      <input name="goals" defaultValue={record.goals ?? ""} placeholder="Goals" className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs" />
      <input name="actionPlan" defaultValue={record.action_plan ?? ""} placeholder="Action plan" className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs" />
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">
        Save
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

export default function MentoringSection({
  students, records, canCreate, ownMentorStaffId,
}: {
  students: Array<{ id: string; full_name: string }>;
  records: MentoringRow[];
  canCreate: boolean;
  ownMentorStaffId: string | null;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createMentoringRecordAction, { error: null });

  return (
    <div className="space-y-4">
      {canCreate && ownMentorStaffId ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Student</label>
            <select name="studentId" required className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
              {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Date</label>
            <input type="date" name="date" required className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Academic observation</label>
            <input name="academicObservation" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Behaviour observation</label>
            <input name="behaviourObservation" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Goals</label>
            <input name="goals" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Confidentiality</label>
            <select name="confidentialityLevel" className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
              <option value="standard">Standard</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
          <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Save note
          </button>
          {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
        </form>
      ) : canCreate ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          You have mentoring.create, but no staff record yet — ask an admin to add you under Staff first.
        </p>
      ) : null}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <tr>
            <th className="py-1.5">Student</th>
            <th className="py-1.5">Mentor</th>
            <th className="py-1.5">Date</th>
            <th className="py-1.5">Goals / Action plan</th>
            <th className="py-1.5">Confidentiality</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {records.map((r) => (
            <tr key={r.id}>
              <td className="py-1.5">{r.student_name}</td>
              <td className="py-1.5">{r.mentor_name}</td>
              <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{r.date}</td>
              <td className="py-1.5">
                {r.mentor_id === ownMentorStaffId ? (
                  <EditGoalsForm record={r} />
                ) : (
                  <span>{r.goals || r.action_plan || "—"}</span>
                )}
              </td>
              <td className="py-1.5 capitalize">{r.confidentiality_level}</td>
            </tr>
          ))}
          {records.length === 0 ? (
            <tr><td colSpan={5} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No mentoring records visible to you yet.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
