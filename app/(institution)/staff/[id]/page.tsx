import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { can } from "../../../../services/permissions/permission-service";
import {
  getStaffProfile, listAssignmentsForTeacher, listObservationCriteria, listTeacherObservations,
} from "../../../../modules/staff/service";
import { listExaminations } from "../../../../modules/examination/service";
import { getTeacherExamReport, getTeacherPerformanceTrend } from "../../../../modules/analytics/service";
import PhotoForm from "../PhotoForm";
import EditStaffForm from "../EditStaffForm";
import TeacherProfileForm from "../TeacherProfileForm";
import ProfileTabs from "./ProfileTabs";
import ExamResultsSection from "./ExamResultsSection";
import ObservationsSection from "./ObservationsSection";

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * §Teacher-Profile feature — per-staff-member profile page, mirroring the
 * Student Profile page's shape (app/(institution)/students/[id]/page.tsx).
 * Per the user's own explicit choice (AskUserQuestion #3, "Teachers only"):
 * this route branches on whether the person has any teacher_assignments row
 * (isTeacher) — a teacher gets the full 6-section template + exam analysis
 * + observations; anyone else gets the plain, unchanged staff record. Both
 * branches live on the SAME route rather than two different ones, so the
 * directory (staff/directory/page.tsx) doesn't need to know in advance
 * which kind of card it's linking.
 */
export default async function StaffDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; examId?: string }>;
}) {
  const { id } = await params;
  const { tab, examId } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "staff");

  const profile = await getStaffProfile(institutionId, authUserId, id);
  if (!profile) notFound(); // RLS already guarantees this is null for another institution's id (§E.3)

  const assignments = await listAssignmentsForTeacher(institutionId, authUserId, profile.user_id);
  const isTeacher = assignments.length > 0;
  const canManage = can(ctx.permissions, "staff.edit");
  // §Staff-profile-self-service follow-up: a staff member editing their OWN
  // record (never trusted from the client -- see assertStaffSelfOrEditAccess
  // in actions.ts, which re-derives this server-side on every submit) can
  // update their personal/bio fields and photo even without staff.edit.
  // The "official" record (staff code/designation/department/status) stays
  // staff.edit-only regardless of ownership -- see EditStaffForm below.
  const isOwnProfile = profile.user_id === ctx.userId;
  const canEditSelfFields = canManage || isOwnProfile;
  const photoUrl = profile.photo_file_id ? `/api/files/${profile.photo_file_id}` : null;

  const header = (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar from an authenticated /api/files route, not a static/optimizable asset
        <img src={photoUrl} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-zinc-100 dark:ring-zinc-800" />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 text-xl font-medium text-zinc-500 ring-2 ring-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-800">
          {profile.full_name.charAt(0).toUpperCase()}
        </span>
      )}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{profile.full_name}</h1>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          {profile.staff_code} · {profile.designation ?? "—"}
          {isTeacher ? <span className="ml-2 rounded-full bg-[var(--brand)]/10 px-2 py-0.5 text-xs font-medium text-[var(--brand)]">Teacher</span> : null}
        </p>
      </div>
    </div>
  );

  if (!isTeacher) {
    // §Staff-profile-self-service follow-up: non-teaching staff previously
    // had no edit affordance here at all (admin or self) -- only the exam
    // analysis/observations sections are teacher-only; editing one's own
    // record and photo is not, so this branch now gets the same
    // EditStaffForm/Photo/TeacherProfileForm treatment as the teacher
    // branch below, just without the exam-analysis/observations tabs.
    return (
      <div className="space-y-4">
        <Link href="/staff/directory" className="text-sm text-zinc-500 dark:text-zinc-400 underline">← Back to Staff profiles</Link>
        {header}
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Core identity &amp; employment</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-zinc-400 dark:text-zinc-500">Staff ID</dt>
                <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.staff_code}</dd>
              </div>
              <div>
                <dt className="text-zinc-400 dark:text-zinc-500">Designation</dt>
                <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.designation ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-400 dark:text-zinc-500">Department</dt>
                <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.department ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-400 dark:text-zinc-500">Joining date</dt>
                <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{formatDate(profile.joining_date)}</dd>
              </div>
              <div>
                <dt className="text-zinc-400 dark:text-zinc-500">Employment status</dt>
                <dd className="mt-0.5 capitalize text-zinc-900 dark:text-zinc-50">{profile.employment_status.replace("_", " ")}</dd>
              </div>
              <div>
                <dt className="text-zinc-400 dark:text-zinc-500">Email</dt>
                <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.email ?? "—"}</dd>
              </div>
            </dl>
            {canManage ? (
              <div className="mt-3">
                <EditStaffForm
                  staffId={profile.id}
                  staffCode={profile.staff_code}
                  fullName={profile.full_name}
                  designation={profile.designation}
                  department={profile.department}
                  employmentStatus={profile.employment_status}
                />
              </div>
            ) : null}
            <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
              Exam analysis and observation tracking apply only to teaching staff — assign this person a subject via Staff &gt; Teacher
              assignments to enable those.
            </p>
          </div>

          {canEditSelfFields ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Photo</h2>
              <PhotoForm staffId={profile.id} photoUrl={photoUrl} />
            </div>
          ) : null}

          {canEditSelfFields ? <TeacherProfileForm profile={profile} /> : null}
        </div>
      </div>
    );
  }

  const [criteria, observations, examinations] = await Promise.all([
    listObservationCriteria(institutionId, authUserId),
    listTeacherObservations(institutionId, authUserId, profile.id),
    listExaminations(institutionId, authUserId),
  ]);
  const selectedExamId = examId || examinations[0]?.id || null;
  const [report, trend] = await Promise.all([
    selectedExamId ? getTeacherExamReport(institutionId, authUserId, profile.user_id, selectedExamId) : Promise.resolve(null),
    getTeacherPerformanceTrend(institutionId, authUserId, profile.user_id),
  ]);

  const canRecordObservation = can(ctx.permissions, "staff.observation.manage") || can(ctx.permissions, "staff.observation.manage_section");
  const canManageRubric = can(ctx.permissions, "staff.observation.manage");

  const classesSubjectsHandled = assignments
    .map((a) => `${a.class_name}${a.section_name ? ` · ${a.section_name}` : ""}${a.subject_name ? ` — ${a.subject_name}` : ""}${a.role_type === "class_teacher" ? " (Class Teacher)" : ""}`)
    .join(", ");

  const profileTab = (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Core identity &amp; employment</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Staff ID</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.staff_code}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Joining date</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{formatDate(profile.joining_date)}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Designation</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.designation ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Department / section</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.department ?? "—"}</dd>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-zinc-400 dark:text-zinc-500">Classes &amp; subjects handled</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{classesSubjectsHandled || "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Email</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.email ?? "—"}</dd>
          </div>
        </dl>
        {canManage ? (
          <div className="mt-3">
            <EditStaffForm
              staffId={profile.id}
              staffCode={profile.staff_code}
              fullName={profile.full_name}
              designation={profile.designation}
              department={profile.department}
              employmentStatus={profile.employment_status}
            />
          </div>
        ) : null}
      </div>

      {canEditSelfFields ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Photo</h2>
          <PhotoForm staffId={profile.id} photoUrl={photoUrl} />
        </div>
      ) : null}

      {canEditSelfFields ? (
        <TeacherProfileForm profile={profile} />
      ) : (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">You don&apos;t have permission to edit this profile.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Link href="/staff/directory" className="text-sm text-zinc-500 dark:text-zinc-400 underline">← Back to Staff profiles</Link>
      {header}

      <ProfileTabs
        tabs={[
          { id: "profile", label: "Profile" },
          { id: "results", label: "Exam Results" },
          { id: "observations", label: "Observations" },
        ]}
        initialTab={tab}
      >
        {profileTab}
        <ExamResultsSection examinations={examinations} selectedExamId={selectedExamId} report={report} trend={trend} />
        <ObservationsSection
          teacherId={profile.id}
          criteria={criteria}
          observations={observations}
          canRecord={canRecordObservation}
          canManageRubric={canManageRubric}
        />
      </ProfileTabs>
    </div>
  );
}
