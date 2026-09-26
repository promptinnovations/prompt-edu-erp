"use client";

import { useActionState, useMemo, useState } from "react";
import { saveExamScopePlanAction, removeExamSubjectAction } from "../actions";
import type { ExamScopePlan, ExamScopePlanGrade } from "../../../../modules/examination/service";
import { formatMarks } from "../../../../services/format/marks";

interface GradeState { inScope: boolean; sectionIds: Set<string>; subjectIds: Set<string> }

/** Migration 0056 — "Section (HS, UP, LP etc.) > Grades > Divisions - for
 *  each grade an option for choosing relevant subject for the exam. button
 *  for selecting all also should be there. this must be applicable for all
 *  tenants." Sections, grades, divisions and each grade's offered subjects
 *  all come from the institution's own data (getExamScopePlan()); nothing
 *  here assumes a particular stage vocabulary. One Save posts the whole
 *  plan; only ticked subjects of a ticked grade get linked to that grade.
 *  Subjects/divisions that already have marks are shown locked (the server
 *  refuses to drop them too). */
export function ExamScopePlanner({ examinationId, plan }: { examinationId: string; plan: ExamScopePlan }) {
  const [state, formAction, pending] = useActionState<{ error: string | null; saved?: string }, FormData>(
    saveExamScopePlanAction, { error: null }
  );
  const allGrades = useMemo(() => plan.sections.flatMap((s) => s.grades), [plan]);
  const [grades, setGrades] = useState<Record<string, GradeState>>(() => Object.fromEntries(allGrades.map((g) => [g.classId, {
    inScope: g.inScope,
    sectionIds: new Set(g.divisions.filter((d) => d.selected).map((d) => d.sectionId)),
    subjectIds: new Set(g.selectedSubjectIds),
  }])));
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(
    plan.sections.map((s) => [s.key, s.grades.some((g) => g.inScope)])
  ));
  const disabled = plan.isFinalized;

  const update = (classId: string, fn: (g: GradeState) => GradeState) =>
    setGrades((prev) => ({ ...prev, [classId]: fn(prev[classId]) }));

  const toggleGrade = (g: ExamScopePlanGrade, on: boolean) => update(g.classId, (st) => ({
    inScope: on,
    // Turning a grade on defaults to every division + every subject taught
    // at that grade — the admin then unticks what the exam doesn't cover.
    sectionIds: on && st.sectionIds.size === 0 ? new Set(g.divisions.map((d) => d.sectionId)) : st.sectionIds,
    subjectIds: on && st.subjectIds.size === 0 ? new Set(g.subjectOptions.filter((o) => o.taughtHere).map((o) => o.subjectId)) : st.subjectIds,
  }));

  const toggleIn = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id); else next.delete(id);
    return next;
  };

  const payload = JSON.stringify(allGrades.filter((g) => grades[g.classId]?.inScope).map((g) => ({
    classId: g.classId,
    sectionIds: [...grades[g.classId].sectionIds],
    subjectIds: [...grades[g.classId].subjectIds],
  })));
  const inScopeCount = allGrades.filter((g) => grades[g.classId]?.inScope).length;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="examinationId" value={examinationId} />
      <input type="hidden" name="plan" value={payload} />
      {plan.sections.length === 0 ? <p className="text-sm text-zinc-500">No grades set up yet (Academic Setup).</p> : null}
      {plan.sections.map((sec) => {
        const secOn = sec.grades.filter((g) => grades[g.classId]?.inScope).length;
        return (
          <fieldset key={sec.key} className="rounded-card border">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [sec.key]: !o[sec.key] }))}
                className="flex items-center gap-2 text-sm font-semibold text-[var(--heading)]" aria-expanded={Boolean(open[sec.key])}>
                <span aria-hidden>{open[sec.key] ? "▾" : "▸"}</span>
                Section {sec.label}
                <span className="text-xs font-normal text-zinc-500">{secOn}/{sec.grades.length} grades</span>
              </button>
              {!disabled ? (
                <span className="flex gap-2 text-xs">
                  <button type="button" className="underline" onClick={() => { sec.grades.forEach((g) => toggleGrade(g, true)); setOpen((o) => ({ ...o, [sec.key]: true })); }}>All grades</button>
                  <button type="button" className="underline" onClick={() => sec.grades.forEach((g) => update(g.classId, (st) => ({ ...st, inScope: false })))}>None</button>
                </span>
              ) : null}
            </div>
            {open[sec.key] ? (
              <div className="space-y-2 border-t px-3 py-2">
                {sec.grades.map((g) => {
                  const st = grades[g.classId];
                  const locked = new Set(g.lockedSubjectIds);
                  const taught = g.subjectOptions.filter((o) => o.taughtHere);
                  return (
                    <div key={g.classId} className="rounded-card border p-2">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input autoComplete="off" type="checkbox" className="rounded" checked={st.inScope} disabled={disabled}
                          onChange={(e) => toggleGrade(g, e.target.checked)} />
                        Grade {g.className}
                      </label>
                      {st.inScope ? (
                        <div className="mt-2 grid gap-3 pl-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                          <div>
                            <p className="mb-1 text-xs font-medium text-zinc-500">Divisions</p>
                            {g.hasDivisions ? (
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {g.divisions.map((d) => (
                                  <label key={d.sectionId} className="flex items-center gap-1.5 text-sm">
                                    <input autoComplete="off" type="checkbox" className="rounded" disabled={disabled}
                                      checked={st.sectionIds.has(d.sectionId)}
                                      onChange={(e) => update(g.classId, (s) => ({ ...s, sectionIds: toggleIn(s.sectionIds, d.sectionId, e.target.checked) }))} />
                                    {d.name}{d.hasMarks ? <span className="text-xs text-zinc-400" title="Marks entered">•</span> : null}
                                  </label>
                                ))}
                              </div>
                            ) : <p className="text-sm text-zinc-500">Whole grade (no divisions)</p>}
                          </div>
                          <div>
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <p className="text-xs font-medium text-zinc-500">Subjects for this exam</p>
                              {!disabled ? (
                                <>
                                  <button type="button" className="text-xs underline"
                                    onClick={() => update(g.classId, (s) => ({ ...s, subjectIds: new Set([...taught.map((o) => o.subjectId), ...locked]) }))}>
                                    Select all
                                  </button>
                                  <button type="button" className="text-xs underline"
                                    onClick={() => update(g.classId, (s) => ({ ...s, subjectIds: new Set(locked) }))}>
                                    Clear
                                  </button>
                                </>
                              ) : null}
                            </div>
                            {!g.subjectsConfigured ? (
                              <p className="mb-1 text-xs text-amber-700">No subjects are linked to this grade in Academic Setup — showing every subject.</p>
                            ) : null}
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {g.subjectOptions.map((o) => (
                                <label key={o.subjectId} className="flex items-center gap-1.5 text-sm">
                                  <input autoComplete="off" type="checkbox" className="rounded"
                                    disabled={disabled || locked.has(o.subjectId)}
                                    checked={st.subjectIds.has(o.subjectId)}
                                    onChange={(e) => update(g.classId, (s) => ({ ...s, subjectIds: toggleIn(s.subjectIds, o.subjectId, e.target.checked) }))} />
                                  {o.name}
                                  {locked.has(o.subjectId) ? <span className="text-xs text-zinc-400">(marks entered)</span> : null}
                                  {!o.taughtHere ? <span className="text-xs text-amber-700">(not taught here)</span> : null}
                                </label>
                              ))}
                              {g.subjectOptions.length === 0 ? <span className="text-sm text-zinc-500">No subjects set up yet.</span> : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </fieldset>
        );
      })}
      {!disabled ? (
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Max marks (new subjects)</span>
            <input autoComplete="off" name="defaultMaxMarks" type="number" min={1} defaultValue={100} className="w-24 rounded-full border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Pass marks (new subjects)</span>
            <input autoComplete="off" name="defaultPassMarks" type="number" min={0} defaultValue={35} className="w-24 rounded-full border px-2 py-1" />
          </label>
          <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Save scope &amp; subjects ({inScopeCount} grade{inScopeCount === 1 ? "" : "s"})
          </button>
          {state.saved ? <span className="text-zinc-500">{state.saved}</span> : null}
        </div>
      ) : <p className="text-xs text-zinc-500">Results are finalized — scope is locked.</p>}
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

/** Subjects this exam covers, with the grades each is set for and the
 *  "Enter marks" link (the per-subject grid only lists students of those
 *  grades). Adding subjects happens per grade in ExamScopePlanner above. */
export function ExamSubjectsSection({
  examinationId, linked, canManage = true,
}: {
  examinationId: string;
  linked: Array<{ examSubjectId: string; subjectId: string; name: string; maxMarks: string; passMarks: string; grades: string[] }>;
  /** §CS.2 — false for anyone without settings.manage (teachers): read-only
   *  table with "Enter marks" links, no Remove. */
  canManage?: boolean;
}) {
  const [removeState, removeAction] = useActionState<{ error: string | null }, FormData>(removeExamSubjectAction, { error: null });

  if (linked.length === 0) {
    return <p className="text-xs text-zinc-500">No subjects yet{canManage ? " — tick a grade's subjects in the scope above and Save." : "."}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
          <tr><th className="py-1.5">Subject</th><th className="py-1.5">Grades</th><th className="py-1.5">Max</th><th className="py-1.5">Pass</th><th className="py-1.5" /><th className="py-1.5" /></tr>
        </thead>
        <tbody className="divide-y">
          {linked.map((l) => (
            <tr key={l.examSubjectId}>
              <td className="py-1.5">{l.name}</td>
              <td className="py-1.5 text-xs text-zinc-600">{l.grades.length > 0 ? l.grades.join(", ") : "—"}</td>
              <td className="py-1.5">{formatMarks(l.maxMarks)}</td>
              <td className="py-1.5">{formatMarks(l.passMarks)}</td>
              <td className="py-1.5">
                <a href={`/examinations/${examinationId}/marks/${l.examSubjectId}`} className="text-xs text-zinc-600 underline">Enter marks</a>
              </td>
              <td className="py-1.5 text-right">
                {canManage ? (
                  <form action={removeAction} className="inline">
                    <input type="hidden" name="examinationId" value={examinationId} />
                    <input type="hidden" name="examSubjectId" value={l.examSubjectId} />
                    <button type="submit" className="text-xs text-red-600 underline hover:text-red-800">Remove</button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {removeState.error ? <p className="mt-1 text-xs text-red-600">{removeState.error}</p> : null}
    </div>
  );
}
