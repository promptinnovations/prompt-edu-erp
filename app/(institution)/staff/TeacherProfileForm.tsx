"use client";

import { useActionState } from "react";
import { updateStaffProfileAction } from "./actions";
import type { StaffProfileRecord } from "../../../modules/staff/service";

const Field = ({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue: string; type?: string }) => (
  <div>
    <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{label}</label>
    <input
      name={name}
      type={type}
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
 * §Teacher-Profile feature — the full 6-section template the user supplied
 * (Personal / Employment / Qualifications & Skills / Responsibilities /
 * Professional Development / Achievements). One combined form, one Save
 * button — same "everything at once" shape as students' StudentProfileForm,
 * not six separate saves. Any field left blank is simply not shown
 * elsewhere on the profile (§Teacher-Profile "any blanks will not be there
 * in the profile" — a read-side rendering concern, handled by the page
 * itself, not this form).
 *
 * Core identity (Staff ID, Joining Date, Designation, Department) and
 * "Classes & Subjects Handled"/"Class Teacher" (derived from
 * teacher_assignments — see modules/staff/service.ts's StaffProfileRecord
 * doc comment) are deliberately NOT fields here; they're shown read-only
 * elsewhere on the profile page since they already have their own source of
 * truth.
 */
export default function TeacherProfileForm({ profile }: { profile: StaffProfileRecord }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(
    updateStaffProfileAction, { error: null }
  );
  const v = (s: string | null) => s ?? "";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="staffId" value={profile.id} />

      <Section title="1. Personal details">
        <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={v(profile.date_of_birth)} />
        <Field label="Gender" name="gender" defaultValue={v(profile.gender)} />
        <Field label="Blood group" name="bloodGroup" defaultValue={v(profile.blood_group)} />
        <Field label="Contact phone" name="contactPhone" defaultValue={v(profile.contact_phone)} />
        <div className="sm:col-span-2">
          <TextArea label="Address" name="address" defaultValue={v(profile.address)} />
        </div>
        <Field label="Emergency contact name" name="emergencyContactName" defaultValue={v(profile.emergency_contact_name)} />
        <Field label="Emergency contact phone" name="emergencyContactPhone" defaultValue={v(profile.emergency_contact_phone)} />
      </Section>

      <Section title="2. Employment details" note="Joining date, designation, department, and Classes & Subjects Handled are shown above — set those from Staff &gt; Directory / Teacher assignments.">
        <Field label="Class Teacher / other roles" name="otherRoles" defaultValue={v(profile.other_roles)} />
        <div className="sm:col-span-2">
          <TextArea label="Previous experience" name="previousExperience" defaultValue={v(profile.previous_experience)} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="Documents submitted" name="documentsSubmitted" defaultValue={v(profile.documents_submitted)} />
        </div>
      </Section>

      <Section title="3. Qualifications & skills">
        <div className="sm:col-span-2">
          <TextArea label="Academic & professional qualifications" name="qualifications" defaultValue={v(profile.qualifications)} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="Certifications" name="certifications" defaultValue={v(profile.certifications)} />
        </div>
        <Field label="Specialisations" name="specialisations" defaultValue={v(profile.specialisations)} />
        <Field label="Languages" name="languages" defaultValue={v(profile.languages)} />
        <div className="sm:col-span-2">
          <TextArea label="Teaching, ICT/AI & other skills" name="skills" defaultValue={v(profile.skills)} />
        </div>
      </Section>

      <Section title="4. Responsibilities" note="Class Teacher status is shown above (from Teacher assignments).">
        <Field label="Subject coordinator of" name="subjectCoordinatorOf" defaultValue={v(profile.subject_coordinator_of)} />
        <Field label="Club / House in-charge" name="clubHouseIncharge" defaultValue={v(profile.club_house_incharge)} />
        <Field label="Examination / event duties" name="examEventDuties" defaultValue={v(profile.exam_event_duties)} />
        <Field label="Other responsibilities" name="otherResponsibilities" defaultValue={v(profile.other_responsibilities)} />
      </Section>

      <Section title="5. Professional development">
        <div className="sm:col-span-2">
          <TextArea label="Trainings & workshops" name="trainingsWorkshops" defaultValue={v(profile.trainings_workshops)} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="Certificates" name="pdCertificates" defaultValue={v(profile.pd_certificates)} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="Training history" name="trainingHistory" defaultValue={v(profile.training_history)} />
        </div>
      </Section>

      <Section title="6. Achievements">
        <div className="sm:col-span-2">
          <TextArea label="Awards & recognitions" name="awardsRecognitions" defaultValue={v(profile.awards_recognitions)} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="Publications / research" name="publicationsResearch" defaultValue={v(profile.publications_research)} />
        </div>
        <Field label="Innovations" name="innovations" defaultValue={v(profile.innovations)} />
        <Field label="Other achievements" name="otherAchievements" defaultValue={v(profile.other_achievements)} />
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
