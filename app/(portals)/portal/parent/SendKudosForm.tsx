"use client";

import { useActionState, useState } from "react";
import { sendKudosAction } from "./actions";

export default function SendKudosForm({ staffOptions, studentId, studentName }: { staffOptions: Array<{ id: string; full_name: string }>; studentId: string; studentName: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(sendKudosAction, { error: null });
  const [target, setTarget] = useState<"teacher" | "student">("teacher");

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex gap-2 text-xs">
        <button type="button" onClick={() => setTarget("teacher")} className={`rounded-full px-3 py-1 ${target === "teacher" ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600"}`}>
          To a teacher
        </button>
        <button type="button" onClick={() => setTarget("student")} className={`rounded-full px-3 py-1 ${target === "student" ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600"}`}>
          To {studentName}
        </button>
      </div>
      {target === "teacher" ? (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Teacher / staff</label>
          <select name="toStaffId" required defaultValue="" className="w-full rounded-full border px-3 py-1.5 text-sm">
            <option value="" disabled>Select…</option>
            {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
      ) : (
        <input type="hidden" name="toStudentId" value={studentId} />
      )}
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Kind</label>
        <select name="kind" defaultValue="flower" className="w-full rounded-full border px-3 py-1.5 text-sm">
          <option value="flower">🌸 Flower</option>
          <option value="congratulations">🎉 Congratulations</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Message (optional)</label>
        <textarea name="message" rows={2} className="w-full rounded-lg border px-3 py-1.5 text-sm" />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Send
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
