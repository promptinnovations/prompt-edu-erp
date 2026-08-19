"use client";

import { useState } from "react";
import { useActionState } from "react";
import { confirmSubstitutionsAction } from "./actions";

interface Suggestion {
  classId: string; className: string;
  sectionId: string; sectionName: string;
  periodNo: number;
  subjectId: string | null; subjectName: string | null;
  suggestedCoveringStaffId: string | null; suggestedCoveringStaffName: string | null;
  freeStaffOptions: Array<{ id: string; name: string }>;
}

/** "editable, regeneratable" — every row starts pre-filled with the
 *  auto-suggested free teacher, but each has its own dropdown of every OTHER
 *  free teacher at that exact slot, so an admin can override before
 *  confirming. Submitting re-runs confirmSubstitutions(), which UPSERTs —
 *  re-generating (a fresh page load with the same date+teacher) and
 *  confirming again always reflects the latest edit, never a duplicate. */
export default function ConfirmSubstitutionsForm({
  date, absentStaffId, suggestions,
}: { date: string; absentStaffId: string; suggestions: Suggestion[] }) {
  const [choices, setChoices] = useState<Record<number, string>>(() =>
    Object.fromEntries(suggestions.map((s, i) => [i, s.suggestedCoveringStaffId ?? ""]))
  );
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(confirmSubstitutionsAction, { error: null });

  const rowsPayload = suggestions.map((s, i) => ({
    classId: s.classId, sectionId: s.sectionId, periodNo: s.periodNo, subjectId: s.subjectId,
    coveringStaffId: choices[i] || null,
  }));

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="absentStaffId" value={absentStaffId} />
      <input type="hidden" name="rowsJson" value={JSON.stringify(rowsPayload)} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th className="py-1.5 pr-3">Class</th>
              <th className="py-1.5 pr-3">Period</th>
              <th className="py-1.5 pr-3">Subject</th>
              <th className="py-1.5 pr-3">Covering teacher</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {suggestions.map((s, i) => (
              <tr key={`${s.classId}:${s.sectionId}:${s.periodNo}`}>
                <td className="py-2 pr-3 whitespace-nowrap">{s.className} – {s.sectionName}</td>
                <td className="py-2 pr-3">{s.periodNo}</td>
                <td className="py-2 pr-3">{s.subjectName ?? "—"}</td>
                <td className="py-2 pr-3">
                  <select
                    value={choices[i] ?? ""}
                    onChange={(e) => setChoices((c) => ({ ...c, [i]: e.target.value }))}
                    className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]"
                  >
                    <option value="">— No substitute available —</option>
                    {s.freeStaffOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {pending ? "Confirming…" : "Confirm substitutions"}
        </button>
        {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      </div>
    </form>
  );
}
