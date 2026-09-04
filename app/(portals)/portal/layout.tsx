import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireRequestContext } from "../../../services/request-context";
import { getInstitution } from "../../../services/institution/institution-service";
import { getPlatformDefaultPalette } from "../../../services/super-admin/super-admin-service";
import { getPalette, paletteCssVars } from "../../../services/branding/palettes";
import { getUserDisplayInfo } from "../../../services/tenant/tenant-service";
import { listMyNotifications, getUnreadNotificationCount } from "../../../services/notification/notification-service";
import NotificationBell from "../../components/NotificationBell";
import SignedInAs from "../../components/SignedInAs";
import { signOutAction, exitSuperAdminViewAction, exitSamplePortalAction } from "../../(institution)/actions";
import { getOwnStudentId, getOwnParentId } from "../../../modules/portal/service";
import PortalRoleToggle from "./PortalRoleToggle";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    redirect("/login");
  }
  if (ctx.institutionBlockedReason) redirect(`/suspended?reason=${ctx.institutionBlockedReason}`);
  if (!ctx.institutionId) redirect("/login");

  const [institution, notifications, unreadCount, viewer, platformDefaultPalette, ownStudentId, ownParentId] = await Promise.all([
    getInstitution(ctx.institutionId, ctx.session.authUserId),
    listMyNotifications(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUnreadNotificationCount(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUserDisplayInfo(ctx.session.authUserId, ctx.userId),
    getPlatformDefaultPalette(),
    getOwnStudentId(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getOwnParentId(ctx.institutionId, ctx.session.authUserId, ctx.userId),
  ]);
  // Phase D §3 "on the top give toggle for switching to parent or back to
  // student" — only shown when this login resolves BOTH a student AND a
  // parent id (see modules/portal/service.ts's linkExisting*AccountTo*()
  // for how one login ends up holding both).
  const hasDualPortalAccess = Boolean(ownStudentId && ownParentId);
  const palette = getPalette(institution?.themePalette ?? platformDefaultPalette);
  // §Palette-picker follow-up ("colour palette is still not working"):
  // same nonce-based CSP fix as (institution)/layout.tsx -- an inline
  // <style> tag with no `nonce` attribute is silently dropped under this
  // app's production `style-src 'self' 'nonce-<value>'` CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // Design refresh (see globals.css): one fixed brand palette everywhere —
  // no more per-institution CSS variable override here.
  //
  // "Separate apps for each institution ... only their thing should be
  // highlighted" follow-up: the header now shows only the institution's own
  // name/logo, nothing else — "PROMPT EDU ERP" branding moved down to a
  // small credit line in the page footer instead.
  return (
    <div className="flex min-h-full flex-col bg-[var(--background)]">
      <style nonce={nonce} dangerouslySetInnerHTML={{ __html: `:root{${paletteCssVars(palette)}}` }} />
      {ctx.viewingInstitutionAsSuperAdmin ? (
        <div className="flex flex-col items-start gap-1 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-1.5 text-sm text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            {ctx.viewingAsUser ? (
              <>
                Sample Portal — viewing <strong>{institution?.name}</strong> as <strong>{ctx.viewingAsUser.roleLabel}</strong>{" "}
                (<strong>{ctx.viewingAsUser.fullName}</strong>&apos;s real account) — every action here is fully real.
              </>
            ) : (
              <>
                Viewing <strong>{institution?.name}</strong> as Super Admin — every action here is fully real.
              </>
            )}
          </span>
          <div className="flex shrink-0 gap-2">
            {ctx.viewingAsUser ? (
              <form action={exitSamplePortalAction}>
                <button type="submit" className="rounded-lg bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">
                  Exit sample portal
                </button>
              </form>
            ) : null}
            <form action={exitSuperAdminViewAction}>
              <button type="submit" className="rounded-lg bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">
                Exit to Super Admin console
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] text-xs font-bold text-white">
            {(institution?.appName || institution?.name || "P").trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)]">
            {institution?.appName || institution?.name}
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {hasDualPortalAccess ? <PortalRoleToggle /> : null}
          {viewer ? <SignedInAs fullName={viewer.fullName} email={viewer.email} /> : null}
          <NotificationBell initialItems={notifications} initialUnreadCount={unreadCount} />
          <form action={signOutAction}>
            <button type="submit" className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-[var(--surface-muted)] sm:px-3">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="py-4 text-center text-[10px] uppercase tracking-wide text-zinc-400">
        PROMPT EDU ERP · Prompt Innovations
      </footer>
    </div>
  );
}
