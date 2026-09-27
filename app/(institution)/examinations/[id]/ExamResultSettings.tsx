"use client";

import { useActionState, useState } from "react";
import { updateExamResultSettingsAction, setCeComponentsAction, publishExaminationAction, unpublishExaminationAction } from "../actions";

/** EXAMINATION_SPEC §8 per-exam overall pass threshold + §CE on/off/mode.
 *  Regular exams only — the Daily Assessment detail view never renders this. */
export function ExamResultSettingsForm({
  examinationId, overallPassPct, defaultPassPct, ceEnabled, ceMode, disabled,
}: {
  examinationId: string; overallPassPct: string | null; defaultPassPct: number;
  ceEnabled: boolean; ceMode: "total" | "components"; disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null; saved?: boolean }, FormData>(
    updateExamResultSettingsAction, { error: null }
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-4 text-sm">
      <input type="hidden" name="examinationId" value={examinationId} />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Overall pass % (blank = {defaultPassPct})</span>
        <input autoComplete="off" name="overallPassPct" type="number" min={0} max={100} step="0.01"
          defaultValue={overallPassPct ?? ""} disabled={disabled}
          className="w-28 rounded-full border px-2 py-1 disabled:bg-zinc-100" />
      </label>
      <label className="flex items-center gap-2">
        <input autoComplete="off" type="checkbox" name="ceEnabled" defaultChecked={ceEnabled} disabled={disabled} />
        Continuous Evaluation (CE)
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">CE mode</span>
        <select name="ceMode" defaultValue={ceMode} disabled={disabled} className="rounded-full border px-2 py-1 disabled:bg-zinc-100">
          <option value="total">Total (one CE mark)</option>
          <option value="components">Components (several CE parts)</option>
        </select>
      </label>
      {!disabled ? (
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Save
        </button>
      ) : null}
      {state.saved ? <span className="text-xs text-zinc-500">Saved.</span> : null}
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

/** One subject's CE components. Total mode: a single CE max. Components
 *  mode: named parts whose maxima sum to the subject's CE max. */
export function CeComponentsForm({
  examinationId, examSubjectId, subjectName, mode, components, disabled,
}: {
  examinationId: string; examSubjectId: string; subjectName: string; mode: "total" | "components";
  components: Array<{ name: string; maxMarks: string }>; disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null; saved?: boolean }, FormData>(
    setCeComponentsAction, { error: null }
  );
  const initial = components.length > 0 ? components : [{ name: mode === "total" ? "CE" : "", maxMarks: "" }];
  const [rows, setRows] = useState(mode === "total" ? initial.slice(0, 1) : initial);
  const ceMax = rows.reduce((a, r) => a + (Number(r.maxMarks) || 0), 0);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="examinationId" value={examinationId} />
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <span className="w-40 font-medium text-zinc-700">{subjectName}</span>
      {rows.map((r, i) => (
        <span key={i} className="flex items-center gap-1">
          {mode === "components" ? (
            <input autoComplete="off" name="ceName" placeholder="Part name" value={r.name} disabled={disabled}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              className="w-28 rounded-full border px-2 py-1 disabled:bg-zinc-100" />
          ) : <input type="hidden" name="ceName" value="CE" />}
          <input autoComplete="off" name="ceMax" type="number" min={0} step="0.01" placeholder="Max" value={r.maxMarks} disabled={disabled}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, maxMarks: e.target.value } : x)))}
            className="w-20 rounded-full border px-2 py-1 disabled:bg-zinc-100" />
          {mode === "components" && !disabled && rows.length > 1 ? (
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-xs text-red-600" aria-label="Remove part">×</button>
          ) : null}
        </span>
      ))}
      {mode === "components" && !disabled ? (
        <button type="button" onClick={() => setRows([...rows, { name: "", maxMarks: "" }])} className="text-xs text-zinc-600 underline">+ part</button>
      ) : null}
      <span className="text-xs text-zinc-500">CE max {ceMax}</span>
      {!disabled ? (
        <button type="submit" disabled={pending} className="rounded-full border px-3 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50">Save CE</button>
      ) : null}
      {state.saved ? <span className="text-xs text-zinc-500">Saved.</span> : null}
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

/** §"the admin/principal should publish result of an exam for viewing it
 *  in student/parent portal" — staff-side views never gate on this at all
 *  (this is purely a portal-visibility toggle, unlike the old finalize/
 *  freeze action it replaces). Toggleable any number of times: publishing
 *  again after a correction, or unpublishing to pull a result back, are
 *  both ordinary, non-destructive actions — no confirmation dialog needed
 *  the way an irreversible freeze would have required. */
export function PublishResultsButton({ examinationId, published }: { examinationId: string; published: boolean }) {
  const [publishState, publishAction, publishPending] = useActionState<{ error: string | null }, FormData>(
    publishExaminationAction, { error: null }
  );
  const [unpublishState, unpublishAction, unpublishPending] = useActionState<{ error: string | null }, FormData>(
    unpublishExaminationAction, { error: null }
  );
  const state = published ? unpublishState : publishState;
  return (
    <form action={published ? unpublishAction : publishAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="examinationId" value={examinationId} />
      {published ? (
        <button type="submit" disabled={unpublishPending} className="rounded-full border px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50">
          Unpublish from portal
        </button>
      ) : (
        <button type="submit" disabled={publishPending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Publish to student/parent portal
        </button>
      )}
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
