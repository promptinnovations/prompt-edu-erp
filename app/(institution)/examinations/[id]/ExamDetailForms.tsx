"use client";

import { useActionState } from "react";
import {
  bulkSetExamScopeAction, removeExamClassAction,
  bulkAddExamSubjectsAction, removeExamSubjectAction,
  computeResultsAction,
} from "../actions";

/** §418 "confirm scope of exam, section, grade, division — make user
 *  friendly": every division (or whole-class row for a class with no
 *  divisions yet) is a checkbox, grouped under its class, with a per-class
 *  "select all" — one Save links everything checked in a single submit,
 *  instead of the old one-class-at-a-time dropdown+button. Already-linked
 *  rows are listed below with their own Remove, so the admin can actually
 *  see and undo the scope they've set, not just add to it blindly. */
export function ExamScopeSection({
  examinationId, classGroups, linked,
}: {
  examinationId: string;
  classGroups: Array<{ classId: string; className: string; divisions: Array<{ sectionId: string; sectionName: string }> }>;
  linked: Array<{ examClassId: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null; added?: number }, FormData>(
    bulkSetExamScopeAction, { error: null }
  );
  const [removeState, removeAction] = useActionState<{ error: string | null }, FormData>(removeExamClassAction, { error: null });

  return (
    <div className="space-y-4">
      {linked.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">Already confirmed for this exam</p>
          <ul className="flex flex-wrap gap-2">
            {linked.map((l) => (
              <li key={l.examClassId} className="flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300">
                {l.label}
                <form action={removeAction} className="inline">
                  <input type="hidden" name="examinationId" value={examinationId} />
                  <input type="hidden" name="examClassId" value={l.examClassId} />
                  <button type="submit" className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400" aria-label={`Remove ${l.label}`}>×</button>
                </form>
              </li>
            ))}
          </ul>
          {removeState.error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{removeState.error}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">No grades/divisions confirmed yet — check the ones below and Save.</p>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="examinationId" value={examinationId} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {classGroups.map((g) => (
            <fieldset key={g.classId} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
              <legend className="px-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Class {g.className}</legend>
              {g.divisions.length === 0 ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="sectionAndClass" value={`${g.classId}|`} className="rounded border-zinc-300 dark:border-zinc-700" />
                  Whole class (no divisions)
                </label>
              ) : (
                <div className="space-y-1">
                  {g.divisions.map((d) => (
                    <label key={d.sectionId} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="sectionAndClass" value={`${g.classId}|${d.sectionId}`} className="rounded border-zinc-300 dark:border-zinc-700" />
                      Division {d.sectionName}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
          {classGroups.length === 0 ? <p className="text-sm text-zinc-400 dark:text-zinc-500">No classes set up yet.</p> : null}
        </div>
        <button type="submit" disabled={pending || classGroups.length === 0} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Confirm scope
        </button>
        {typeof state.added === "number" ? <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">{state.added} confirmed.</span> : null}
        {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      </form>
    </div>
  );
}

/** §418 companion for subjects — same "check several, one Save" shape as
 *  ExamScopeSection above, with per-subject max/pass marks inline (default
 *  100/35, editable per row before submitting) instead of adding one
 *  subject at a time. */
export function ExamSubjectsSection({
  examinationId, subjects, linked,
}: {
  examinationId: string;
  subjects: Array<{ id: string; name: string }>;
  linked: Array<{ examSubjectId: string; subjectId: string; name: string; maxMarks: string; passMarks: string }>;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null; added?: number }, FormData>(
    bulkAddExamSubjectsAction, { error: null }
  );
  const [removeState, removeAction] = useActionState<{ error: string | null }, FormData>(removeExamSubjectAction, { error: null });
  const linkedIds = new Set(linked.map((l) => l.subjectId));
  const remaining = subjects.filter((s) => !linkedIds.has(s.id));

  return (
    <div className="space-y-4">
      {linked.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr><th className="py-1.5">Subject</th><th className="py-1.5">Max</th><th className="py-1.5">Pass</th><th className="py-1.5" /><th className="py-1.5" /></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {linked.map((l) => (
                <tr key={l.examSubjectId}>
                  <td className="py-1.5">{l.name}</td>
                  <td className="py-1.5">{l.maxMarks}</td>
                  <td className="py-1.5">{l.passMarks}</td>
                  <td className="py-1.5">
                    <a href={`/examinations/${examinationId}/marks/${l.examSubjectId}`} className="text-xs text-zinc-600 dark:text-zinc-400 underline">Enter marks</a>
                  </td>
                  <td className="py-1.5 text-right">
                    <form action={removeAction} className="inline">
                      <input type="hidden" name="examinationId" value={examinationId} />
                      <input type="hidden" name="examSubjectId" value={l.examSubjectId} />
                      <button type="submit" className="text-xs text-red-600 dark:text-red-400 underline hover:text-red-800">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {removeState.error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{removeState.error}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">No subjects added yet — check the ones below, set marks, and Save.</p>
      )}

      {remaining.length > 0 ? (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="examinationId" value={examinationId} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <tr><th className="py-1.5" /><th className="py-1.5">Subject</th><th className="py-1.5">Max marks</th><th className="py-1.5">Pass marks</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {remaining.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5">
                      <input type="checkbox" name="subjectId" value={s.id} className="rounded border-zinc-300 dark:border-zinc-700" />
                    </td>
                    <td className="py-1.5">{s.name}</td>
                    <td className="py-1.5">
                      <input name={`max_${s.id}`} type="number" defaultValue={100} className="w-20 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
                    </td>
                    <td className="py-1.5">
                      <input name={`pass_${s.id}`} type="number" defaultValue={35} className="w-20 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Add checked subjects
          </button>
          {typeof state.added === "number" ? <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">{state.added} added.</span> : null}
          {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

export function ComputeResultsButton({ examinationId }: { examinationId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(computeResultsAction, { error: null });
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="examinationId" value={examinationId} />
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Compute results
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
