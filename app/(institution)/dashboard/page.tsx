import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { requireRequestContext } from "../../../services/request-context";
import { getInstitution } from "../../../services/institution/institution-service";
import { getEnabledModuleCodes } from "../../../services/modules/module-service";
import { getOnboardingChecklist } from "../../../services/onboarding/onboarding-service";
import { can } from "../../../services/permissions/permission-service";
import { getInstitutionStats, getTodayAttendanceSummary, getUpcomingItems } from "../../../services/home/home-service";
import { listMyTodos } from "../../../services/todo/todo-service";
import { getMostRecentExamination, getMarkEntryStatus, getInstitutionPassRateTrend } from "../../../modules/examination/service";
import {
  getInstitutionAttendanceTrend, getInstitutionAttendanceTrendByStage, getConsecutiveAbsentees,
  getPendingLeaveApplicationsForReviewer,
} from "../../../modules/attendance/service";
import { resolveAttendanceVisibility } from "../../../services/scope/attendance-visibility-service";
import OnboardingChecklist from "./OnboardingChecklist";
import TodoWidget from "./TodoWidget";
import {
  ResultIcon, StaffIcon, AttendanceIcon, StudentIcon, DisciplineIcon, AnalysisIcon,
  SubstitutionIcon, CalendarIcon, ExamIcon, MentoringIcon, SkillsIcon, LibraryIcon,
} from "../../components/NavIcons";
import AttendanceTrendChart from "../../components/AttendanceTrendChart";
import AttendanceStageTrendChart from "../../components/AttendanceStageTrendChart";
import ConsecutiveAbsenteesList from "../../components/ConsecutiveAbsenteesList";

interface QuickButton { label: string; href: string; icon: ReactNode }

function formatDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default async function DashboardPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const t = await getTranslations("dashboard");
  const canSeeChecklist = can(ctx.permissions, "settings.manage");
  const today = new Date().toISOString().slice(0, 10);

  const enabledModules = await getEnabledModuleCodes(institutionId, authUserId);
  const hasExaminationAccess = enabledModules.has("examination") && (can(ctx.permissions, "marks.view") || can(ctx.permissions, "marks.enter"));
  const hasAttendanceAccess = enabledModules.has("attendance") && (can(ctx.permissions, "attendance.view") || can(ctx.permissions, "attendance.enter"));
  const hasUnrestrictedLeaveReview = can(ctx.permissions, "attendance.edit");
  const hasScopedLeaveReview = can(ctx.permissions, "attendance.leave.review_own_class");

  // §Attendance-follow-up-3: the compact trend widget below must respect
  // the SAME role scoping as the Attendance page itself (see that shared
  // helper's own doc comment for why this was previously an inconsistency
  // — every role who could reach this page saw an institution-wide trend
  // here regardless of what the Attendance page itself showed them).
  const attendanceVisibility = hasAttendanceAccess
    ? await resolveAttendanceVisibility(institutionId, authUserId, ctx.userId, ctx.permissions)
    : { hasAccess: false, label: "" };

  const [institution, checklist, stats, attendanceToday, todos, recentExam] = await Promise.all([
    getInstitution(institutionId, authUserId),
    canSeeChecklist ? getOnboardingChecklist(institutionId, authUserId) : Promise.resolve([]),
    getInstitutionStats(institutionId, authUserId),
    hasAttendanceAccess ? getTodayAttendanceSummary(institutionId, authUserId, today) : Promise.resolve(null),
    listMyTodos(institutionId, authUserId, ctx.userId),
    hasExaminationAccess ? getMostRecentExamination(institutionId, authUserId) : Promise.resolve(null),
  ]);

  // §Dashboard follow-up "instead of [plain bars] use the type of graph in
  // [a labelled multi-colour line chart] ... in the dashboard of section
  // head, principal, management children absent for more than 3
  // consecutive days also should be shown" — the redesigned by-stage trend
  // and the chronic-absentee list are Section-Head/Principal/Management
  // only (i.e. anyone whose attendance scope isn't narrowed to specific
  // classes — a plain class teacher keeps the original compact bar widget
  // below, unchanged, since a single-class view has no "different
  // sections" to plot).
  const isSectionOrAbove = attendanceVisibility.hasAccess && !attendanceVisibility.scope?.classIds;

  const [markEntryStatus, passRateTrend, upcoming, attendanceTrend, attendanceTrendByStage, consecutiveAbsentees, pendingLeave] = await Promise.all([
    hasExaminationAccess && recentExam ? getMarkEntryStatus(institutionId, authUserId, recentExam.id) : Promise.resolve([]),
    hasExaminationAccess ? getInstitutionPassRateTrend(institutionId, authUserId, 5) : Promise.resolve([]),
    getUpcomingItems(institutionId, authUserId, 6),
    // §Page-4 follow-up "Attendance analytics — growth and fall diagram,
    // recent days", also available on Dashboard (compact) per spec. Kept
    // for the class-teacher (single-class) view only — see isSectionOrAbove.
    attendanceVisibility.hasAccess && !isSectionOrAbove
      ? getInstitutionAttendanceTrend(institutionId, authUserId, 10, attendanceVisibility.scope)
      : Promise.resolve([]),
    // §Dashboard follow-up: "left side should be 1-100%, at the bottom
    // last 15 days, line should show different sections differently".
    isSectionOrAbove
      ? getInstitutionAttendanceTrendByStage(institutionId, authUserId, 15, attendanceVisibility.scope)
      : Promise.resolve([]),
    // §Dashboard follow-up: "children absent for more than 3 consecutive
    // days also should be shown".
    isSectionOrAbove
      ? getConsecutiveAbsentees(institutionId, authUserId, attendanceVisibility.scope)
      : Promise.resolve([]),
    // §Page-4 follow-up: staff+student pending leave, "appearing in a table
    // in the dashboard...of principal and class teachers" — read-only here
    // (approve/reject stays on the Attendance page); reviewer-scoped so a
    // class teacher only ever sees their own class's pending student leave.
    hasAttendanceAccess && (hasUnrestrictedLeaveReview || hasScopedLeaveReview)
      ? getPendingLeaveApplicationsForReviewer(institutionId, authUserId, ctx.userId, hasUnrestrictedLeaveReview, hasScopedLeaveReview)
      : Promise.resolve([]),
  ]);

  const markExpected = markEntryStatus.reduce((sum, r) => sum + r.expected, 0);
  const markEntered = markEntryStatus.reduce((sum, r) => sum + r.entered, 0);

  // "Quick Buttons... relevant in the case of each role" — the exact
  // Principal set given (Result, Staff, Lesson Observation, Attendance,
  // Student profiles, Discipline, Analysis, Substitution, Academic
  // Calendar) first, each individually permission/module-gated so a role
  // with fewer permissions naturally sees fewer buttons, plus a few
  // sensible extras for roles that list didn't cover (Mark Entry, Library,
  // Mentoring, Skills). Same permission codes those pages already gate
  // on internally, and the same "always by permission code" convention the
  // sidebar (institution)/layout.tsx uses, so a custom role composed from
  // the same catalogue gets the right buttons automatically.
  const quickButtons: QuickButton[] = [
    ...(hasExaminationAccess && can(ctx.permissions, "marks.view") ? [{ label: "Result", href: "/results", icon: <ResultIcon /> }] : []),
    ...(enabledModules.has("staff") && can(ctx.permissions, "staff.view") ? [{ label: "Staff", href: "/staff", icon: <StaffIcon /> }] : []),
    ...(enabledModules.has("staff") && can(ctx.permissions, "staff.observation.manage") ? [{ label: "Lesson Observation", href: "/staff", icon: <StaffIcon /> }] : []),
    ...(hasAttendanceAccess ? [{ label: "Attendance", href: "/attendance", icon: <AttendanceIcon /> }] : []),
    ...(can(ctx.permissions, "student.view") || can(ctx.permissions, "student.view_all") ? [{ label: "Student profiles", href: "/students", icon: <StudentIcon /> }] : []),
    ...(enabledModules.has("discipline") && (can(ctx.permissions, "discipline.view") || can(ctx.permissions, "discipline.record")) ? [{ label: "Discipline", href: "/discipline", icon: <DisciplineIcon /> }] : []),
    ...(can(ctx.permissions, "reports.view") ? [{ label: "Analysis", href: "/analysis", icon: <AnalysisIcon /> }] : []),
    ...(enabledModules.has("substitution") && can(ctx.permissions, "substitution.view") ? [{ label: "Substitution", href: "/substitution", icon: <SubstitutionIcon /> }] : []),
    ...(enabledModules.has("calendar") && can(ctx.permissions, "calendar.view") ? [{ label: "Academic Calendar", href: "/calendar", icon: <CalendarIcon /> }] : []),
    ...(hasExaminationAccess && can(ctx.permissions, "marks.enter") && !can(ctx.permissions, "marks.view") ? [{ label: "Mark Entry", href: "/examinations", icon: <ExamIcon /> }] : []),
    ...(enabledModules.has("mentoring") && (can(ctx.permissions, "mentoring.view_all") || can(ctx.permissions, "mentoring.view_own") || can(ctx.permissions, "mentoring.create")) ? [{ label: "Mentoring", href: "/mentoring", icon: <MentoringIcon /> }] : []),
    ...(enabledModules.has("skills") && (can(ctx.permissions, "skills.review") || can(ctx.permissions, "skills.submit")) ? [{ label: "Skills", href: "/skills", icon: <SkillsIcon /> }] : []),
    ...(enabledModules.has("library") && can(ctx.permissions, "library.view") ? [{ label: "Library", href: "/library", icon: <LibraryIcon /> }] : []),
  ];

  const statCards: Array<[string, number]> = [
    [t("classes"), stats.classes],
    ["Divisions", stats.divisions],
    [t("students"), stats.students],
    ["Teachers", stats.teachers],
    ["Staff", stats.staff],
  ];

  const maxPassRate = Math.max(1, ...passRateTrend.map((p) => p.percentage));

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-[var(--brand)] p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-black/10 blur-2xl" />
        <div className="relative">
          <div className="text-xs font-medium uppercase tracking-wide text-white/70">{t("institution")}</div>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{institution?.appName || institution?.name}</h1>
          <p className="mt-2 max-w-lg text-sm text-white/80">{t("title")}</p>
        </div>
      </div>

      {quickButtons.length > 0 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {quickButtons.map((b) => (
            <Link
              key={b.label}
              href={b.href}
              className="flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-center shadow-sm transition-colors hover:border-[var(--brand)] dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
                {b.icon}
              </span>
              <span className="whitespace-nowrap text-xs font-medium text-zinc-700 dark:text-zinc-300">{b.label}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {canSeeChecklist ? <OnboardingChecklist items={checklist} /> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</div>
            <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {attendanceToday ? (
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Today&apos;s attendance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Students</p>
                  <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {attendanceToday.studentsPresent}<span className="text-sm font-normal text-zinc-400">/{attendanceToday.studentsEnrolled}</span>
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    {attendanceToday.studentsMarked > 0 ? `${attendanceToday.studentsAbsent} absent` : "Not marked yet"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Staff</p>
                  <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {attendanceToday.staffPresent}<span className="text-sm font-normal text-zinc-400">/{attendanceToday.staffTotal}</span>
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    {attendanceToday.staffMarked > 0 ? `${attendanceToday.staffAbsent} absent` : "Not marked yet"}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">To do list</h3>
            <TodoWidget todos={todos} />
          </section>

          {hasExaminationAccess && recentExam ? (
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <h3 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Mark entry status</h3>
              <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">{recentExam.name}</p>
              {markExpected === 0 ? (
                <p className="text-sm text-zinc-400 dark:text-zinc-500">No students/subjects configured yet.</p>
              ) : (
                <>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${Math.min(100, (markEntered / markExpected) * 100)}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{markEntered} / {markExpected} marks entered</p>
                </>
              )}
              <Link href="/examinations/status" className="mt-2 inline-block text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">View full status →</Link>
            </section>
          ) : null}

          {hasExaminationAccess && passRateTrend.length > 0 ? (
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pass rate trend</h3>
              <div className="flex items-end gap-3" style={{ height: 90 }}>
                {passRateTrend.map((p) => (
                  <div key={p.examinationId} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{p.percentage}%</span>
                    <div className="w-full rounded-t bg-[var(--brand)]/70" style={{ height: `${Math.max(4, (p.percentage / maxPassRate) * 60)}px` }} />
                    <span className="max-w-full truncate text-[10px] text-zinc-400 dark:text-zinc-500" title={p.examinationName}>{p.examinationName}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {isSectionOrAbove && attendanceTrendByStage.length > 0 ? (
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Attendance trend</h3>
                <Link href="/attendance#overview" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Full view →</Link>
              </div>
              <p className="mb-1 text-xs text-zinc-400 dark:text-zinc-500">{attendanceVisibility.label} · last 15 days</p>
              <AttendanceStageTrendChart points={attendanceTrendByStage} />
            </section>
          ) : attendanceVisibility.hasAccess && attendanceTrend.length > 0 ? (
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Attendance trend</h3>
                <Link href="/attendance#overview" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Full view →</Link>
              </div>
              <p className="mb-1 text-xs text-zinc-400 dark:text-zinc-500">{attendanceVisibility.label}</p>
              <AttendanceTrendChart points={attendanceTrend} compact />
            </section>
          ) : null}

          {isSectionOrAbove && consecutiveAbsentees.length > 0 ? (
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Chronic absentees (3+ days)</h3>
                <Link href="/attendance#overview" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Full view →</Link>
              </div>
              <ConsecutiveAbsenteesList rows={consecutiveAbsentees} />
            </section>
          ) : null}

          {hasUnrestrictedLeaveReview || hasScopedLeaveReview ? (
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pending leave requests</h3>
                <Link href="/attendance#leave" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Review →</Link>
              </div>
              {pendingLeave.length === 0 ? (
                <p className="text-sm text-zinc-400 dark:text-zinc-500">Nothing pending.</p>
              ) : (
                <ul className="space-y-2">
                  {pendingLeave.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-zinc-700 dark:text-zinc-300">
                        {l.applicant_name} <span className="text-xs text-zinc-400 dark:text-zinc-500 capitalize">({l.applicant_type})</span>
                      </span>
                      <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{l.start_date} → {l.end_date}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Upcoming calendar</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-zinc-700 dark:text-zinc-300">{u.title}</span>
                    <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                      {formatDate(u.date)}{u.endDate ? ` – ${formatDate(u.endDate)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
