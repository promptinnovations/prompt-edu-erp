import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ComponentType, SVGProps } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRequestContext } from "../../services/request-context";
import { getInstitution, getEnabledUiLanguages } from "../../services/institution/institution-service";
import { getPlatformDefaultPalette } from "../../services/super-admin/super-admin-service";
import { getPalette, paletteCssVars } from "../../services/branding/palettes";
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
  CalendarIcon, SubstitutionIcon,
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

  const [institution, enabledLocales, enabledModules, t, locale, notifications, unreadCount, viewer, platformDefaultPalette] = await Promise.all([
    getInstitution(ctx.institutionId, ctx.session.authUserId),
    getEnabledUiLanguages(ctx.institutionId, ctx.session.authUserId),
    getEnabledModuleCodes(ctx.institutionId, ctx.session.authUserId),
    getTranslations("nav"),
    getLocale(),
    listMyNotifications(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUnreadNotificationCount(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUserDisplayInfo(ctx.session.authUserId, ctx.userId),
    getPlatformDefaultPalette(),
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
  const hasCalendarAccess = enabledModules.has("calendar") && can(ctx.permissions, "calendar.view");
  const hasSubstitutionAccess = enabledModules.has("substitution") && can(ctx.permissions, "substitution.view");

  // Icons must be pre-rendered elements, not bare component references —
  // GroupedNavLinks is a "use client" component, and a Server Component
  // (this layout) cannot pass a function across that boundary (React:
  // "Functions cannot be passed directly to Client Components"). ni() gives
  // every sidebar icon the same fixed size/colour in one place.
  const ni = (Icon: ComponentType<SVGProps<SVGSVGElement>>) => (
    <Icon className="h-[18px] w-[18px] shrink-0 text-[var(--sidebar-icon)]" />
  );

  const navItems: NavEntry[] = [
    { kind: "link", href: "/dashboard", label: t("dashboard"), icon: ni(DashboardIcon) },

    // §Sidebar-audit: "Classes overview" (/classes) is a genuinely different
    // page from /academic's admin CRUD sections, so it no longer sits nested
    // inside "Academic Structure" (which would otherwise mix two pages under
    // one heading — every sub-item in a group must anchor into that group's
    // OWN single page). Promoted to its own top-level link instead, same
    // href/label non-admins already see below.
    { kind: "link", href: "/classes", label: "Classes", icon: ni(AcademicIcon) },

    ...(hasSettingsAccess ? [{
      kind: "group" as const, label: "Academic Structure", icon: ni(AcademicIcon),
      items: [
        { href: "/academic#academic-years", label: "Academic years" },
        { href: "/academic#classes", label: "Classes" },
        { href: "/academic#divisions", label: "Divisions" },
        { href: "/academic#subjects", label: "Subjects" },
        { href: "/academic#subjects-per-class", label: "Subjects per class" },
      ],
    }] : []),

    // §Student Profile feature — "Student profiles" now opens the card-grid
    // directory (new /students/directory), the front door into each child's
    // own Profile page. "Enrollment" is the user's own naming for this
    // group's original page ("add-student form + search + list=
    // Enrollment") — unchanged. "Portfolio" also opens the directory
    // (portfolios live under each student's own profile, not on a
    // standalone page) with a ?tab= hint so picking a card lands straight
    // on that student's Portfolio tab.
    ...(hasStudentAccess ? [{
      kind: "group" as const, label: "Student Management", icon: ni(StudentIcon),
      items: [
        { href: "/students/directory", label: "Student profiles" },
        { href: "/students", label: "Enrollment" },
        { href: "/students/directory?tab=portfolio", label: "Portfolio" },
      ],
    }] : []),

    ...(hasAttendanceAccess ? [{
      kind: "group" as const, label: "Attendance", icon: ni(AttendanceIcon),
      items: [
        { href: "/attendance#overview", label: "Attendance overview" },
        { href: "/attendance#take", label: "Student attendance" },
        { href: "/attendance#leave", label: "Leave applications" },
        { href: "/attendance#my-leave", label: "My leave" },
        { href: "/attendance#staff-leave", label: "Staff leave review" },
        { href: "/attendance/register", label: "Monthly register" },
      ],
    }] : []),

    ...(hasExaminationAccess ? [{
      kind: "group" as const, label: "Examination", icon: ni(ExamIcon),
      items: [
        { href: "/examinations#create", label: "Create Exam" },
        { href: "/examinations#list", label: "Exams" },
        { href: "/examinations", label: "Mark entry" },
        { href: "/examinations/status", label: "Mark entry status" },
      ],
    }] : []),

    ...(hasExaminationAccess ? [{
      kind: "group" as const, label: "Result", icon: ni(ResultIcon),
      items: [
        // §Sidebar-audit follow-up: the plain "Results" exam-picker
        // sub-item was removed and Result Analysis promoted to the top —
        // Result Analysis (the colorful 360°, exam-dropdown-driven
        // dashboard at /analytics) is now the primary landing spot for
        // this group, rather than a bare table of exams. "Consolidated
        // marks" and "Report Cards" still route through /results itself
        // (it has no separate canonical URL — the exam is picked on that
        // page), so /results remains fully reachable via those two links.
        // relabeled from bare "Analysis" — that name collided with the
        // unrelated cross-module /analysis hub (also in this sidebar,
        // under Mentoring/top-level). This one is specifically the
        // exam-pattern page at /analytics.
        { href: "/analytics", label: "Result Analysis" },
        { href: "/results", label: "Consolidated marks" },
        { href: "/results", label: "Report Cards" },
        ...(hasReportsAccess ? [{ href: "/scoring", label: "Scoring" }] : []),
      ],
    }] : []),

    ...(hasLibraryAccess ? [{
      kind: "group" as const, label: "Library", icon: ni(LibraryIcon),
      // §Sidebar-audit: expanded from 3 approximate labels to the page's 6
      // real sections (user's explicit go-ahead) — "Issue/return" and
      // "Reading history" didn't match any actual section.
      items: [
        { href: "/library#catalogue", label: "Catalogue" },
        { href: "/library#issue", label: "Issue a book" },
        { href: "/library#currently-issued", label: "Currently issued" },
        { href: "/library#reading-reviews", label: "Reading reviews" },
        { href: "/library#pre-bookings", label: "Pre-bookings (waitlist)" },
        { href: "/library#review-corner", label: "Review Corner" },
      ],
    }] : []),

    // §Teacher-Profile feature — "Staff profiles" opens the new card-grid
    // directory (/staff/directory), the front door into each staff member's
    // own Profile page (teaching staff get the full 6-section template +
    // exam analysis + observations; everyone else keeps a plain record —
    // see app/(institution)/staff/[id]/page.tsx). "Staff directory" (the
    // original add/search/table section on /staff) is unchanged, same
    // "profiles vs. the original table" split as Student Management above.
    ...(hasStaffAccess ? [{
      kind: "group" as const, label: "Staff", icon: ni(StaffIcon),
      items: [
        { href: "/staff/directory", label: "Staff profiles" },
        { href: "/staff#directory", label: "Staff directory" },
        { href: "/staff#staff-attendance", label: "Staff attendance" },
        { href: "/staff#staff-leave", label: "Staff leave" },
        { href: "/staff/register", label: "Monthly register" },
        { href: "/staff#portion-plans", label: "Portion plans" },
        { href: "/staff#teacher-observations", label: "Teacher Performance" },
        { href: "/staff#teacher-assignments", label: "Teacher assignments" },
        { href: "/staff#section-head-assignments", label: "Section Head assignments" },
      ],
    }] : []),

    ...(hasSkillsAccess || hasAchievementsAccess ? [{
      kind: "group" as const, label: "Skills & Achievements", icon: ni(SkillsIcon),
      items: [
        ...(hasAchievementsAccess ? [{ href: "/achievements", label: "Student achievements & Recognitions" }] : []),
        ...(hasSkillsAccess ? [{ href: "/skills", label: "Reading, Writing, Speaking, language activities" }] : []),
      ],
    }] : []),

    ...(hasDisciplineAccess ? [{
      kind: "group" as const, label: "Discipline", icon: ni(DisciplineIcon),
      items: [
        { href: "/discipline#records", label: "Discipline records" },
        { href: "/discipline#character", label: "Character assessments" },
      ],
    }] : []),

    ...(hasMentoringAccess ? [{
      kind: "group" as const, label: "Mentoring", icon: ni(MentoringIcon),
      // §Sidebar-audit: "Goals" and "Action plans" were removed as separate
      // sub-items (with the user's explicit go-ahead) — the page is one
      // unified form+table, and Goals/Action plan are just two inline
      // fields on each mentoring record, not distinct sections.
      items: [
        { href: "/mentoring", label: "Mentor observations" },
        { href: "/analysis", label: "Pattern analysis" },
      ],
    }] : []),

    ...(hasReportsAccess ? [{ kind: "link" as const, href: "/analysis", label: "Analysis", icon: ni(AnalysisIcon) }] : []),
    ...(hasSubstitutionAccess ? [{ kind: "link" as const, href: "/substitution", label: "Substitution", icon: ni(SubstitutionIcon) }] : []),
    ...(hasCalendarAccess ? [{ kind: "link" as const, href: "/calendar", label: "Academic Calendar", icon: ni(CalendarIcon) }] : []),
    { kind: "link", href: "/print", label: "Print Center", icon: ni(PrintIcon) },

    ...(can(ctx.permissions, "data.import") || can(ctx.permissions, "data.export")
      ? [{ kind: "link" as const, href: "/import", label: t("importExport"), icon: ni(ImportIcon) }]
      : []),
    ...(can(ctx.permissions, "announcements.view")
      ? [{ kind: "link" as const, href: "/announcements", label: t("announcements"), icon: ni(AnnouncementIcon) }]
      : []),
    ...(can(ctx.permissions, "files.manage")
      ? [{ kind: "link" as const, href: "/storage", label: t("storage"), icon: ni(StorageIcon) }]
      : []),
    ...(can(ctx.permissions, "users.manage") || can(ctx.permissions, "roles.manage")
      ? [{ kind: "link" as const, href: "/users", label: t("users"), icon: ni(UsersIcon) }]
      : []),
    ...(hasSettingsAccess ? [{ kind: "link" as const, href: "/settings", label: t("settings"), icon: ni(SettingsIcon) }] : []),
    ...(ctx.isSuperAdmin ? [{ kind: "link" as const, href: "/super-admin", label: t("superAdmin"), icon: ni(SuperAdminIcon) }] : []),
  ];

  // "Never use dark ... give colour combination options" follow-up
  // (migration 0040): resolves to this institution's own chosen palette,
  // or the platform default if it hasn't picked one, and injects it as a
  // scoped inline <style> override right before the shell — every
  // component below already renders purely off the CSS custom properties
  // globals.css's `:root` defines (--brand, --sidebar-bg, etc.), so this
  // one block re-colours the whole institution app at once.
  const palette = getPalette(institution?.themePalette ?? platformDefaultPalette);
  // §Palette-picker follow-up ("colour palette is still not working"):
  // middleware.ts's CSP is nonce-based in production (`style-src 'self'
  // 'nonce-<value>'`, not 'unsafe-inline'), so this inline <style> tag was
  // being silently dropped by the browser with no nonce attribute -- the
  // saved palette never rendered anywhere, regardless of caching. The
  // nonce is already forwarded per-request as the `x-nonce` header.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)] md:flex-row">
      <style nonce={nonce} dangerouslySetInnerHTML={{ __html: `:root{${paletteCssVars(palette)}}` }} />
      <ResponsiveSidebar
        brandLabel={institution?.appName || institution?.name || "PROMPT EDU ERP"}
        logoUrl={institution?.logoFileId && institution.code ? `/api/institution-logo/${institution.code}` : null}
      >
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
