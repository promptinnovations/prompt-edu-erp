"use client";

import { useActionState, useState } from "react";
import {
  createGradeScaleAction, updateGradeScaleAction, deleteGradeScaleAction, setDefaultGradeScaleAction,
  createGradeBandAction, updateGradeBandAction, deleteGradeBandAction,
  type GradingActionState,
} from "./actions";

interface GradeBand { id: string; min_percent: string; max_percent: string; grade_label: string; grade_point: string | null; color: string | null }
interface GradeScale { id: string; name: string; is_default: boolean }

const INIT: GradingActionState = { error: null };

function GradeBandRow({ band, canManage }: { band: GradeBand; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateGradeBandAction, INIT);
  const [, deleteAction] = useActionState(deleteGradeBandAction, INIT);

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-1 text-sm">
        <form action={updateAction} className="flex flex-wrap items-center gap-2" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="gradeBandId" value={band.id} />
          <input name="gradeLabel" defaultValue={band.grade_label} className="w-16 rounded border border-zinc-300 px-2 py-1 text-xs" />
          <input name="minPercent" type="number" step="0.01" defaultValue={band.min_percent} className="w-20 rounded border border-zinc-300 px-2 py-1 text-xs" placeholder="Min %" />
          <span className="text-xs text-zinc-500">–</span>
          <input name="maxPercent" type="number" step="0.01" defaultValue={band.max_percent} className="w-20 rounded border border-zinc-300 px-2 py-1 text-xs" placeholder="Max %" />
          <input name="gradePoint" type="number" step="0.01" defaultValue={band.grade_point ?? ""} className="w-16 rounded border border-zinc-300 px-2 py-1 text-xs" placeholder="GP" />
          <input name="color" type="color" defaultValue={band.color ?? "#94a3b8"} className="h-7 w-9 rounded border border-zinc-300 p-0.5" title="Band color" />
          <button type="submit" className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600">{updateState.error}</span> : null}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: band.color ?? "#94a3b8" }} />
        <strong className="text-zinc-900">{band.grade_label}</strong>{" "}
        <span className="text-zinc-500">{band.min_percent}%–{band.max_percent}%</span>
        {band.grade_point ? <span className="text-zinc-500"> · GP {band.grade_point}</span> : null}
      </span>
      {canManage ? (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">Edit</button>
          <form action={deleteAction} onSubmit={(e) => { if (!confirm(`Delete grade band "${band.grade_label}"?`)) e.preventDefault(); }}>
            <input type="hidden" name="gradeBandId" value={band.id} />
            <button type="submit" className="text-xs text-red-600 underline hover:text-red-800">Delete</button>
          </form>
        </span>
      ) : null}
    </li>
  );
}

function GradeScaleCard({ scale, bands, canManage }: { scale: GradeScale; bands: GradeBand[]; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateGradeScaleAction, INIT);
  const [, deleteAction] = useActionState(deleteGradeScaleAction, INIT);
  const [, setDefaultAction] = useActionState(setDefaultGradeScaleAction, INIT);
  const [, addBandAction] = useActionState(createGradeBandAction, INIT);

  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        {editing ? (
          <form action={updateAction} className="flex items-center gap-2" onSubmit={() => setEditing(false)}>
            <input type="hidden" name="gradeScaleId" value={scale.id} />
            <input name="name" defaultValue={scale.name} className="rounded border border-zinc-300 px-2 py-1 text-sm" />
            <button type="submit" className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
          </form>
        ) : (
          <h3 className="font-semibold text-[var(--heading)]">
            {scale.name}{" "}
            {scale.is_default ? (
              <span className="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">Default</span>
            ) : null}
          </h3>
        )}
        {canManage && !editing ? (
          <span className="flex items-center gap-2">
            {!scale.is_default ? (
              <form action={setDefaultAction}>
                <input type="hidden" name="gradeScaleId" value={scale.id} />
                <button type="submit" className="text-xs text-zinc-500 underline hover:text-zinc-800">Set default</button>
              </form>
            ) : null}
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">Rename</button>
            <form action={deleteAction} onSubmit={(e) => { if (!confirm(`Delete grade scale "${scale.name}"?`)) e.preventDefault(); }}>
              <input type="hidden" name="gradeScaleId" value={scale.id} />
              <button type="submit" className="text-xs text-red-600 underline hover:text-red-800">Delete</button>
            </form>
          </span>
        ) : null}
      </div>
      {updateState.error ? <p className="mb-2 text-xs text-red-600">{updateState.error}</p> : null}

      <ul className="divide-y divide-zinc-100">
        {bands.length === 0 ? <li className="py-1 text-xs text-zinc-500">No grade bands yet.</li> : null}
        {bands.map((b) => <GradeBandRow key={b.id} band={b} canManage={canManage} />)}
      </ul>

      {canManage ? (
        <form action={addBandAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
          <input type="hidden" name="gradeScaleId" value={scale.id} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Label</label>
            <input name="gradeLabel" required placeholder="A+" className="w-16 rounded border border-zinc-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Min %</label>
            <input name="minPercent" type="number" step="0.01" required className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Max %</label>
            <input name="maxPercent" type="number" step="0.01" required className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Grade point</label>
            <input name="gradePoint" type="number" step="0.01" className="w-16 rounded border border-zinc-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Color</label>
            <input name="color" type="color" defaultValue="#4f46e5" className="h-8 w-10 rounded border border-zinc-300 p-0.5" />
          </div>
          <button type="submit" className="rounded-lg bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Add band
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default function GradeScaleSection({
  gradeScales, bandsByScale, canManage,
}: {
  gradeScales: GradeScale[]; bandsByScale: Record<string, GradeBand[]>; canManage: boolean;
}) {
  const [, createAction] = useActionState(createGradeScaleAction, INIT);

  return (
    <div className="space-y-4">
      {gradeScales.length === 0 ? <p className="text-sm text-zinc-500">No grade scales yet.</p> : null}
      {gradeScales.map((s) => (
        <GradeScaleCard key={s.id} scale={s} bands={bandsByScale[s.id] ?? []} canManage={canManage} />
      ))}

      {canManage ? (
        <form action={createAction} className="flex items-end gap-2 rounded-xl border border-dashed border-zinc-300 p-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">New grade scale name</label>
            <input name="name" required placeholder="e.g. A+–F Letter Grades" className="rounded border border-zinc-300 px-2 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-1 pb-2 text-xs text-zinc-500">
            <input type="checkbox" name="isDefault" /> Make default
          </label>
          <button type="submit" className="rounded-lg bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Add grade scale
          </button>
        </form>
      ) : null}
    </div>
  );
}
