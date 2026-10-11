"use client";

import { useActionState, useState } from "react";
import { saveReportCardRemarksAction, type SaveRemarksState } from "./actions";

export interface RemarksFormRow {
  student_id: string; full_name: string; admission_number: string; roll_number: number | null;
  section_name: string; result: string | null; remark: string | null;
}

function RemarkField({ row, max }: { row: RemarksFormRow; max: number }) {
  const [len, setLen] = useState((row.remark ?? "").length);
  return (
    <div>
      <textarea
        name={`remark_${row.student_id}`}
        defaultValue={row.remark ?? ""}
        maxLength={max}
        rows={2}
        onChange={(e) => setLen(e.target.value.length)}
        aria-label={`Remark for ${row.full_name}`}
        placeholder="Type the class teacher's remark…"
        className="w-full resize-y rounded-xl border px-3 py-2 text-sm leading-6 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <p className={`mt-0.5 text-right text-[11px] ${len > max * 0.9 ? "text-amber-600" : "text-zinc-400"}`}>{len}/{max}</p>
    </div>
  );
}

export default function RemarksForm({
  examinationId, rows, max,
}: { examinationId: string; rows: RemarksFormRow[]; max: number }) {
  const [state, formAction, pending] = useActionState<SaveRemarksState, FormData>(
    saveReportCardRemarksAction, { error: null, message: null }
  );
  const done = rows.filter((r) => (r.remark ?? "").trim() !== "").length;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="examinationId" value={examinationId} />
      <p className="text-xs text-zinc-500">{done} of {rows.length} students have a remark. A blank box clears that student&rsquo;s remark.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
            <tr>
              <th className="w-16 py-1.5 pr-3">Roll</th>
              <th className="w-56 py-1.5 pr-3">Student</th>
              <th className="py-1.5">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.student_id} className="align-top">
                <td className="py-2 pr-3 text-zinc-500">
                  <input type="hidden" name="studentId" value={r.student_id} />
                  {r.roll_number ?? "—"}
                </td>
                <td className="py-2 pr-3">
                  <div className="font-medium text-zinc-900">{r.full_name}</div>
                  <div className="text-xs text-zinc-500">
                    Adm. {r.admission_number} · {r.section_name}{r.result ? ` · ${r.result}` : ""}
                  </div>
                </td>
                <td className="py-2"><RemarkField row={r} max={max} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sticky bottom-0 flex items-center gap-3 border-t bg-white/95 py-3 backdrop-blur">
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {pending ? "Saving…" : "Save remarks"}
        </button>
        {state.message ? <span className="text-sm text-emerald-700">{state.message}</span> : null}
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
