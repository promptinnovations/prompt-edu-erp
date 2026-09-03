import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import {
  getStudentProfile, getCurrentEnrollment, listParentsForStudent, listEnrollmentHistory,
} from "../../../../modules/students/service";
import { listClasses, listSections, getCurrentAcademicYear } from "../../../../modules/academic/service";
import { getStudent360 } from "../../../../modules/portfolio/service";
import { getStudentExamReport } from "../../../../modules/examination/service";
import { getInstitution } from "../../../../services/institution/institution-service";
import { getStudentMonthlyAttendance } from "../../../../modules/attendance/service";
import { listAchievements } from "../../../../modules/achievements/service";
import { listSkillSubmissions } from "../../../../modules/skills/service";
import { listReadingRecords } from "../../../../modules/library/service";
import RichTextContent from "../../../components/RichTextContent";
import EnrollForm from "../EnrollForm";
import ClassEnrollmentSection from "../ClassEnrollmentSection";
import ParentSection, { ProvisionStudentAccountForm } from "../ParentSection";
import EditStudentForm from "../EditStudentForm";
import StudentLoginSection from "../StudentLoginSection";
import PhotoForm from "../PhotoForm";
import StudentProfileForm from "../StudentProfileForm";
import ProfileTabs from "./ProfileTabs";
import { MonthlyAttendanceBarChart, ExamSubjectPieChart } from "./ProfileCharts";

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * §Student Profile feature — the tabbed per-student Profile page from the
 * reference screenshots (Personal / Summary / Student Fees / Student
 * Portfolio / Academics), replacing the old flat single-section detail
 * page. Every tab's data is fetched once here and handed down as props —
 * see ProfileTabs.tsx for why switching tabs needs no extra round trip.
 * ?tab= (set by the Student Management directory's "Portfolio" link, see
 * students/directory/page.tsx) preselects a starting tab.
 */
export default async function StudentDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const profile = await getStudentProfile(institutionId, authUserId, id);
  if (!profile) notFound(); // RLS already guarantees this is null for another institution's id (§E.3)

  const [
    enrollment, classes, sections, academicYear, parents, enrollmentHistory, student360, examReport,
    approvedAchievements, approvedSkillSubmissions, approvedReadingRecords, institution,
  ] = await Promise.all([
    getCurrentEnrollment(institutionId, authUserId, id),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    getCurrentAcademicYear(institutionId, authUserId),
    listParentsForStudent(institutionId, authUserId, id),
    listEnrollmentHistory(institutionId, authUserId, id),
    getStudent360(institutionId, authUserId, id),
    getStudentExamReport(institutionId, authUserId, id),
    listAchievements(institutionId, authUserId, "approved", undefined, id),
    listSkillSubmissions(institutionId, authUserId, "approved", undefined, id),
    listReadingRecords(institutionId, authUserId, "approved", undefined, id),
    getInstitution(institutionId, authUserId),
  ]);
  // Education Type follow-up — "there should be 2 dedicated spaces for
  // both everywhere like student portfolio... which should come first
  // will be decided by institute admin" (verbatim ask). Only meaningful
  // when this institution is in 'both' mode; every other institution's
  // Academics tab renders exactly as before (a single flat subject list).
  const educationMode = institution?.educationMode ?? "academic";
  const trackOrder = institution?.trackOrder ?? ["academic", "islamic"];
  const TRACK_LABEL: Record<string, string> = { academic: "Academic", islamic: "Islamic" };
  const monthlyAttendance = academicYear
    ? await getStudentMonthlyAttendance(institutionId, authUserId, id, academicYear.start_date, academicYear.end_date)
    : [];

  const classById = new Map(classes.map((c) => [c.id, c.name]));
  const sectionOptions = sections.map((s) => ({
    id: s.id,
    classId: s.class_id,
    label: `${classById.get(s.class_id) ?? "?"} — ${s.name}`,
  }));
  const currentSection = sections.find((s) => s.id === enrollment?.section_id);
  const classDivisionLabel = enrollment
    ? `${classById.get(enrollment.class_id) ?? "?"}${currentSection ? ` · Div. ${currentSection.name}` : ""}`
    : "Not enrolled";
  const canManage = can(ctx.permissions, "student.edit");

  const personalTab = (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Core identity</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Admission number</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.admission_number}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Roll number</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{enrollment?.roll_number ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Date of admission</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{formatDate(profile.created_at)}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Academic year</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{academicYear?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Date of birth</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.date_of_birth ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Gender</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{profile.gender ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Class & division</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{classDivisionLabel}</dd>
          </div>
        </dl>
        {canManage ? (
          <div className="mt-3">
            <EditStudentForm
              studentId={profile.id}
              admissionNumber={profile.admission_number}
              fullName={profile.full_name}
              dateOfBirth={profile.date_of_birth}
              gender={profile.gender}
            />
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Photo</h2>
          <PhotoForm studentId={profile.id} photoUrl={profile.photo_file_id ? `/api/files/${profile.photo_file_id}` : null} />
        </div>
      ) : null}

      {canManage ? <StudentProfileForm profile={profile} /> : null}

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Class enrollment</h2>
        {enrollment ? (
          <ClassEnrollmentSection
            studentId={profile.id}
            currentClassLabel={classById.get(enrollment.class_id) ?? null}
            currentRollNumber={enrollment.roll_number ?? null}
            sections={sectionOptions}
            history={enrollmentHistory}
            canManage={canManage}
          />
        ) : academicYear ? (
          <div className="space-y-4">
            <EnrollForm studentId={profile.id} academicYearId={academicYear.id} sections={sectionOptions} />
            {enrollmentHistory.length > 0 ? (
              <ClassEnrollmentSection
                studentId={profile.id}
                currentClassLabel={null}
                currentRollNumber={null}
                sections={sectionOptions}
                history={enrollmentHistory}
                canManage={canManage}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No current academic year configured.</p>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Family background — parents / guardians</h2>
        <ParentSection studentId={profile.id} parents={parents} canManage={canManage} />
      </div>

      {can(ctx.permissions, "users.manage") ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Student portal login (§137)</h2>
          <StudentLoginSection
            studentId={profile.id}
            loginId={profile.login_id ?? null}
            defaultParentPhone={parents.find((p) => p.is_primary_contact)?.phone ?? parents[0]?.phone ?? ""}
          />
          {!profile.login_id && !profile.user_id ? (
            <details className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              <summary className="cursor-pointer underline">Prefer an email-based login instead?</summary>
              <div className="mt-2">
                <ProvisionStudentAccountForm
                  studentId={profile.id}
                  defaultEmail={profile.contact_email ?? ""}
                  defaultName={profile.full_name}
                  alreadyLinked={!!profile.user_id}
                />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const summaryTab = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Latest result</div>
          {student360.latestResult ? (
            <>
              <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{Number(student360.latestResult.percentage).toFixed(1)}%</div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {student360.latestResult.examination_name}{student360.latestResult.grade_label ? ` — ${student360.latestResult.grade_label}` : ""}
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">No results yet</div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Attendance (this year)</div>
          {student360.attendanceSummary ? (
            <>
              <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{student360.attendanceSummary.present_percent}%</div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {student360.attendanceSummary.present_days} / {student360.attendanceSummary.total_days} days
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">No attendance yet</div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Consolidated score</div>
          {student360.latestConsolidatedScore ? (
            <>
              <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{student360.latestConsolidatedScore.score}</div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{student360.latestConsolidatedScore.period}</div>
            </>
          ) : (
            <div className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">Not computed yet — see the Scoring page.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Monthly attendance</h2>
          <MonthlyAttendanceBarChart points={monthlyAttendance} />
        </section>
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Exam report{examReport ? ` — ${examReport.examination_name}` : ""}
          </h2>
          {examReport ? <ExamSubjectPieChart subjects={examReport.subjects} /> : (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">No exam marks recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  );

  const feesTab = (
    <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 text-center">
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Fee tracking isn&apos;t set up in this system yet.</p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
        There is no fees module in PROMPT EDU ERP right now — this tab is a placeholder for when one is added, rather than showing made-up numbers.
      </p>
    </div>
  );

  // §384 Complete Student Portfolio — every section below reuses an
  // existing module's own service getter and existing schema (no new
  // tables/columns). Achievement categories/skill types are each
  // institution's own configurable free-text taxonomy (Settings ->
  // Grading & points), so grouping achievements by their real category
  // name is what naturally produces institution-specific sections like
  // "Competitions" or "Certifications" rather than a hardcoded split.
  const achievementsByCategory = new Map<string, typeof approvedAchievements>();
  for (const a of approvedAchievements) {
    const list = achievementsByCategory.get(a.category_name) ?? [];
    list.push(a);
    achievementsByCategory.set(a.category_name, list);
  }
  const certifiedAchievements = approvedAchievements.filter((a) => a.certificate_file_id);

  const portfolioTab = (
    <div className="space-y-6">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Only approved activities appear here — nothing pending or rejected ever shows up (§L.3). This is the verified record of what {profile.full_name} has achieved and worked on so far.
      </p>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Academic performance</h2>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 p-3">
            <div className="text-xs text-zinc-400 dark:text-zinc-500">Latest result</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {student360.latestResult ? `${Number(student360.latestResult.percentage).toFixed(1)}%` : "—"}
            </div>
            {student360.latestResult ? (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {student360.latestResult.examination_name}{student360.latestResult.grade_label ? ` — ${student360.latestResult.grade_label}` : ""}
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 p-3">
            <div className="text-xs text-zinc-400 dark:text-zinc-500">Attendance (this year)</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {student360.attendanceSummary ? `${student360.attendanceSummary.present_percent}%` : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 p-3">
            <div className="text-xs text-zinc-400 dark:text-zinc-500">Consolidated score</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {student360.latestConsolidatedScore ? student360.latestConsolidatedScore.score : "—"}
            </div>
          </div>
        </div>
        {examReport ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <tr><th className="py-1.5 pr-4">Subject</th><th className="py-1.5 pr-4">Marks</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {examReport.subjects.map((s) => (
                  <tr key={s.subject_id}>
                    <td className="py-1.5 pr-4 text-zinc-900 dark:text-zinc-50">{s.subject_name}</td>
                    <td className="py-1.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {s.is_absent ? "Absent" : s.marks_obtained !== null ? `${s.marks_obtained}/${s.max_marks}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No exam marks recorded yet. Full report cards are under Academics.</p>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Achievements &amp; awards</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">Grouped by this institution&apos;s own achievement categories — including competitions, prizes and recognitions.</p>
        {achievementsByCategory.size === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No approved achievements yet.</p>
        ) : (
          <div className="space-y-4">
            {Array.from(achievementsByCategory.entries()).map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{category}</h3>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items!.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-xl border border-zinc-100 dark:border-zinc-800 p-3 text-sm">
                      <div>
                        <div className="text-zinc-900 dark:text-zinc-50">{a.title}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {a.level_name}{a.position ? ` · ${a.position}` : ""}
                        </div>
                      </div>
                      {a.points ? <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{a.points} pts</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Certifications</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">Achievements with an uploaded certificate document.</p>
        {certifiedAchievements.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No certificates uploaded yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {certifiedAchievements.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-xl border border-zinc-100 dark:border-zinc-800 p-3 text-sm">
                <div>
                  <div className="text-zinc-900 dark:text-zinc-50">{a.title}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{a.category_name}</div>
                </div>
                <a href={`/api/files/${a.certificate_file_id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--brand)] underline">
                  View certificate
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Skills &amp; co-curricular activities</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">Approved skill/activity submissions — sports, arts, clubs and other co-curricular participation, per this institution&apos;s own configured activities.</p>
        {approvedSkillSubmissions.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No approved skill submissions yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {approvedSkillSubmissions.map((s) => (
              <li key={s.id} className="rounded-xl border border-zinc-100 dark:border-zinc-800 p-3 text-sm">
                <div className="text-zinc-900 dark:text-zinc-50">{s.activity_name}</div>
                {s.submitted_at ? <div className="text-xs text-zinc-500 dark:text-zinc-400">{formatDate(s.submitted_at)}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Reading record</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">Books read with an approved review.</p>
        {approvedReadingRecords.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No approved reading reviews yet.</p>
        ) : (
          <ul className="space-y-3">
            {approvedReadingRecords.map((r) => (
              <li key={r.id} className="rounded-xl border border-zinc-100 dark:border-zinc-800 p-3 text-sm">
                <div className="mb-1 font-medium text-zinc-900 dark:text-zinc-50">{r.book_title}</div>
                {r.review_text ? <RichTextContent html={r.review_text} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Activity timeline</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">A chronological view across every module — projects, accomplishments and other development records all flow through here as they&apos;re approved.</p>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {student360.recentPortfolioEvents.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="text-zinc-900 dark:text-zinc-50">{e.title}</div>
                {e.description ? <div className="text-xs text-zinc-500 dark:text-zinc-400">{e.description}</div> : null}
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                {e.score !== null ? <span>{e.score} pts</span> : null}
                <span>{e.event_date}</span>
              </div>
            </li>
          ))}
          {student360.recentPortfolioEvents.length === 0 ? (
            <li className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">No approved activities yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );

  const academicsTab = (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {examReport ? examReport.examination_name : "Subject-wise marks"}
        </h2>
        {examReport ? (
          educationMode === "both" ? (
            <div className="space-y-5">
              {trackOrder.map((track) => {
                const trackSubjects = examReport.subjects.filter((s) => s.track === track);
                return (
                  <div key={track}>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      {TRACK_LABEL[track] ?? track}
                    </h3>
                    {trackSubjects.length > 0 ? (
                      <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1.5 pr-4">Subject</th>
                  <th className="py-1.5 pr-4">Marks</th>
                  <th className="py-1.5 pr-4">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {trackSubjects.map((s) => (
                  <tr key={s.subject_id}>
                    <td className="py-1.5 pr-4 text-zinc-900 dark:text-zinc-50">{s.subject_name}</td>
                    <td className="py-1.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {s.is_absent ? "Absent" : s.marks_obtained !== null ? `${s.marks_obtained}/${s.max_marks}` : "—"}
                    </td>
                    <td className="py-1.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {!s.is_absent && s.marks_obtained !== null ? `${Math.round((Number(s.marks_obtained) / Number(s.max_marks)) * 1000) / 10}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
                    ) : (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">No {(TRACK_LABEL[track] ?? track).toLowerCase()} subjects tagged yet.</p>
                    )}
                  </div>
                );
              })}
              {examReport.subjects.filter((s) => !s.track).length > 0 ? (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Untagged</h3>
                  <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1.5 pr-4">Subject</th>
                  <th className="py-1.5 pr-4">Marks</th>
                  <th className="py-1.5 pr-4">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {examReport.subjects.filter((s) => !s.track).map((s) => (
                  <tr key={s.subject_id}>
                    <td className="py-1.5 pr-4 text-zinc-900 dark:text-zinc-50">{s.subject_name}</td>
                    <td className="py-1.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {s.is_absent ? "Absent" : s.marks_obtained !== null ? `${s.marks_obtained}/${s.max_marks}` : "—"}
                    </td>
                    <td className="py-1.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {!s.is_absent && s.marks_obtained !== null ? `${Math.round((Number(s.marks_obtained) / Number(s.max_marks)) * 1000) / 10}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1.5 pr-4">Subject</th>
                  <th className="py-1.5 pr-4">Marks</th>
                  <th className="py-1.5 pr-4">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {examReport.subjects.map((s) => (
                  <tr key={s.subject_id}>
                    <td className="py-1.5 pr-4 text-zinc-900 dark:text-zinc-50">{s.subject_name}</td>
                    <td className="py-1.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {s.is_absent ? "Absent" : s.marks_obtained !== null ? `${s.marks_obtained}/${s.max_marks}` : "—"}
                    </td>
                    <td className="py-1.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {!s.is_absent && s.marks_obtained !== null ? `${Math.round((Number(s.marks_obtained) / Number(s.max_marks)) * 1000) / 10}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No exam marks recorded yet.</p>
        )}
      </section>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        For full report cards and past examinations, see <Link href="/results" className="underline">Results</Link>.
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <Link href="/students/directory" className="text-sm text-zinc-500 dark:text-zinc-400 underline">
        ← Back to Student profiles
      </Link>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        {profile.photo_file_id ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar from an authenticated /api/files route, not a static/optimizable asset
          <img src={`/api/files/${profile.photo_file_id}`} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-zinc-100 dark:ring-zinc-800" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 text-xl font-medium text-zinc-500 ring-2 ring-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-800">
            {profile.full_name.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{profile.full_name}</h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {profile.admission_number} · {classDivisionLabel}
            {profile.status === "withdrawn" ? <span className="ml-2 text-red-600 dark:text-red-400">(removed)</span> : null}
          </p>
        </div>
      </div>

      <ProfileTabs
        tabs={[
          { id: "personal", label: "Personal" },
          { id: "summary", label: "Summary" },
          { id: "fees", label: "Student Fees" },
          { id: "portfolio", label: "Student Portfolio" },
          { id: "academics", label: "Academics" },
        ]}
        initialTab={tab}
      >
        {personalTab}
        {summaryTab}
        {feesTab}
        {portfolioTab}
        {academicsTab}
      </ProfileTabs>
    </div>
  );
}
