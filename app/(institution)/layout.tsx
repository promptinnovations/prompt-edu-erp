import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireRequestContext } from "../../services/request-context";
import { getInstitution, getEnabledUiLanguages, getBrandColors } from "../../services/institution/institution-service";
import { getEnabledModuleCodes } from "../../services/modules/module-service";
import { getRoleCodesForUser, can } from "../../services/permissions/permission-service";
import { resolvePortalDestination } from "../../modules/portal/service";
import { listMyNotifications, getUnreadNotificationCount } from "../../services/notification/notification-service";
import NotificationBell from "../components/NotificationBell";
import ResponsiveSidebar from "../components/ResponsiveSidebar";
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

  const [institution, enabledLocales, enabledModules, t, locale, notifications, unreadCount] = await Promise.all([
    getInstitution(ctx.institutionId, ctx.session.authUserId),
    getEnabledUiLanguages(ctx.institutionId, ctx.session.authUserId),
    getEnabledModuleCodes(ctx.institutionId, ctx.session.authUserId),
    getTranslations("nav"),
    getLocale(),
    listMyNotifications(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUnreadNotificationCount(ctx.institutionId, ctx.session.authUserId, ctx.userId),
  ]);

  const { brand, brandHover } = getBrandColors(institution?.primaryColor ?? null);

  return (
    <div
      className="flex min-h-full flex-1 flex-col md:flex-row"
      style={{ "--brand": brand, "--brand-hover": brandHover } as React.CSSProperties}
    >
      <ResponsiveSidebar brandLabel={institution?.appName || institution?.name || "PROMPT EDU ERP"}>
        <div className="mb-8">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">PROMPT EDU ERP</div>
          <div className="mt-1 truncate text-sm font-semibold text-zinc-900">
            {institution?.appName || institution?.name}
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 text-sm">
          <Link href="/dashboard" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
            {t("dashboard")}
          </Link>
          <Link href="/academic" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
            {t("academic")}
          </Link>
          <Link href="/students" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
            {t("students")}
          </Link>
          {enabledModules.has("examination") ? (
            <Link href="/examinations" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("examinations")}
            </Link>
          ) : null}
          {enabledModules.has("attendance") ? (
            <Link href="/attendance" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("attendance")}
            </Link>
          ) : null}
          <Link href="/analytics" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
            {t("analytics")}
          </Link>
          {enabledModules.has("skills") ? (
            <Link href="/skills" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("skills")}
            </Link>
          ) : null}
          {enabledModules.has("achievements") ? (
            <Link href="/achievements" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("achievements")}
            </Link>
          ) : null}
          <Link href="/scoring" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
            {t("scoring")}
          </Link>
          {enabledModules.has("library") ? (
            <Link href="/library" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("library")}
            </Link>
          ) : null}
          {enabledModules.has("staff") ? (
            <Link href="/staff" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("staff")}
            </Link>
          ) : null}
          {enabledModules.has("discipline") ? (
            <Link href="/discipline" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("discipline")}
            </Link>
          ) : null}
          {enabledModules.has("mentoring") ? (
            <Link href="/mentoring" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("mentoring")}
            </Link>
          ) : null}
          <Link href="/reports" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
            {t("reports")}
          </Link>
          <Link href="/import" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
            {t("importExport")}
          </Link>
          <Link href="/announcements" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
            {t("announcements")}
          </Link>
          <Link href="/storage" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
            {t("storage")}
          </Link>
          {can(ctx.permissions, "users.manage") || can(ctx.permissions, "roles.manage") ? (
            <Link href="/users" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("users")}
            </Link>
          ) : null}
          {can(ctx.permissions, "settings.manage") ? (
            <Link href="/settings" className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("settings")}
            </Link>
          ) : null}
          {ctx.isSuperAdmin ? (
            <Link href="/super-admin" className="mt-2 rounded-md border border-zinc-200 px-3 py-2 text-zinc-700 hover:bg-zinc-100">
              {t("superAdmin")}
            </Link>
          ) : null}
        </nav>

        {enabledLocales.length > 1 ? (
          <form action={setLocaleAction} className="mb-3 flex items-end gap-1">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-zinc-400">Language</label>
              <select
                name="locale"
                defaultValue={locale}
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {enabledLocales.map((l) => (
                  <option key={l} value={l}>
                    {l === "ml" ? "മലയാളം" : "English"}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
              Go
            </button>
          </form>
        ) : null}

        <form action={signOutAction}>
          <button type="submit" className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100">
            {t("signOut")}
          </button>
        </form>
      </ResponsiveSidebar>
      <div className="flex min-w-0 flex-1 flex-col">
        {ctx.viewingInstitutionAsSuperAdmin ? (
          <div className="flex flex-col items-start gap-1 bg-amber-500 px-4 py-1.5 text-sm text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
        <header className="flex items-center justify-end border-b border-zinc-200 bg-white px-4 py-2 sm:px-6">
          <NotificationBell initialItems={notifications} initialUnreadCount={unreadCount} />
        </header>
        <main className="min-w-0 flex-1 bg-zinc-50 px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
