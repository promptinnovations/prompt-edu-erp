"use client";

import { useActionState, useState } from "react";
import {
  updateExamResultSettingsAction, setCeComponentsAction, publishExaminationAction, unpublishExaminationAction,
  closeMarkEntryAction, reopenMarkEntryAction, archiveExaminationAction,
} from "../actions";
import type { MarkEntryWorkflowStatus } from "../../../../modules/examination/service";

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

/** One admin action button (Close / Reopen / Publish / Unpublish / Archive)
 *  — shared shape so MarkEntryStatusControl below stays a plain switch over
 *  the four statuses. */
function StatusActionButton({
  action, label, examinationId, variant = "primary", confirmMessage,
}: {
  action: (prevState: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>;
  label: string; examinationId: string; variant?: "primary" | "secondary"; confirmMessage?: string;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(action, { error: null });
  return (
    <form
      action={formAction}
      className="inline-flex items-center gap-2"
      onSubmit={(e) => { if (confirmMessage && !confirm(confirmMessage)) e.preventDefault(); }}
    >
      <input type="hidden" name="examinationId" value={examinationId} />
      <button
        type="submit" disabled={pending}
        className={
          variant === "primary"
            ? "rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
            : "rounded-full border px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
        }
      >
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

const STATUS_LABEL: Record<MarkEntryWorkflowStatus, string> = {
  open: "Open", closed: "Closed", published: "Published", archived: "Archived",
};
const STATUS_BADGE_CLASS: Record<MarkEntryWorkflowStatus, string> = {
  open: "bg-zinc-100 text-zinc-600",
  closed: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-zinc-200 text-zinc-700",
};

/** §"stop principal's approval and lock part - admin will switch mark entry
 *  Open> Closed> Published> Archived, that is enough" — one admin-facing
 *  control replacing the old per-subject Submit/Verify/Approve/Lock buttons
 *  AND the standalone Publish button. The four stages:
 *    Open      -> [Close mark entry]
 *    Closed    -> [Reopen for editing] [Publish to portal]
 *    Published -> [Unpublish] [Archive]
 *    Archived  -> terminal, no actions (finalizeExamination() is one-way)
 *  Reopen/Publish/Archive are each gated server-side on the previous stage
 *  (reopenMarkEntry() requires Closed+not Published, publishExamination()
 *  requires Closed, finalizeExamination() requires Published), so a stale
 *  button click just surfaces that error rather than corrupting state. */
export function MarkEntryStatusControl({ examinationId, status }: { examinationId: string; status: MarkEntryWorkflowStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}>
        Mark entry: {STATUS_LABEL[status]}
      </span>
      {status === "open" ? (
        <StatusActionButton action={closeMarkEntryAction} label="Close mark entry" examinationId={examinationId} variant="secondary" />
      ) : null}
      {status === "closed" ? (
        <>
          <StatusActionButton action={reopenMarkEntryAction} label="Reopen for editing" examinationId={examinationId} variant="secondary" />
          <StatusActionButton action={publishExaminationAction} label="Publish to student/parent portal" examinationId={examinationId} />
        </>
      ) : null}
      {status === "published" ? (
        <>
          <StatusActionButton action={unpublishExaminationAction} label="Unpublish from portal" examinationId={examinationId} variant="secondary" />
          <StatusActionButton
            action={archiveExaminationAction} label="Archive" examinationId={examinationId}
            confirmMessage="Archive this examination? This freezes every result permanently and can't be undone."
          />
        </>
      ) : null}
    </div>
  );
}
