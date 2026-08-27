"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Off-canvas sidebar shell shared by (institution)/layout.tsx and
 * (super-admin)/layout.tsx. Below the `md` breakpoint this renders a slim
 * top bar with a hamburger button; tapping it slides the SAME <aside>
 * content in as a full-height drawer with a backdrop. At `md` and above it
 * reverts to an always-visible column.
 *
 * Design refresh: the rail is now always a dark, slightly-gradient navy
 * surface (independent of the app-wide light/dark content toggle) — the
 * same "nav stays dark, content area can be either" pattern used by most
 * modern dashboards (Vercel, Linear, Discord). A gradient logo badge and
 * A gradient logo badge lives in the rail itself.
 *
 * "Separate apps for each institution ... only their thing should be
 * highlighted" follow-up: the institution's own name/logo is the only
 * identity shown at the top of the rail now — "Prompt Innovations" /
 * "PROMPT EDU ERP" moved out of that prominent spot entirely, down to a
 * single small credit line at the very bottom of the rail (see footer
 * below `children`), the same way a white-labelled product would credit
 * its underlying platform.
 *
 * Deliberately takes the existing aside content as `children` (a Server
 * Component can pass already-rendered JSX into a Client Component this
 * way) rather than re-implementing the nav here, so every permission-gated
 * <Link> in the two layouts stays exactly where it was written.
 */
export default function ResponsiveSidebar({
  brandLabel,
  logoUrl,
  children,
}: {
  brandLabel: string;
  /** "Can I add institution logo?" follow-up — /api/institution-logo/<code>
   *  when the institution has uploaded one, else null to keep the existing
   *  generated letter badge exactly as before. */
  logoUrl?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer automatically after navigating — otherwise the next
  // page loads with the menu still covering the screen.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const logoLetter = brandLabel.trim().charAt(0).toUpperCase() || "P";
  const badge = (className: string) =>
    logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- dynamic per-institution URL
      <img src={logoUrl} alt="" className={`${className} object-contain bg-white`} />
    ) : (
      <span className={`${className} bg-[var(--accent-teal)] font-bold text-white`}>{logoLetter}</span>
    );

  return (
    <>
      <div
        data-app-shell
        className="flex items-center gap-3 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] px-4 py-3 text-white md:hidden"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="shrink-0 rounded-lg p-2 hover:bg-[var(--sidebar-active)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        </button>
        {badge("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs")}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{brandLabel}</span>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        data-app-shell
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-[var(--sidebar-border)] bg-gradient-to-b from-[var(--sidebar-bg-2)] to-[var(--sidebar-bg)] px-4 py-6 shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:static md:z-auto md:w-64 md:translate-x-0 md:shadow-none md:transition-none`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="mb-2 self-end rounded-lg p-1.5 text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-active)] md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-6 hidden items-center gap-2.5 md:flex">
          {badge("flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm shadow-lg shadow-black/20")}
          <div className="min-w-0 truncate text-base font-semibold text-white">{brandLabel}</div>
        </div>

        {children}

        <div className="mt-4 truncate border-t border-[var(--sidebar-border)] pt-4 text-center text-[10px] uppercase tracking-wide text-[var(--sidebar-text-muted)]">
          PROMPT EDU ERP · Prompt Innovations
        </div>
      </aside>
    </>
  );
}
