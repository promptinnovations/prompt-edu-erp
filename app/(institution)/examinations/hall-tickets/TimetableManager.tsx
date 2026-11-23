"use client";

import { useActionState } from "react";
import {
  addTimetableEntryAction, addTimetableTextAction, deleteTimetableEntryAction, copyTimetableAction, type HallState,
} from "./actions";
import type { ExamTimetableRow } from "../../../../modules/examination/hall-ticket-service";
import { formatClock } from "../../../../modules/examination/hall-ticket-service";

const INPUT = "rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";
const BTN = "rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50";
const EMPTY: HallState = { error: null, message: null };

function Msg({ s }: { s: HallState }) {
  return <>{s.error ? <span className="text-sm text-red-600">{s.error}</span> : null}{s.message ? <span className="text-sm text-zinc-600">{s.message}</span> : null}</>;
}

/** Feeds one grade's examination timetable: one paper at a time, a pasted list, or copied from another grade. */
export default function TimetableManager({ examinationId, classId, className, entries, subjects, otherClasses }: {
  examinationId: string; classId: string; className: string; entries: ExamTimetableRow[];
  subjects: { id: string; name: string }[]; otherClasses: { id: string; name: string }[];
}) {
  const [addState, addAction, adding] = useActionState<HallState, FormData>(addTimetableEntryAction, EMPTY);
  const [textState, textAction, textPending] = useActionState<HallState, FormData>(addTimetableTextAction, EMPTY);
  const [delState, delAction] = useActionState<HallState, FormData>(deleteTimetableEntryAction, EMPTY);
  const [copyState, copyAction, copying] = useActionState<HallState, FormData>(copyTimetableAction, EMPTY);
  const hidden = (<><input type="hidden" name="examinationId" value={examinationId} /><input type="hidden" name="classId" value={classId} /></>);

  return (
    <div className="space-y-5">
      <form action={addAction} className="flex flex-wrap items-end gap-2">
        {hidden}
        <div><label className="mb-1 block text-xs text-zinc-500">Date</label><input type="date" name="examDate" required className={INPUT} /></div>
        <div><label className="mb-1 block text-xs text-zinc-500">From</label><input type="time" name="startTime" required className={INPUT} /></div>
        <div><label className="mb-1 block text-xs text-zinc-500">To (optional)</label><input type="time" name="endTime" className={INPUT} /></div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Subject</label>
          <select name="subjectId" defaultValue="" className={`w-44 ${INPUT}`}>
            <option value="">Type a name →</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="mb-1 block text-xs text-zinc-500">…or type the paper name</label><input name="subjectLabel" autoComplete="off" placeholder="e.g. Malayalam II" className={`w-44 ${INPUT}`} /></div>
        <button type="submit" disabled={adding} className={BTN}>Add paper</button>
        <Msg s={addState} />
      </form>

      <details className="rounded-lg border border-[var(--border-subtle)] p-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--brand)]">Paste a whole timetable for {className}</summary>
        <form action={textAction} className="mt-3 space-y-2">
          {hidden}
          <p className="text-xs text-zinc-500">One paper per line: <code>date, time, subject</code> — e.g. <code>2026-12-01, 10:00-12:00, English</code> or <code>01/12/2026, 10 AM - 12 PM, Maths</code>. Several papers on one day are fine.</p>
          <textarea name="text" rows={6} className={`w-full ${INPUT}`} placeholder={"2026-12-01, 10:00-12:00, English\n2026-12-02, 10:00-12:00, Mathematics"} />
          <div className="flex items-center gap-3"><button type="submit" disabled={textPending} className={BTN}>Add these papers</button><Msg s={textState} /></div>
        </form>
      </details>

      {delState.error ? <p className="text-sm text-red-600">{delState.error}</p> : null}
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">No papers fed for {className} yet — students of this grade will not get a ticket until you add some.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-1.5">{e.examDate}</td>
                  <td className="px-3 py-1.5">{formatClock(e.startTime)}{e.endTime ? ` – ${formatClock(e.endTime)}` : ""}</td>
                  <td className="px-3 py-1.5">{e.subjectLabel}</td>
                  <td className="px-3 py-1.5 text-right">
                    <form action={delAction}><input type="hidden" name="entryId" value={e.id} /><button type="submit" className="text-xs text-red-600 underline">Remove</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.length > 0 && otherClasses.length > 0 ? (
        <details className="rounded-lg border border-[var(--border-subtle)] p-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--brand)]">Copy this timetable to other grades</summary>
          <form action={copyAction} className="mt-3 space-y-2">
            {hidden}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {otherClasses.map((c) => <label key={c.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="toClassIds" value={c.id} /> {c.name}</label>)}
            </div>
            <p className="text-xs text-amber-700">This replaces any timetable the chosen grades already have for this examination.</p>
            <div className="flex items-center gap-3"><button type="submit" disabled={copying} className={BTN}>Copy</button><Msg s={copyState} /></div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
