"use client";

import { useActionState, useState } from "react";
import { upsertTimetablePeriodAction } from "../actions";

const DAY_OPTIONS = [
  { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" }, { value: 5, label: "Friday" }, { value: 6, label: "Saturday" }, { value: 7, label: "Sunday" },
];

export default function AddTimetablePeriodForm({
  classes, sections, subjects, teachers,
}: {
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; class_id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; full_name: string }>;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(upsertTimetablePeriodAction, { error: null });
  const [classId, setClassId] = useState("");

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class</label>
        <select name="classId" value={classId} onChange={(e) => setClassId(e.target.value)} required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]">
          <option value="">Select…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Section</label>
        <select name="sectionId" required defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]">
          <option value="">Select…</option>
          {sections.filter((s) => !classId || s.class_id === classId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Day</label>
        <select name="dayOfWeek" required defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]">
          <option value="">Select…</option>
          {DAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Period no.</label>
        <input type="number" name="periodNo" min={1} max={20} required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Subject</label>
        <select name="subjectId" defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]">
          <option value="">—</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Teacher</label>
        <select name="teacherStaffId" defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]">
          <option value="">— Free period —</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2 lg:col-span-6 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {pending ? "Saving…" : "Save period"}
        </button>
        {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      </div>
    </form>
  );
}
