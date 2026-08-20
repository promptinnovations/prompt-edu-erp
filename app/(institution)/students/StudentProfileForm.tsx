"use client";

import { useActionState } from "react";
import { updateStudentProfileAction } from "./actions";
import type { StudentProfileRecord } from "../../../modules/students/service";

const Field = ({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) => (
  <div>
    <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{label}</label>
    <input
      name={name}
      defaultValue={defaultValue}
      className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
    />
  </div>
);

const TextArea = ({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) => (
  <div>
    <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{label}</label>
    <textarea
      name={name}
      defaultValue={defaultValue}
      rows={2}
      className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
    />
  </div>
);

const Section = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <fieldset className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
    <legend className="px-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</legend>
    {note ? <p className="mb-3 -mt-1 text-xs text-zinc-400 dark:text-zinc-500">{note}</p> : null}
    <div className="grid gap-3 sm:grid-cols-2">{children}</div>
  </fieldset>
);

/**
 * §Student Profile feature (Personal tab) — the "STUDENT PROFILE RECORD"
 * template's remaining fields, i.e. everything past the three
 * admission-mandatory groups (core identity → EditStudentForm, family
 * contact → ParentSection, address → folded into this form's Contact
 * section since it has no other home). All optional, per the user's own
 * "Some mandatory" / "Core identity, Family contact, Address" answer —
 * every field here can be filled in any time after admission.
 */
export default function StudentProfileForm({ profile }: { profile: StudentProfileRecord }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(
    updateStudentProfileAction, { error: null }
  );
  const v = (s: string | null) => s ?? "";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="studentId" value={profile.id} />

      <Section title="Personal details">
        <Field label="Blood group" name="bloodGroup" defaultValue={v(profile.blood_group)} />
        <Field label="Mother tongue" name="motherTongue" defaultValue={v(profile.mother_tongue)} />
        <Field label="Aadhaar / national ID no." name="nationalId" defaultValue={v(profile.national_id)} />
      </Section>

      <Section title="Family background" note="Father's/mother's own details are under Parents / guardians below.">
        <div className="sm:col-span-2">
          <TextArea
            label="Sibling details (name, class & school — one per line)"
            name="siblingDetails"
            defaultValue={v(profile.sibling_details)}
          />
        </div>
      </Section>

      <Section title="Contact & communication">
        <div className="sm:col-span-2">
          <TextArea label="Current residential address" name="address" defaultValue={v(profile.address)} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="Permanent address (if different)" name="permanentAddress" defaultValue={v(profile.permanent_address)} />
        </div>
        <Field label="Contact phone" name="contactPhone" defaultValue={v(profile.contact_phone)} />
        <Field label="Primary emergency contact name" name="emergencyContactName" defaultValue={v(profile.emergency_contact_name)} />
      </Section>

      <Section title="Academic history">
        <Field label="Previous school attended" name="previousSchool" defaultValue={v(profile.previous_school)} />
        <Field label="Highest grade/class completed" name="highestGradeCompleted" defaultValue={v(profile.highest_grade_completed)} />
      </Section>

      <Section title="Medical history & well-being">
        <TextArea label="Known allergies" name="knownAllergies" defaultValue={v(profile.known_allergies)} />
        <TextArea label="Chronic health conditions / medical concerns" name="chronicConditions" defaultValue={v(profile.chronic_conditions)} />
        <TextArea label="Regular medications" name="regularMedications" defaultValue={v(profile.regular_medications)} />
        <Field label="Vision / hearing support (e.g. Spectacles, Hearing Aid, None)" name="visionHearingSupport" defaultValue={v(profile.vision_hearing_support)} />
      </Section>

      <Section title="Co-curricular & special interests">
        <Field label="Hobbies & talents" name="hobbiesTalents" defaultValue={v(profile.hobbies_talents)} />
        <Field label="Sports & games preferences" name="sportsPreferences" defaultValue={v(profile.sports_preferences)} />
        <Field label="Preferred clubs / extracurricular activities" name="clubsInterests" defaultValue={v(profile.clubs_interests)} />
      </Section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}
