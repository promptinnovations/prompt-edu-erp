"use client";

import { useActionState } from "react";
import { saveStudentDetailsAction, type SaveDetailsState } from "./actions";

export interface DetailsFormRow {
  student_id: string;
  full_name: string;
  admission_number: string;
  roll_number: number | null;
  section_name: string;
  date_of_birth: string;
  gender: string;
  address: string;
  father_name: string;
  father_phone: string;
  mother_name: string;
  mother_phone: string;
  /** Labels of the core details still missing ("Date of birth", "Mobile No"...). */
  missing: string[];
  /** Field keys still missing, to highlight the matching inputs. */
  missingKeys: string[];
}

const input =
  "mt-1 block w-full rounded-xl border px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";
const missingInput = " border-amber-400 bg-amber-50/60";

function Field({
  label, name, defaultValue, missing, type = "text", placeholder, inputMode, max,
}: {
  label: string; name: string; defaultValue: string; missing?: boolean; type?: string;
  placeholder?: string; inputMode?: "tel" | "text"; max?: string;
}) {
  return (
    <label className="block text-xs font-medium text-zinc-600">
      {label}{missing ? <span className="ml-1 text-amber-700">· missing</span> : null}
      <input
        name={name} type={type} defaultValue={defaultValue} placeholder={placeholder}
        inputMode={inputMode} max={max} autoComplete="off"
        className={input + (missing ? missingInput : "")}
      />
    </label>
  );
}

function StudentCard({ row, today }: { row: DetailsFormRow; today: string }) {
  const [state, formAction, pending] = useActionState<SaveDetailsState, FormData>(
    saveStudentDetailsAction, { error: null, message: null }
  );
  const miss = (k: string) => row.missingKeys.includes(k);
  return (
    <form action={formAction} className="rounded-card border bg-white p-4">
      <input type="hidden" name="studentId" value={row.student_id} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-zinc-900">{row.full_name}</div>
          <div className="text-xs text-zinc-500">
            Adm. {row.admission_number} · Div {row.section_name}{row.roll_number != null ? ` · Roll ${row.roll_number}` : ""}
          </div>
        </div>
        {row.missing.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.missing.map((m) => (
              <span key={m} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">{m}</span>
            ))}
          </div>
        ) : (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">Complete</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={row.date_of_birth} missing={miss("dateOfBirth")} max={today} />
        <label className="block text-xs font-medium text-zinc-600">
          Gender{miss("gender") ? <span className="ml-1 text-amber-700">· missing</span> : null}
          <select name="gender" defaultValue={row.gender} className={input + (miss("gender") ? missingInput : "") + " bg-white"}>
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <Field label="Father's name" name="fatherName" defaultValue={row.father_name} missing={miss("fatherName")} />
        <Field label="Mobile No (father)" name="fatherPhone" defaultValue={row.father_phone} missing={miss("fatherPhone")}
          inputMode="tel" placeholder="10-digit mobile" />
        <Field label="Mother's name" name="motherName" defaultValue={row.mother_name} />
        <Field label="Mother's mobile" name="motherPhone" defaultValue={row.mother_phone} inputMode="tel" placeholder="Optional" />
        <div className="sm:col-span-2">
          <Field label="Address" name="address" defaultValue={row.address} placeholder="House name, place, post, PIN" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending}
          className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        {state.message ? <span className="text-sm text-emerald-700">{state.message}</span> : null}
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}

export default function DetailsForm({ rows, today }: { rows: DetailsFormRow[]; today: string }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => <StudentCard key={r.student_id} row={r} today={today} />)}
    </div>
  );
}
