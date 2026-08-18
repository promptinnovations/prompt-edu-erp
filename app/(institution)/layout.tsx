import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRequestContext } from "../../services/request-context";
import { getInstitution, getEnabledUiLanguages } from "../../services/institution/institution-service";
import { getEnabledModuleCodes } from "../../services/modules/module-service";
import { getRoleCodesForUser, can } from "../../services/permissions/permission-service";
import { resolvePortalDestination } from "../../modules/portal/service";
import { listMyNotifications, getUnreadNotificationCount } from "../../services/notification/notification-service";
import { getUserDisplayInfo } from "../../services/tenant/tenant-service";
import NotificationBell from "../components/NotificationBell";
import ResponsiveSidebar from "../components/ResponsiveSidebar";
import GroupedNavLinks, { type NavEntry } from "../components/GroupedNavLinks";
import Breadcrumb from "../components/Breadcrumb";
import SignedInAs from "../components/SignedInAs";
import {
  DashboardIcon, AcademicIcon, StudentIcon, AttendanceIcon, ExamIcon, ResultIcon, LibraryIcon,
  StaffIcon, SkillsIcon, DisciplineIcon, MentoringIcon, AnalysisIcon, PrintIcon,
  UsersIcon, SettingsIcon, SuperAdminIcon, ImportIcon, AnnouncementIcon, StorageIcon,
} from "../components/NavIcons";
import { setLocaleAction, signOutAction, exitSuperAdminViewAction } from "./actions";

export default async function InstitutionLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    redirect("/login");
  }
  if (ctx.institutionBlockedReason) {
    redirect(`/suspended?reason=${ctx.institutionBlockedReason}`);
  }
  if (!ctx.institutionId) {
    // Authenticated, but no active institution membership resolved (§B.3) —
    // a real build would route this to an institution picker / Super Admin
    // console; Phase 0 keeps it a plain message.
    redirect("/login");
  }

  // §Z routing, defense-in-depth layer: loginAction() already redirects a
  // pure student/parent role straight to their portal, but this layout
  // wraps EVERY (institution) route, so anyone who navigates here directly
  // (bookmark, typed URL, stale tab) gets caught too — a student/parent
  // never reaches an admin page/server action by construction, not by
  // remembering to permission-gate each one individually.
  const roleCodes = await getRoleCodesForUser(ctx.session.authUserId, ctx.userId, ctx.institutionId);
  const portalDestination = resolvePortalDestination(roleCodes);
  if (portalDestination === "student") redirect("/portal/student");
  if (portalDestination === "parent") redirect("/portal/parent");

  const [institution, enabledLocales, enabledModules, t, locale, notifications, unreadCount, viewer] = await Promise.all([
    getInstitution(ctx.institutionId, ctx.session.authUserId),
    getEnabledUiLanguages(ctx.institutionId, ctx.session.authUserId),
    getEnabledModuleCodes(ctx.institutionId, ctx.session.authUserId),
    getTranslations("nav"),
    getLocale(),
    listMyNotifications(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUnreadNotificationCount(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUserDisplayInfo(ctx.session.authUserId, ctx.userId),
  ]);

  // Plain data, not JSX — permission/module gating happens here (Server
  // Component), active-page highlighting/expand-collapse happens inside
  // GroupedNavLinks (Client Component, needs usePathname()). "Give access
  // to the assigned roles only" follow-up (kept from the flat-nav design):
  // every leaf is gated on the SAME permission code that page itself
  // already uses internally to decide what's visible/editable there.
  //
  // "Rearrange the sidepanel under this structure" follow-up — the flat,
  // ~18-item list above is replaced with the 12 named groups given
  // verbatim (Academic Structure, Student Management, Attendance,
  // Examination, Result, Library, Staff, Skills & Achievements, Discipline,
  // Mentoring, Analysis, Print Center). A few of those sub-items share ONE
  // underlying page (e.g. "Create Exam"/"Exams" are both /examinations —
  // same precedent as before) with `#anchor`s added to that page where a
  // section boundary already existed. Modules/permissions NOT mentioned in
  // that list (Scoring, Import/Export, Announcements, Storage, Users &
  // Roles, Settings, Super Admin) still need a home — folded Scoring into
  // Result (closest existing "consolidated performance" concept) and kept
  // the rest as plain trailing links below the 12 groups, same as the
  // System-utility items always sat at the bottom of the old flat list.
  const hasSkillsAccess = enabledModules.has("skills")
    && (can(ctx.permissions, "skills.review") || can(ctx.permissions, "skills.approve") || can(ctx.permissions, "skills.submit"));
  const hasAchievementsAccess = enabledModules.has("achievements")
    && (can(ctx.permissions, "achievements.verify") || can(ctx.permissions, "achievements.approve") || can(ctx.permissions, "achievements.submit"));
  const hasExaminationAccess = enabledModules.has("examination") && (can(ctx.permissions, "marks.view") || can(ctx.permissions, "marks.enter"));
  const hasAttendanceAccess = enabledModules.has("attendance") && (can(ctx.permissions, "attendance.view") || can(ctx.permissions, "attendance.enter"));
  const hasStudentAccess = can(ctx.permissions, "student.view") || can(ctx.permissions, "student.view_all");
  const hasDisciplineAccess = enabledModules.has("discipline") && (can(ctx.permissions, "discipline.view") || can(ctx.permissions, "discipline.record"));
  const hasMentoringAccess = enabledModules.has("mentoring")
    && (can(ctx.permissions, "mentoring.view_all") || can(ctx.permissions, "mentoring.view_own") || can(ctx.permissions, "mentoring.create"));
  const hasLibraryAccess = enabledModules.has("library") && can(ctx.permissions, "library.view");
  const hasStaffAccess = enabledModules.has("staff") && can(ctx.permissions, "staff.view");
  const hasReportsAccess = can(ctx.permissions, "reports.view");
  const hasSettingsAccess = can(ctx.permissions, "settings.manage");

  const navItems: NavEntry[] = [
    { kind: "link", href: "/dashboard", label: t("dashboard"), icon: DashboardIcon },

    ...(hasSettingsAccess ? [{
      kind: "group" as const, label: "Academic Structure", icon: AcademicIcon,
      items: [
        { href: "/classes", label: "Classes overview" },
        { href: "/academic#classes", label: "Classes" },
        { href: "/academic#sections", label: "Sections" },
        { href: "/academic#subjects", label: "Subjects" },
        { href: "/academic#academic-years", label: "Academic years" },
      ],
    }] : [{ kind: "link" as const, href: "/classes", label: "Classes", icon: AcademicIcon }]),

    ...(hasStudentAccess ? [{
      kind: "group" as const, label: "Student Management", icon: StudentIcon,
      items: [
        { href: "/students", label: "Student profiles" },
        { href: "/students", label: "Enrollment" },
        { href: "/students", label: "Portfolio" },
      ],
    }] : []),

    ...(hasAttendanceAccess ? [{
      kind: "group" as const, label: "Attendance", icon: AttendanceIcon,
      items: [
        { href: "/attendance#take", label: "Student attendance" },
        { href: "/attendance#leave", label: "Leave applications" },
        { href: "/attendance/register", label: "Monthly register" },
      ],
    }] : []),

    ...(hasExaminationAccess ? [{
      kind: "group" as const, label: "Examination", icon: ExamIcon,
      items: [
        { href: "/examinations#create", label: "Create Exam (For admin)" },
        { href: "/examinations#list", label: "Exams" },
        { href: "/examinations", label: "Mark entry" },
        { href: "/examinations/status", label: "Mark entry status" },
      ],
    }] : []),

    ...(hasExaminationAccess ? [{
      kind: "group" as const, label: "Result", icon: ResultIcon,
      items: [
        { href: "/results", label: "Results" },
        { href: "/analytics", label: "Analysis" },
        { href: "/results", label: "Consolidated marks" },
        { href: "/results", label: "Report Cards" },
        ...(hasReportsAccess ? [{ href: "/scoring", label: "Scoring" }] : []),
      ],
    }] : []),

    ...(hasLibraryAccess ? [{
      kind: "group" as const, label: "Library", icon: LibraryIcon,
      items: [
        { href: "/library", label: "Catalogue" },
        { href: "/library", label: "Issue/return" },
        { href: "/library", label: "Reading history" },
      ],
    }] : []),

    ...(hasStaffAccess ? [{
      kind: "group" as const, label: "Staff", icon: StaffIcon,
      items: [
        { href: "/staff", label: "Staff directory (Profile)" },
        { href: "/staff", label: "Staff attendance" },
        { href: "/staff/register", label: "Monthly register" },
        { href: "/staff", label: "Teacher Performance" },
      ],
    }] : []),

    ...(hasSkillsAccess || hasAchievementsAccess ? [{
      kind: "group" as const, label: "Skills & Achievements", icon: SkillsIcon,
      items: [
        ...(hasAchievementsAccess ? [{ href: "/achievements", label: "Student achievements & Recognitions" }] : []),
        ...(hasSkillsAccess ? [{ href: "/skills", label: "Reading, Writing, Speaking, language activities" }] : []),
      ],
    }] : []),

    ...(hasDisciplineAccess ? [{
      kind: "group" as const, label: "Discipline", icon: DisciplineIcon,
      items: [
        { href: "/discipline", label: "Discipline records" },
        { href: "/discipline", label: "Character assessments" },
      ],
    }] : []),

    ...(hasMentoringAccess ? [{
      kind: "group" as const, label: "Mentoring", icon: MentoringIcon,
      items: [
        { href: "/mentoring", label: "Mentor observations" },
        { href: "/mentoring", label: "Goals" },
        { href: "/mentoring", label: "Action plans" },
        { href: "/analysis", label: "Pattern analysis" },
      ],
    }] : []),

    ...(hasReportsAccess ? [{ kind: "link" as const, href: "/analysis", label: "Analysis", icon: AnalysisIcon }] : []),
    { kind: "link", href: "/print", label: "Print Center", icon: PrintIcon },

    ...(can(ctx.permissions, "data.import") || can(ctx.permissions, "data.export")
      ? [{ kind: "link" as const, href: "/import", label: t("importExport"), icon: ImportIcon }]
      : []),
    ...(can(ctx.permissions, "announcements.view")
      ? [{ kind: "link" as const, href: "/announcements", label: t("announcements"), icon: AnnouncementIcon }]
      : []),
    ...(can(ctx.permissions, "files.manage")
      ? [{ kind: "link" as const, href: "/storage", label: t("storage"), icon: StorageIcon }]
      : []),
    ...(can(ctx.permissions, "users.manage") || can(ctx.permissions, "roles.manage")
      ? [{ kind: "link" as const, href: "/users", label: t("users"), icon: UsersIcon }]
      : []),
    ...(hasSettingsAccess ? [{ kind: "link" as const, href: "/settings", label: t("settings"), icon: SettingsIcon }] : []),
    ...(ctx.isSuperAdmin ? [{ kind: "link" as const, href: "/super-admin", label: t("superAdmin"), icon: SuperAdminIcon }] : []),
  ];

  // Design refresh (see globals.css): the app now uses one fixed brand
  // palette everywhere instead of a per-institution colour — no more
  // per-tenant CSS variable override here.
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)] md:flex-row">
      <ResponsiveSidebar brandLabel={institution?.appName || institution?.name || "PROMPT EDU ERP"}>
        <GroupedNavLinks items={navItems} />

        {enabledLocales.length > 1 ? (
          <form action={setLocaleAction} className="mb-3 flex items-end gap-1">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-[var(--sidebar-text-muted)]">Language</label>
              <select
                name="locale"
                defaultValue={locale}
                className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-active)]/40 px-2 py-1.5 text-sm text-[var(--sidebar-text)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)]"
              >
                {enabledLocales.map((l) => (
                  <option key={l} value={l}>
                    {l === "ml" ? "മലയാളം" : "English"}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-lg border border-[var(--sidebar-border)] px-2 py-1.5 text-sm text-[var(--sidebar-text)] hover:bg-[var(--sidebar-active)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)]">
              Go
            </button>
          </form>
        ) : null}

        <form action={signOutAction}>
          <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-active)] hover:text-white">
            {t("signOut")}
          </button>
        </form>
      </ResponsiveSidebar>
      <div className="flex min-w-0 flex-1 flex-col">
        {ctx.viewingInstitutionAsSuperAdmin ? (
          <div className="flex flex-col items-start gap-1 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-1.5 text-sm text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>
              Viewing <strong>{institution?.name}</strong> as Super Admin — every action here is fully real.
            </span>
            <form action={exitSuperAdminViewAction}>
              <button type="submit" className="rounded-lg bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">
                Exit to Super Admin console
              </button>
            </form>
          </div>
        ) : null}
        <header data-app-shell className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
          <Breadcrumb />
          <div className="flex items-center gap-3">
            {viewer ? <SignedInAs fullName={viewer.fullName} email={viewer.email} /> : null}
            <NotificationBell initialItems={notifications} initialUnreadCount={unreadCount} />
          </div>
        </header>
        <main className="min-w-0 flex-1 bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
