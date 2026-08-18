import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { getInstitution } from "../../../services/institution/institution-service";
import { getUserDisplayInfo } from "../../../services/tenant/tenant-service";
import { listMyNotifications, getUnreadNotificationCount } from "../../../services/notification/notification-service";
import NotificationBell from "../../components/NotificationBell";
import ThemeToggle from "../../components/ThemeToggle";
import SignedInAs from "../../components/SignedInAs";
import { signOutAction } from "../../(institution)/actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    redirect("/login");
  }
  if (ctx.institutionBlockedReason) redirect(`/suspended?reason=${ctx.institutionBlockedReason}`);
  if (!ctx.institutionId) redirect("/login");

  const [institution, notifications, unreadCount, viewer] = await Promise.all([
    getInstitution(ctx.institutionId, ctx.session.authUserId),
    listMyNotifications(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUnreadNotificationCount(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUserDisplayInfo(ctx.session.authUserId, ctx.userId),
  ]);

  // Design refresh (see globals.css): one fixed brand palette everywhere —
  // no more per-institution CSS variable override here.
  //
  // "Separate apps for each institution ... only their thing should be
  // highlighted" follow-up: the header now shows only the institution's own
  // name/logo, nothing else — "PROMPT EDU ERP" branding moved down to a
  // small credit line in the page footer instead.
  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-xs font-bold text-white">
            {(institution?.appName || institution?.name || "P").trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {institution?.appName || institution?.name}
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {viewer ? <SignedInAs fullName={viewer.fullName} email={viewer.email} /> : null}
          <ThemeToggle />
          <NotificationBell initialItems={notifications} initialUnreadCount={unreadCount} />
          <form action={signOutAction}>
            <button type="submit" className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 sm:px-3">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="py-4 text-center text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
        PROMPT EDU ERP · Prompt Innovations
      </footer>
    </div>
  );
}
