import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRequestContext } from "../../services/request-context";
import { signOutAction } from "../(institution)/actions";
import ResponsiveSidebar from "../components/ResponsiveSidebar";

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
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <ResponsiveSidebar brandLabel="Super Admin Console" dark>
        <div className="mb-8">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">PROMPT EDU ERP</div>
          <div className="mt-1 text-sm font-semibold text-white">Super Admin Console</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 text-sm">
          <Link href="/super-admin" className="rounded-md px-3 py-2 text-zinc-200 hover:bg-zinc-800">
            Institutions
          </Link>
          <Link href="/super-admin/audit" className="rounded-md px-3 py-2 text-zinc-200 hover:bg-zinc-800">
            Platform Audit
          </Link>
          {ctx.memberships.length > 0 ? (
            <Link href="/dashboard" className="rounded-md px-3 py-2 text-zinc-400 hover:bg-zinc-800">
              ← Back to institution app
            </Link>
          ) : null}
        </nav>
        <form action={signOutAction}>
          <button type="submit" className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-800">
            Sign out
          </button>
        </form>
      </ResponsiveSidebar>
      <main className="min-w-0 flex-1 bg-zinc-50 px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
