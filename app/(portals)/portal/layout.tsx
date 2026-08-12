import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { getInstitution, getBrandColors } from "../../../services/institution/institution-service";
import { listMyNotifications, getUnreadNotificationCount } from "../../../services/notification/notification-service";
import NotificationBell from "../../components/NotificationBell";
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

  const [institution, notifications, unreadCount] = await Promise.all([
    getInstitution(ctx.institutionId, ctx.session.authUserId),
    listMyNotifications(ctx.institutionId, ctx.session.authUserId, ctx.userId),
    getUnreadNotificationCount(ctx.institutionId, ctx.session.authUserId, ctx.userId),
  ]);

  const { brand, brandHover } = getBrandColors(institution?.primaryColor ?? null);

  return (
    <div className="min-h-full bg-zinc-50" style={{ "--brand": brand, "--brand-hover": brandHover } as React.CSSProperties}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">PROMPT EDU ERP — Portal</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900">{institution?.appName || institution?.name}</div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationBell initialItems={notifications} initialUnreadCount={unreadCount} />
          <form action={signOutAction}>
            <button type="submit" className="rounded-md px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 sm:px-3">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
