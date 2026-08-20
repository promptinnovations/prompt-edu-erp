"use client";

import { useActionState, useMemo, useState } from "react";
import { promoteClassAction, type PromoteFormResult } from "../actions";

interface PreviewRow {
  student_id: string;
  full_name: string;
  admission_number: string;
  roll_number: number | null;
  gender: string | null;
  suggested_action: "promote" | "repeat" | "graduate" | "transfer_out" | "dropout";
  suggested_class_id: string | null;
  suggested_class_name: string | null;
}
interface ClassOption { id: string; name: string }
interface SectionOption { id: string; class_id: string; name: string }
interface AcademicYearOption { id: string; name: string; is_current: boolean }

const ACTIONS: Array<{ value: PreviewRow["suggested_action"]; label: string }> = [
  { value: "promote", label: "Promote" },
  { value: "repeat", label: "Repeat this class" },
  { value: "graduate", label: "Graduate" },
  { value: "transfer_out", label: "Transfer out" },
  { value: "dropout", label: "Dropout" },
];

/** Per-student action/target-class/target-section overrides before
 *  confirming — "it must be editable" applies to promotion exactly the same
 *  way it applies to substitution suggestions (§Page-2 follow-up). Nothing
 *  is written until the form is submitted. */
export default function PromotionForm({
  fromClassId, fromSectionId, students, classes, sections, academicYears,
}: {
  fromClassId: string;
  fromSectionId: string | null;
  students: PreviewRow[];
  classes: ClassOption[];
  sections: SectionOption[];
  academicYears: AcademicYearOption[];
}) {
  const [state, formAction, pending] = useActionState<PromoteFormResult, FormData>(promoteClassAction, { error: null });

  const nonCurrentYears = academicYears.filter((y) => !y.is_current);
  const [toAcademicYearId, setToAcademicYearId] = useState(nonCurrentYears[0]?.id ?? "");

  const [overrides, setOverrides] = useState<Record<string, { action: PreviewRow["suggested_action"]; toClassId: string; toSectionId: string }>>(
    () =>
      Object.fromEntries(
        students.map((s) => [
          s.student_id,
          { action: s.suggested_action, toClassId: s.suggested_class_id ?? "", toSectionId: "" },
        ])
      )
  );

  const sectionsByClass = useMemo(() => {
    const m = new Map<string, SectionOption[]>();
    for (const s of sections) {
      const arr = m.get(s.class_id) ?? [];
      arr.push(s);
      m.set(s.class_id, arr);
    }
    return m;
  }, [sections]);

  function update(studentId: string, patch: Partial<{ action: PreviewRow["suggested_action"]; toClassId: string; toSectionId: string }>) {
    setOverrides((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }

  const decisions = students.map((s) => {
    const o = overrides[s.student_id];
    return {
      studentId: s.student_id,
      action: o.action,
      toClassId: o.action === "promote" || o.action === "repeat" ? o.toClassId || null : null,
      toSectionId: o.action === "promote" || o.action === "repeat" ? o.toSectionId || null : null,
    };
  });

  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">2. Review &amp; confirm ({students.length} students)</h2>

      <div className="mb-4">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Promote/repeat into academic year</label>
        <select
          value={toAcademicYearId}
          onChange={(e) => setToAcademicYearId(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        >
          <option value="" disabled>Select a target academic year…</option>
          {nonCurrentYears.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
        {nonCurrentYears.length === 0 ? (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            No other academic year exists yet — add next year first, above.
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-400 dark:text-zinc-500">
              <th className="pb-2 font-medium">Roll</th>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Action</th>
              <th className="pb-2 font-medium">To class</th>
              <th className="pb-2 font-medium">To division</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const o = overrides[s.student_id];
              const advancing = o.action === "promote" || o.action === "repeat";
              return (
                <tr key={s.student_id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 text-zinc-500 dark:text-zinc-400">{s.roll_number ?? "—"}</td>
                  <td className="py-2 text-zinc-900 dark:text-zinc-50">{s.full_name}</td>
                  <td className="py-2">
                    <select
                      value={o.action}
                      onChange={(e) => update(s.student_id, { action: e.target.value as PreviewRow["suggested_action"] })}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                    >
                      {ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    {advancing ? (
                      <select
                        value={o.toClassId}
                        onChange={(e) => update(s.student_id, { toClassId: e.target.value, toSectionId: "" })}
                        className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                      >
                        <option value="" disabled>Select…</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    {advancing ? (
                      <select
                        value={o.toSectionId}
                        onChange={(e) => update(s.student_id, { toSectionId: e.target.value })}
                        disabled={!o.toClassId}
                        className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 disabled:opacity-50"
                      >
                        <option value="" disabled>Select…</option>
                        {(sectionsByClass.get(o.toClassId) ?? []).map((sec) => (
                          <option key={sec.id} value={sec.id}>{sec.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        action={formAction}
        className="mt-4"
        onSubmit={(e) => {
          if (!confirm(`Confirm promotion for ${students.length} students? This can't be undone (though it can be re-run for corrections).`)) {
            e.preventDefault();
            return;
          }
        }}
      >
        <input type="hidden" name="fromClassId" value={fromClassId} />
        <input type="hidden" name="fromSectionId" value={fromSectionId ?? ""} />
        <input type="hidden" name="toAcademicYearId" value={toAcademicYearId} />
        <input type="hidden" name="decisions" value={JSON.stringify(decisions)} />
        <button
          type="submit"
          disabled={pending || !toAcademicYearId}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          Confirm promotion
        </button>
        {state.error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
        {state.result ? (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
            Done — {state.result.promoted} promoted, {state.result.repeated} repeating, {state.result.graduated} graduated,{" "}
            {state.result.transferredOut} transferred out, {state.result.droppedOut} dropped out
            {state.result.skippedAlreadyEnrolled.length > 0
              ? `, ${state.result.skippedAlreadyEnrolled.length} skipped (already enrolled in that year)`
              : ""}.
          </p>
        ) : null}
      </form>
    </section>
  );
}
