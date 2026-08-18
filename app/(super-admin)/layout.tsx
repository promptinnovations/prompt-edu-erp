import { redirect } from "next/navigation";
import { requireRequestContext } from "../../services/request-context";
import { getUserDisplayInfo } from "../../services/tenant/tenant-service";
import { signOutAction } from "../(institution)/actions";
import ResponsiveSidebar from "../components/ResponsiveSidebar";
import NavLinks, { type NavItem } from "../components/NavLinks";
import Breadcrumb from "../components/Breadcrumb";
import SignedInAs from "../components/SignedInAs";

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

  const viewer = await getUserDisplayInfo(ctx.session.authUserId, ctx.userId);

  const navItems: NavItem[] = [
    { href: "/super-admin", label: "Institutions" },
    { href: "/super-admin/audit", label: "Platform Audit" },
    ...(ctx.memberships.length > 0 ? [{ href: "/dashboard", label: "← Back to institution app", muted: true }] : []),
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)] md:flex-row">
      <ResponsiveSidebar brandLabel="Super Admin Console">
        <NavLinks items={navItems} />
        <form action={signOutAction}>
          <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white">
            Sign out
          </button>
        </form>
      </ResponsiveSidebar>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
          <Breadcrumb />
          {viewer ? <SignedInAs fullName={viewer.fullName} email={viewer.email} /> : null}
        </header>
        <main className="min-w-0 flex-1 bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
