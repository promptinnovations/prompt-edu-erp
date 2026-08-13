import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireRequestContext } from "../../services/request-context";
import { getInstitution, getEnabledUiLanguages } from "../../services/institution/institution-service";
import { getEnabledModuleCodes } from "../../services/modules/module-service";
import { getRoleCodesForUser, can } from "../../services/permissions/permission-service";
import { resolvePortalDestination } from "../../modules/portal/service";
import { listMyNotifications, getUnreadNotificationCount } from "../../services/notification/notification-service";
import NotificationBell from "../components/NotificationBell";
import ResponsiveSidebar from "../components/ResponsiveSidebar";
import { setLocaleAction, signOutAction, exitSuperAdminViewAction } from "./actions";

const NAV_LINK = "rounded-lg px-3 py-2 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white";

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

  const [institution, enabledLocales, enabledModules, t, locale, notifications, unreadCount] = await Promise.all([
    getInstitution(ctx.institutionId, ctx.session.authUserId),
    getEnabledUiLanguages(ctx.institutionId, ctx.session.authUserId),
    getEnabledModuleCodes(ctx.institutionId, ctx.session.authUserId),
    getTranslations("nav"),
    getLocale(),
    listMyNotifications(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUnreadNotificationCount(ctx.institutionId, ctx.session.authUserId, ctx.userId),
  ]);

  // Design refresh (see globals.css): the app now uses one fixed brand
  // palette everywhere instead of a per-institution colour — no more
  // per-tenant CSS variable override here.
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)] md:flex-row">
      <ResponsiveSidebar brandLabel={institution?.appName || institution?.name || "PROMPT EDU ERP"}>
        <nav className="flex flex-1 flex-col gap-1 text-sm">
          <Link href="/dashboard" className={NAV_LINK}>
            {t("dashboard")}
          </Link>
          <Link href="/academic" className={NAV_LINK}>
            {t("academic")}
          </Link>
          <Link href="/students" className={NAV_LINK}>
            {t("students")}
          </Link>
          {enabledModules.has("examination") ? (
            <Link href="/examinations" className={NAV_LINK}>
              {t("examinations")}
            </Link>
          ) : null}
          {enabledModules.has("attendance") ? (
            <Link href="/attendance" className={NAV_LINK}>
              {t("attendance")}
            </Link>
          ) : null}
          <Link href="/analytics" className={NAV_LINK}>
            {t("analytics")}
          </Link>
          {enabledModules.has("skills") ? (
            <Link href="/skills" className={NAV_LINK}>
              {t("skills")}
            </Link>
          ) : null}
          {enabledModules.has("achievements") ? (
            <Link href="/achievements" className={NAV_LINK}>
              {t("achievements")}
            </Link>
          ) : null}
          <Link href="/scoring" className={NAV_LINK}>
            {t("scoring")}
          </Link>
          {enabledModules.has("library") ? (
            <Link href="/library" className={NAV_LINK}>
              {t("library")}
            </Link>
          ) : null}
          {enabledModules.has("staff") ? (
            <Link href="/staff" className={NAV_LINK}>
              {t("staff")}
            </Link>
          ) : null}
          {enabledModules.has("discipline") ? (
            <Link href="/discipline" className={NAV_LINK}>
              {t("discipline")}
            </Link>
          ) : null}
          {enabledModules.has("mentoring") ? (
            <Link href="/mentoring" className={NAV_LINK}>
              {t("mentoring")}
            </Link>
          ) : null}
          <Link href="/reports" className={NAV_LINK}>
            {t("reports")}
          </Link>
          <Link href="/import" className={NAV_LINK}>
            {t("importExport")}
          </Link>
          <Link href="/announcements" className={NAV_LINK}>
            {t("announcements")}
          </Link>
          <Link href="/storage" className={NAV_LINK}>
            {t("storage")}
          </Link>
          {can(ctx.permissions, "users.manage") || can(ctx.permissions, "roles.manage") ? (
            <Link href="/users" className={NAV_LINK}>
              {t("users")}
            </Link>
          ) : null}
          {can(ctx.permissions, "settings.manage") ? (
            <Link href="/settings" className={NAV_LINK}>
              {t("settings")}
            </Link>
          ) : null}
          {ctx.isSuperAdmin ? (
            <Link href="/super-admin" className={`${NAV_LINK} mt-2 border border-zinc-800`}>
              {t("superAdmin")}
            </Link>
          ) : null}
        </nav>

        {enabledLocales.length > 1 ? (
          <form action={setLocaleAction} className="mb-3 flex items-end gap-1">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-zinc-500">Language</label>
              <select
                name="locale"
                defaultValue={locale}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              >
                {enabledLocales.map((l) => (
                  <option key={l} value={l}>
                    {l === "ml" ? "മലയാളം" : "English"}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-md border border-zinc-700 px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
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
              <button type="submit" className="rounded-md bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">
                Exit to Super Admin console
              </button>
            </form>
          </div>
        ) : null}
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
          <div className="min-w-0 truncate text-sm font-medium text-zinc-500 dark:text-zinc-400">
            {institution?.appName || institution?.name}
          </div>
          <NotificationBell initialItems={notifications} initialUnreadCount={unreadCount} />
        </header>
        <main className="min-w-0 flex-1 bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
