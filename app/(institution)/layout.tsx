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
import NavLinks, { type NavItem } from "../components/NavLinks";
import Breadcrumb from "../components/Breadcrumb";
import SignedInAs from "../components/SignedInAs";
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
  // Component), active-page highlighting happens inside NavLinks (Client
  // Component, needs usePathname()). "Give access to the assigned roles
  // only" follow-up: every item below is now gated on the SAME permission
  // code that page itself already uses internally to decide what's visible/
  // editable there (see each page's own `can(ctx.permissions, "...")`
  // calls) — a role that page would show nothing useful to (e.g. a pure
  // "staff" role has no student.view/student.view_all, and a "librarian"
  // has no reports.view) no longer even sees the link. Dashboard/Classes
  // stay unconditional — no dedicated permission code exists for either,
  // and both are harmless read-only landing/reference views for any
  // institution member who reaches this layout at all (student/parent
  // roles never do — routed to (portals) above instead).
  const navItems: NavItem[] = [
    { href: "/dashboard", label: t("dashboard") },
    ...(can(ctx.permissions, "settings.manage") ? [{ href: "/academic", label: t("academic") }] : []),
    { href: "/classes", label: t("classes") },
    ...(can(ctx.permissions, "student.view") || can(ctx.permissions, "student.view_all")
      ? [{ href: "/students", label: t("students") }]
      : []),
    ...(enabledModules.has("examination") && (can(ctx.permissions, "marks.view") || can(ctx.permissions, "marks.enter"))
      ? [{ href: "/examinations", label: t("examinations") }]
      : []),
    ...(enabledModules.has("attendance") && (can(ctx.permissions, "attendance.view") || can(ctx.permissions, "attendance.enter"))
      ? [{ href: "/attendance", label: t("attendance") }]
      : []),
    ...(can(ctx.permissions, "reports.view") ? [{ href: "/analytics", label: t("analytics") }] : []),
    ...(enabledModules.has("skills") && (can(ctx.permissions, "skills.review") || can(ctx.permissions, "skills.approve") || can(ctx.permissions, "skills.submit"))
      ? [{ href: "/skills", label: t("skills") }]
      : []),
    ...(enabledModules.has("achievements") && (can(ctx.permissions, "achievements.verify") || can(ctx.permissions, "achievements.approve") || can(ctx.permissions, "achievements.submit"))
      ? [{ href: "/achievements", label: t("achievements") }]
      : []),
    ...(can(ctx.permissions, "reports.view") ? [{ href: "/scoring", label: t("scoring") }] : []),
    ...(enabledModules.has("library") && can(ctx.permissions, "library.view") ? [{ href: "/library", label: t("library") }] : []),
    ...(enabledModules.has("staff") && can(ctx.permissions, "staff.view") ? [{ href: "/staff", label: t("staff") }] : []),
    ...(enabledModules.has("discipline") && (can(ctx.permissions, "discipline.view") || can(ctx.permissions, "discipline.record"))
      ? [{ href: "/discipline", label: t("discipline") }]
      : []),
    ...(enabledModules.has("mentoring") && (can(ctx.permissions, "mentoring.view_all") || can(ctx.permissions, "mentoring.view_own") || can(ctx.permissions, "mentoring.create"))
      ? [{ href: "/mentoring", label: t("mentoring") }]
      : []),
    ...(can(ctx.permissions, "reports.view") ? [{ href: "/reports", label: t("reports") }] : []),
    ...(can(ctx.permissions, "data.import") || can(ctx.permissions, "data.export") ? [{ href: "/import", label: t("importExport") }] : []),
    ...(can(ctx.permissions, "announcements.view") ? [{ href: "/announcements", label: t("announcements") }] : []),
    ...(can(ctx.permissions, "files.manage") ? [{ href: "/storage", label: t("storage") }] : []),
    ...(can(ctx.permissions, "users.manage") || can(ctx.permissions, "roles.manage")
      ? [{ href: "/users", label: t("users") }]
      : []),
    ...(can(ctx.permissions, "settings.manage") ? [{ href: "/settings", label: t("settings") }] : []),
    ...(ctx.isSuperAdmin ? [{ href: "/super-admin", label: t("superAdmin"), separated: true }] : []),
  ];

  // Design refresh (see globals.css): the app now uses one fixed brand
  // palette everywhere instead of a per-institution colour — no more
  // per-tenant CSS variable override here.
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)] md:flex-row">
      <ResponsiveSidebar brandLabel={institution?.appName || institution?.name || "PROMPT EDU ERP"}>
        <NavLinks items={navItems} />

        {enabledLocales.length > 1 ? (
          <form action={setLocaleAction} className="mb-3 flex items-end gap-1">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-zinc-500">Language</label>
              <select
                name="locale"
                defaultValue={locale}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
              >
                {enabledLocales.map((l) => (
                  <option key={l} value={l}>
                    {l === "ml" ? "മലയാളം" : "English"}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-lg border border-zinc-700 px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
              Go
            </button>
          </form>
        ) : null}

        <form action={signOutAction}>
          <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white">
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
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
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
