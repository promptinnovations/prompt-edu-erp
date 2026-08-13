import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRequestContext } from "../../services/request-context";
import { signOutAction } from "../(institution)/actions";
import ResponsiveSidebar from "../components/ResponsiveSidebar";

const NAV_LINK = "rounded-lg px-3 py-2 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    redirect("/login");
  }
  // §B.4: a separate, explicitly-isolated route group — this check is the
  // UI-layer half of a defense-in-depth pair with
  // services/super-admin/super-admin-service.ts's own independent
  // re-verification on every call (see that file's header comment).
  if (!ctx.isSuperAdmin) redirect("/dashboard");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)] md:flex-row">
      <ResponsiveSidebar brandLabel="Super Admin Console">
        <nav className="flex flex-1 flex-col gap-1 text-sm">
          <Link href="/super-admin" className={NAV_LINK}>
            Institutions
          </Link>
          <Link href="/super-admin/audit" className={NAV_LINK}>
            Platform Audit
          </Link>
          {ctx.memberships.length > 0 ? (
            <Link href="/dashboard" className={`${NAV_LINK} text-zinc-500`}>
              ← Back to institution app
            </Link>
          ) : null}
        </nav>
        <form action={signOutAction}>
          <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white">
            Sign out
          </button>
        </form>
      </ResponsiveSidebar>
      <main className="min-w-0 flex-1 bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
