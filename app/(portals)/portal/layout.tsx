import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireRequestContext } from "../../../services/request-context";
import { getInstitution } from "../../../services/institution/institution-service";
import { getPlatformDefaultPalette } from "../../../services/super-admin/super-admin-service";
import { getPalette, paletteCssVars } from "../../../services/branding/palettes";
import { getUserDisplayInfo } from "../../../services/tenant/tenant-service";
import { listMyNotifications, getUnreadNotificationCount } from "../../../services/notification/notification-service";
import { getStudent } from "../../../modules/students/service";
import NotificationBell from "../../components/NotificationBell";
import SignedInAs from "../../components/SignedInAs";
import ResponsiveSidebar from "../../components/ResponsiveSidebar";
import NavLinks, { type NavItem } from "../../components/NavLinks";
import { signOutAction, exitSuperAdminViewAction, exitSamplePortalAction } from "../../(institution)/actions";
import { getOwnStudentId, getOwnParentId } from "../../../modules/portal/service";
import PortalRoleToggle from "./PortalRoleToggle";

const STUDENT_NAV_ITEMS: NavItem[] = [
  { href: "/portal/student", label: "Dashboard" },
  { href: "/portal/student/portfolio", label: "Portfolio" },
  { href: "/portal/student/exams", label: "Exam performance" },
  { href: "/portal/student/library", label: "Library & reading" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    redirect("/login");
  }
  if (ctx.institutionBlockedReason) redirect(`/suspended?reason=${ctx.institutionBlockedReason}`);
  if (!ctx.institutionId) redirect("/login");

  // §student-portal redesign "in the side panel you can give option for
  // adding all of them from student side" — the sidebar only appears on
  // /portal/student/* routes (institution-code prefix already stripped by
  // middleware.ts, same x-pathname header services/request-context.ts
  // reads); the parent side keeps its existing single-column layout
  // unchanged, out of scope for this redesign.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isStudentSide = pathname.startsWith("/portal/student");

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
  // for how one login ends up holding both). A plain student-only account
  // (the common case) never gets this toggle by design — there's no
  // parent record for it to switch to.
  const hasDualPortalAccess = Boolean(ownStudentId && ownParentId);

  // §student-portal redesign "photo of the student is not seen" — sidebar
  // profile block, student side only. getStudent() (not the heavier
  // getStudent360()) already selects photo_file_id (see students/[id]
  // page's PhotoForm for the same /api/files/{id} pattern).
  const ownStudentProfile = isStudentSide && ownStudentId
    ? await getStudent(ctx.institutionId, ctx.session.authUserId, ownStudentId)
    : null;

  const palette = getPalette(institution?.themePalette ?? platformDefaultPalette);
  // §Palette-picker follow-up ("colour palette is still not working"):
  // same nonce-based CSP fix as (institution)/layout.tsx -- an inline
  // <style> tag with no `nonce` attribute is silently dropped under this
  // app's production `style-src 'self' 'nonce-<value>'` CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const banner = ctx.viewingInstitutionAsSuperAdmin ? (
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
  ) : null;

  const header = (
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
  );

  const footer = (
    <footer className="py-4 text-center text-[10px] uppercase tracking-wide text-zinc-400">
      PROMPT EDU ERP · Prompt Innovations
    </footer>
  );

  // "Separate apps for each institution ... only their thing should be
  // highlighted" follow-up: the header now shows only the institution's own
  // name/logo, nothing else — "PROMPT EDU ERP" branding moved down to a
  // small credit line in the page footer instead.
  if (!isStudentSide) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)]">
        <style nonce={nonce} dangerouslySetInnerHTML={{ __html: `:root{${paletteCssVars(palette)}}` }} />
        {banner}
        {header}
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        {footer}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)]">
      <style nonce={nonce} dangerouslySetInnerHTML={{ __html: `:root{${paletteCssVars(palette)}}` }} />
      {banner}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <ResponsiveSidebar brandLabel={institution?.appName || institution?.name || "PROMPT EDU ERP"}>
          {ownStudentProfile ? (
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--sidebar-active)]/30 p-3">
              {ownStudentProfile.photo_file_id ? (
                // eslint-disable-next-line @next/next/no-img-element -- served from our own /api/files route
                <img
                  src={`/api/files/${ownStudentProfile.photo_file_id}`}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white/20"
                />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-teal)] text-sm font-bold text-white">
                  {ownStudentProfile.full_name.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--sidebar-text)]">{ownStudentProfile.full_name}</div>
                <div className="truncate text-xs text-[var(--sidebar-text-muted)]">Adm. no. {ownStudentProfile.admission_number}</div>
              </div>
            </div>
          ) : null}
          <NavLinks items={STUDENT_NAV_ITEMS} />
        </ResponsiveSidebar>
        <div className="flex min-w-0 flex-1 flex-col">
          {header}
          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          {footer}
        </div>
      </div>
    </div>
  );
}
