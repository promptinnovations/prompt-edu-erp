"use client";

import { useActionState, useState } from "react";
import { addLearnerEntryAction } from "./learner-record-actions";
import { LEARNER_SECTIONS, SECTION_META, type LearnerSection } from "../../../modules/learner-record/meta";

/** Teacher-side entry form for one Learner Record section. */
export default function LearnerEntryForm({ studentId, defaultSection }: { studentId: string; defaultSection?: LearnerSection }) {
  const [state, action, pending] = useActionState<{ error: string | null }, FormData>(addLearnerEntryAction, { error: null });
  const [section, setSection] = useState<LearnerSection>(defaultSection ?? "quran");
  const m = SECTION_META[section];
  const input = "w-full rounded-lg border border-[var(--border-subtle)] bg-white px-2.5 py-1.5 text-sm";
  return (
    <form action={action} className="space-y-2 rounded-xl border border-[var(--border-subtle)] p-4">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="flex flex-wrap items-center gap-2">
        <select name="section" value={section} onChange={(e) => setSection(e.target.value as LearnerSection)} className={`${input} max-w-xs`}>
          {LEARNER_SECTIONS.map((s) => <option key={s} value={s}>{SECTION_META[s].label}</option>)}
        </select>
        <input type="date" name="entryDate" className={`${input} max-w-[10rem]`} aria-label="Date" />
        <input name="period" placeholder="Term / period (optional)" className={`${input} max-w-[12rem]`} />
      </div>
      <p className="text-xs text-zinc-500">{m.hint}</p>
      <input name="title" required placeholder={m.titleLabel} className={input} />
      {m.valueLabel ? <input name="value" placeholder={m.valueLabel} className={input} /> : null}
      {m.levelLabel ? <input name="level" placeholder={m.levelLabel} className={input} /> : null}
      {m.showHours ? <input name="hours" type="number" step="0.5" min="0" placeholder="Hours (optional)" className={`${input} max-w-[10rem]`} /> : null}
      <textarea name="detail" rows={2} placeholder={section === "teacher_comment" || section === "reflection" ? "Write the comment" : "Details (optional)"} className={input} />
      <input name="evidence" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="text-xs text-zinc-600" />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">Save to Learner Record</button>
        {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
