import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireRequestContext } from "../../services/request-context";
import { getUserDisplayInfo } from "../../services/tenant/tenant-service";
import { getPlatformDefaultPalette } from "../../services/super-admin/super-admin-service";
import { getPalette, paletteCssVars } from "../../services/branding/palettes";
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

  const [viewer, platformDefaultPalette] = await Promise.all([
    getUserDisplayInfo(ctx.session.authUserId, ctx.userId),
    getPlatformDefaultPalette(),
  ]);
  const palette = getPalette(platformDefaultPalette);
  // §Palette-picker follow-up ("colour palette is still not working"):
  // same nonce-based CSP fix as (institution)/layout.tsx -- an inline
  // <style> tag with no `nonce` attribute is silently dropped under this
  // app's production `style-src 'self' 'nonce-<value>'` CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const navItems: NavItem[] = [
    { href: "/super-admin", label: "Institutions" },
    { href: "/super-admin/audit", label: "Platform Audit" },
    { href: "/super-admin/appearance", label: "Appearance" },
    ...(ctx.memberships.length > 0 ? [{ href: "/dashboard", label: "← Back to institution app", muted: true }] : []),
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--background)] md:flex-row">
      <style nonce={nonce} dangerouslySetInnerHTML={{ __html: `:root{${paletteCssVars(palette)}}` }} />
      <ResponsiveSidebar brandLabel="Super Admin Console">
        <NavLinks items={navItems} />
        <form action={signOutAction}>
          <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-active)] hover:text-white">
            Sign out
          </button>
        </form>
      </ResponsiveSidebar>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-2.5 sm:px-6">
          <Breadcrumb />
          {viewer ? <SignedInAs fullName={viewer.fullName} email={viewer.email} /> : null}
        </header>
        <main className="min-w-0 flex-1 bg-[var(--surface-muted)] px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
