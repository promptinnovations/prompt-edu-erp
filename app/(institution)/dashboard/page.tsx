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
import { getMostRecentExamination, getMarkEntryStatus, getInstitutionPassRateTrendByStage, getOpenMarkEntryForTeacher } from "../../../modules/examination/service";
import {
  getInstitutionAttendanceTrend, getInstitutionAttendanceTrendByStage, getConsecutiveAbsentees,
  getPendingLeaveApplicationsForReviewer,
} from "../../../modules/attendance/service";
import { resolveAttendanceVisibility } from "../../../services/scope/attendance-visibility-service";
import OnboardingChecklist from "./OnboardingChecklist";
import TodoWidget from "./TodoWidget";
import {
  ResultIcon, StaffIcon, AttendanceIcon, StudentIcon, DisciplineIcon, AnalysisIcon,
  SubstitutionIcon, CalendarIcon, ExamIcon, MentoringIcon, SkillsIcon, LibraryIcon, TrendUpIcon,
} from "../../components/NavIcons";
import AttendanceTrendChart from "../../components/AttendanceTrendChart";
import AttendanceStageTrendChart from "../../components/AttendanceStageTrendChart";
import ConsecutiveAbsenteesList from "../../components/ConsecutiveAbsenteesList";
import PassRateStageTrendChart from "../../components/PassRateStageTrendChart";
import { todayIST, formatDateIST } from "../../../services/datetime/ist";
import StarOfTheMonthBanner from "../../components/StarOfTheMonthBanner";
import { getUserDisplayInfo } from "../../../services/tenant/tenant-service";
import { getMyRoleNames, getLibrarySnapshot, getFeeSnapshot } from "../../../services/home/dashboard-insights";
import { Panel, StatTile, EmptyNote } from "../../components/portal/viz/blocks";
import { RingGauge, HBars, Timeline, ColumnBars } from "../../components/portal/viz/charts";
import { seriesColor, tint } from "../../components/portal/viz/palette";

interface QuickButton { label: string; href: string; icon: ReactNode }

function formatDate(d: string) {
  return formatDateIST(d, { day: "numeric", month: "short" });
}

export default async function DashboardPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const t = await getTranslations("dashboard");
  const canSeeChecklist = can(ctx.permissions, "settings.manage");
  const today = todayIST();

  const enabledModules = await getEnabledModuleCodes(institutionId, authUserId);
  const hasExaminationAccess = enabledModules.has("examination") && (can(ctx.permissions, "marks.view") || can(ctx.permissions, "marks.enter"));
  // §CS.3 "Mark entry status visible only for principal/management/admin
  //  not for teachers" -- marks.approve is the institution-wide "sees
  //  everything" signal (institution_admin + management hold it, teacher
  //  does not), same gate the /examinations/status page and its sidebar
  //  link now enforce.
  const canSeeMarkEntryStatus = hasExaminationAccess && can(ctx.permissions, "marks.approve");
  // §"an exam of which the mark entry is open should be available in the
  // dashboard of every teacher, but only classes/subjects concerned" --
  // every teacher holding marks.enter (i.e. everyone who can reach the
  // marks grid at all), NOT gated on marks.approve like the widget above.
  const canSeeOpenMarkEntry = hasExaminationAccess && can(ctx.permissions, "marks.enter");
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

  const [markEntryStatus, openMarkEntry, passRateTrendByStage, upcoming, attendanceTrend, attendanceTrendByStage, consecutiveAbsentees, pendingLeave] = await Promise.all([
    canSeeMarkEntryStatus && recentExam ? getMarkEntryStatus(institutionId, authUserId, recentExam.id) : Promise.resolve([]),
    canSeeOpenMarkEntry ? getOpenMarkEntryForTeacher(institutionId, authUserId, ctx.userId) : Promise.resolve([]),
    // §Dashboard follow-up: "do the same of attendance trend for [pass
    // rate] as well - Y axis 0-100%, X-axis each exams - different section
    // different colour".
    hasExaminationAccess ? getInstitutionPassRateTrendByStage(institutionId, authUserId, 5) : Promise.resolve([]),
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

  // §Staff-dashboard-visual-redesign — greeting + role-specific snapshots
  // (library for librarians, fee collection for fees/accounts roles). Pure
  // reads, gated by the same module/permission codes the pages use.
  const hasLibraryDesk = enabledModules.has("library") && (can(ctx.permissions, "library.issue") || can(ctx.permissions, "library.manage"));
  const hasFeeDesk = enabledModules.has("fees") && (can(ctx.permissions, "fees.manage") || can(ctx.permissions, "fees.collect") || can(ctx.permissions, "fees.view"));
  const [viewer, roleNames, librarySnapshot, feeSnapshot] = await Promise.all([
    getUserDisplayInfo(authUserId, ctx.userId).catch(() => null),
    getMyRoleNames(institutionId, authUserId, ctx.userId).catch(() => [] as string[]),
    hasLibraryDesk ? getLibrarySnapshot(institutionId, authUserId).catch(() => null) : Promise.resolve(null),
    hasFeeDesk ? getFeeSnapshot(institutionId, authUserId).catch(() => null) : Promise.resolve(null),
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

  // §Dashboard follow-up: "this page shall be titled as Result analysis.
  // Give it a direct button in dashboard - make it more noticeable than
  // others" — a single featured, filled/accent tile (every other
  // quickButtons entry is the same plain white outline card) so Result
  // Analysis (/analytics) stands out as the primary landing spot, gated on
  // the same "reports.view" permission the page itself requires.
  const hasResultAnalysisAccess = can(ctx.permissions, "reports.view");

  // §Staff-dashboard-visual-redesign — same widgets, same permission gates
  // as before; only the presentation changed (coloured tiles, rings, bars,
  // timeline) plus the role snapshots fetched above.
  const statCards: Array<{ label: string; value: number; icon: string }> = [
    { label: t("classes"), value: stats.classes, icon: "🏫" },
    { label: "Divisions", value: stats.divisions, icon: "🧩" },
    { label: t("students"), value: stats.students, icon: "🎒" },
    { label: "Teachers", value: stats.teachers, icon: "👩‍🏫" },
    { label: "Staff", value: stats.staff, icon: "🧑‍💼" },
  ];

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (viewer?.fullName ?? "").trim().split(/\s+/)[0] ?? "";
  const studentPct = attendanceToday && attendanceToday.studentsMarked > 0
    ? Math.round((attendanceToday.studentsPresent / attendanceToday.studentsMarked) * 1000) / 10 : null;
  const staffPct = attendanceToday && attendanceToday.staffMarked > 0
    ? Math.round((attendanceToday.staffPresent / attendanceToday.staffMarked) * 1000) / 10 : null;

  // Mark entry progress per class (rows are per class × subject).
  const markByClass = new Map<string, { expected: number; entered: number }>();
  for (const r of markEntryStatus) {
    const c = markByClass.get(r.class_name) ?? { expected: 0, entered: 0 };
    c.expected += r.expected; c.entered += r.entered;
    markByClass.set(r.class_name, c);
  }
  const markPct = markExpected > 0 ? Math.round((markEntered / markExpected) * 1000) / 10 : null;
  const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });
  const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-card p-6 text-white shadow-float sm:p-8" style={{ background: "linear-gradient(120deg, var(--brand-from, var(--brand)), var(--brand-via, var(--brand)) 55%, var(--brand-to, var(--brand)))" }}>
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-black/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[14rem]">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-white/70">{t("institution")}</div>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{institution?.appName || institution?.name}</h1>
            <p className="mt-2 text-sm text-white/85">
              {greeting}{firstName ? `, ${firstName}` : ""}{roleNames.length > 0 ? ` · ${roleNames.join(", ")}` : ""}
            </p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            {formatDateIST(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>
      </section>

      <StarOfTheMonthBanner institutionId={institutionId} authUserId={authUserId} />

      <section aria-label="Institution at a glance" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((s, i) => (
          <StatTile key={s.label} label={s.label} value={s.value} icon={s.icon} color={seriesColor(i)} />
        ))}
      </section>

      {hasResultAnalysisAccess ? (
        <Link
          href="/analytics"
          className="group relative flex items-center gap-4 overflow-hidden rounded-card bg-[var(--brand)] p-5 text-white shadow-float transition-transform hover:scale-[1.01]"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
            <TrendUpIcon className="h-6 w-6" />
          </span>
          <div className="relative min-w-0 flex-1">
            <div className="text-base font-semibold">Result Analysis</div>
            <div className="text-sm text-white/80">Exam pass rates, subject and class performance, live results</div>
          </div>
          <span className="relative text-2xl transition-transform group-hover:translate-x-1">&rarr;</span>
        </Link>
      ) : null}

      {quickButtons.length > 0 ? (
        // Grid, not a horizontally-scrolling row (§ follow-up: "arrange them
        // in 3-4 rows") — every button visible at once.
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {quickButtons.map((b, i) => {
            const c = seriesColor(i % 8);
            return (
              <Link
                key={b.label}
                href={b.href}
                className="flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-center shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raised"
                style={{ borderColor: tint(c, 0.3), background: `linear-gradient(180deg, ${tint(c, 0.12)}, var(--surface))` }}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ backgroundColor: c }}>
                  {b.icon}
                </span>
                <span className="text-xs font-medium text-zinc-700">{b.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {canSeeChecklist ? <OnboardingChecklist items={checklist} /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {attendanceToday ? (
          <Panel title="Today's attendance" subtitle={formatDateIST(today)} color={seriesColor(2)}>
            <div className="grid grid-cols-2 gap-4">
              {([
                ["Students", studentPct, attendanceToday.studentsPresent, attendanceToday.studentsMarked, attendanceToday.studentsEnrolled, attendanceToday.studentsAbsent, seriesColor(2)],
                ["Staff", staffPct, attendanceToday.staffPresent, attendanceToday.staffMarked, attendanceToday.staffTotal, attendanceToday.staffAbsent, seriesColor(0)],
              ] as const).map(([label, pct, present, marked, total, absent, color]) => (
                <div key={label} className="flex flex-col items-center gap-1 text-center">
                  <RingGauge value={pct} color={color} size={112} stroke={12} sub={label.toLowerCase()} title={`${label}: ${pct ?? "—"}% present`} />
                  <p className="text-sm font-medium text-[var(--foreground)]">{present}<span className="font-normal text-zinc-500">/{total} present</span></p>
                  <p className="text-xs text-zinc-500">{marked > 0 ? `${absent} absent · ${marked} marked` : "Not marked yet"}</p>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel title="To do list" color={seriesColor(7)}>
          <TodoWidget todos={todos} />
        </Panel>

        {librarySnapshot ? (
          <Panel title="Library desk" subtitle="Live loans, holds and reviews." color={seriesColor(3)} action={<Link href="/library" className="text-xs text-[var(--brand)] underline">Open library →</Link>}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ["On loan", librarySnapshot.issuedNow, "📚", seriesColor(3)],
                ["Overdue", librarySnapshot.overdue, "⏰", seriesColor(7)],
                ["Holds", librarySnapshot.holdsWaiting + librarySnapshot.holdsReady, "📦", seriesColor(0)],
                ["Reviews to check", librarySnapshot.reviewsPending, "✍️", seriesColor(4)],
              ] as const).map(([label, n, icon, c]) => (
                <div key={label} className="rounded-xl p-3 text-center" style={{ backgroundColor: tint(c, 0.1) }}>
                  <div aria-hidden className="text-lg">{icon}</div>
                  <div className="text-xl font-bold text-[var(--foreground)]">{n}</div>
                  <div className="text-xs text-zinc-600">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <p className="mb-1 text-xs text-zinc-500">Books issued per month · {librarySnapshot.books} titles, {librarySnapshot.copiesAvailable} copies on the shelf</p>
              <ColumnBars unit="" color={seriesColor(3)} height={170} max={Math.max(5, ...librarySnapshot.issuesByMonth.map((m) => m.issues))}
                items={librarySnapshot.issuesByMonth.map((m) => ({ label: monthLabel(m.month), value: m.issues, tip: `${monthLabel(m.month)}: ${m.issues} issued` }))} />
            </div>
          </Panel>
        ) : null}

        {feeSnapshot ? (
          <Panel title="Fee collection" subtitle={feeSnapshot.yearName ? `Academic year ${feeSnapshot.yearName}` : undefined} color={seriesColor(6)} action={<Link href="/fees" className="text-xs text-[var(--brand)] underline">Open fees →</Link>}>
            <div className="flex flex-wrap items-center gap-5">
              <RingGauge value={feeSnapshot.due > 0 ? Math.round((feeSnapshot.collected / feeSnapshot.due) * 1000) / 10 : null} color={seriesColor(6)} size={120} stroke={13} sub="collected" />
              <div className="grid flex-1 grid-cols-2 gap-2 text-sm">
                <div><div className="text-xs text-zinc-500">Collected</div><div className="font-semibold text-[var(--foreground)]">{rupees(feeSnapshot.collected)}</div></div>
                <div><div className="text-xs text-zinc-500">Outstanding</div><div className="font-semibold text-[var(--foreground)]">{rupees(Math.max(0, feeSnapshot.due - feeSnapshot.collected))}</div></div>
                <div><div className="text-xs text-zinc-500">Invoices paid / part / pending</div><div className="font-semibold text-[var(--foreground)]">{feeSnapshot.paid} / {feeSnapshot.partial} / {feeSnapshot.pending}</div></div>
                <div><div className="text-xs text-zinc-500">Overdue</div><div className={`font-semibold ${feeSnapshot.overdue > 0 ? "text-rose-700" : "text-[var(--foreground)]"}`}>{feeSnapshot.overdue}</div></div>
              </div>
            </div>
            <div className="mt-4">
              <p className="mb-1 text-xs text-zinc-500">Collected per month (₹)</p>
              <ColumnBars unit="" color={seriesColor(6)} height={170} max={Math.max(1, ...feeSnapshot.collectedByMonth.map((m) => m.amount))}
                items={feeSnapshot.collectedByMonth.map((m) => ({ label: monthLabel(m.month), value: m.amount, tip: `${monthLabel(m.month)}: ${rupees(m.amount)}` }))} />
            </div>
          </Panel>
        ) : null}

        {canSeeMarkEntryStatus && recentExam ? (
          <Panel title="Mark entry status" subtitle={recentExam.name} color={seriesColor(0)} action={<Link href="/examinations/status" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">View full status →</Link>}>
            {markExpected === 0 ? (
              <EmptyNote>No students/subjects configured yet.</EmptyNote>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <RingGauge value={markPct} color={seriesColor(0)} size={96} stroke={11} />
                  <p className="text-sm text-zinc-600"><b className="text-[var(--foreground)]">{markEntered}</b> of {markExpected} marks entered</p>
                </div>
                <HBars rows={[...markByClass.entries()].map(([name, c]) => ({
                  label: name, value: c.expected > 0 ? Math.round((c.entered / c.expected) * 1000) / 10 : null,
                  color: c.entered >= c.expected ? seriesColor(2) : seriesColor(0), note: `${c.entered}/${c.expected}`,
                }))} />
              </div>
            )}
          </Panel>
        ) : null}

        {canSeeOpenMarkEntry ? (
          <Panel title="Mark Entry" subtitle="Exams open for your classes and subjects." color={seriesColor(0)} className="lg:col-span-2">
            {openMarkEntry.length === 0 ? (
              <EmptyNote>Nothing open for entry right now.</EmptyNote>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {openMarkEntry.map((r) => (
                  <li key={`${r.examSubjectId}-${r.classId}`}>
                    <Link
                      href={`/examinations/${r.examinationId}/marks/${r.examSubjectId}`}
                      className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] p-3 transition-all hover:-translate-y-0.5 hover:shadow-raised"
                      style={{ borderLeft: `4px solid ${r.status === "not_started" ? seriesColor(1) : seriesColor(0)}` }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--foreground)]">{r.subjectName} · {r.className}</span>
                        <span className="block truncate text-xs text-zinc-500">{r.examinationName}</span>
                      </span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: tint(r.status === "not_started" ? seriesColor(1) : seriesColor(0), 0.14), color: "var(--foreground)" }}>
                        {r.status === "not_started" ? "Enter marks" : "Continue"} →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}

        {hasExaminationAccess && passRateTrendByStage.length > 0 ? (
          <Panel title="Pass rate trend" color={seriesColor(1)} action={<Link href="/analytics" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Full view →</Link>}>
            <PassRateStageTrendChart points={passRateTrendByStage} />
          </Panel>
        ) : null}

        {isSectionOrAbove && attendanceTrendByStage.length > 0 ? (
          <Panel title="Attendance trend" subtitle={`${attendanceVisibility.label} · last 15 days`} color={seriesColor(2)} action={<Link href="/attendance#overview" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Full view →</Link>}>
            <AttendanceStageTrendChart points={attendanceTrendByStage} />
          </Panel>
        ) : attendanceVisibility.hasAccess && attendanceTrend.length > 0 ? (
          <Panel title="Attendance trend" subtitle={attendanceVisibility.label} color={seriesColor(2)} action={<Link href="/attendance#overview" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Full view →</Link>}>
            <AttendanceTrendChart points={attendanceTrend} compact />
          </Panel>
        ) : null}

        {isSectionOrAbove && consecutiveAbsentees.length > 0 ? (
          <Panel title="Chronic absentees (3+ days)" color={seriesColor(7)} action={<Link href="/attendance#overview" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Full view →</Link>}>
            <ConsecutiveAbsenteesList rows={consecutiveAbsentees} />
          </Panel>
        ) : null}

        {hasUnrestrictedLeaveReview || hasScopedLeaveReview ? (
          <Panel title="Pending leave requests" color={seriesColor(4)} action={<Link href="/attendance#leave" className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">Review →</Link>}>
            {pendingLeave.length === 0 ? (
              <EmptyNote>Nothing pending.</EmptyNote>
            ) : (
              <ul className="space-y-2">
                {pendingLeave.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm">
                    <span className="truncate text-zinc-700">
                      {l.applicant_name} <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] capitalize text-zinc-600">{l.applicant_type}</span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">{l.start_date} → {l.end_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}

        <Panel title="Upcoming calendar" color={seriesColor(6)}>
          {upcoming.length === 0 ? (
            <EmptyNote>Nothing scheduled.</EmptyNote>
          ) : (
            <Timeline
              items={upcoming.map((u) => ({
                key: `${u.kind}-${u.id}`,
                date: `${formatDate(u.date)}${u.endDate ? ` – ${formatDate(u.endDate)}` : ""}`,
                title: u.title,
                meta: u.kind === "exam" ? "Examination" : u.subKind ? u.subKind.charAt(0).toUpperCase() + u.subKind.slice(1) : undefined,
                color: u.kind === "exam" ? seriesColor(0) : u.subKind === "holiday" ? "#c7bda9" : seriesColor(6),
                icon: u.kind === "exam" ? "✎" : u.subKind === "holiday" ? "☀" : "★",
              }))}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
