"use client";

import { useActionState } from "react";
import { admitStudentAction } from "./actions";

interface SectionOption { id: string; classId: string; label: string }

const inputCls = "rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400";

/**
 * §Student Profile feature — "Enrollment" (the user's own naming: "add-
 * student form + search + list= Enrollment"). Replaces the old admission-
 * number+name-only quick add with the full admission path the user
 * confirmed: core identity (name, DOB, gender, class & division), family
 * contact (a parent's name + phone — at least one of father/mother), and
 * address are all required here; everything else in the Student Profile
 * template stays optional and gets filled in later from the student's own
 * Personal tab (see StudentProfileForm.tsx).
 */
export default function StudentForm({
  academicYearId, sections,
}: {
  academicYearId: string | null;
  sections: SectionOption[];
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(admitStudentAction, { error: null });

  if (!academicYearId) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-500">No current academic year configured — set one up in Academic Setup before admitting students.</p>;
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Admission number</label>
          <input name="admissionNumber" required className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Full name</label>
          <input name="fullName" required placeholder="e.g. മുഹമ്മദ് അലി / Fatima Noor" className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Date of birth</label>
          <input type="date" name="dateOfBirth" required className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Gender</label>
          <select name="gender" required className={`w-full ${inputCls}`}>
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class / Division</label>
          <select
            required
            className={`w-full ${inputCls}`}
            onChange={(e) => {
              const [classId, sectionId] = e.currentTarget.value.split("|");
              const form = e.currentTarget.form!;
              (form.elements.namedItem("classId") as HTMLInputElement).value = classId ?? "";
              (form.elements.namedItem("sectionId") as HTMLInputElement).value = sectionId ?? "";
            }}
          >
            <option value="">Select…</option>
            {sections.map((s) => (
              <option key={s.id} value={`${s.classId}|${s.id}`}>{s.label}</option>
            ))}
          </select>
          <input type="hidden" name="classId" />
          <input type="hidden" name="sectionId" />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Current residential address</label>
          <input name="address" required className={`w-full ${inputCls}`} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Father&apos;s name</label>
          <input name="fatherName" className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Father&apos;s phone</label>
          <input name="fatherPhone" className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Mother&apos;s name</label>
          <input name="motherName" className={`w-full ${inputCls}`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Mother&apos;s phone</label>
          <input name="motherPhone" className={`w-full ${inputCls}`} />
        </div>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        At least one parent&apos;s name and phone number is required. Blood group, medical history, hobbies and
        the rest of the Student Profile Record can be filled in later from the student&apos;s own Personal tab.
      </p>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {pending ? "Admitting…" : "Admit student"}
        </button>
        {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}
