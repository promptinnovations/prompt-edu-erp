"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

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
 * the light/dark ThemeToggle live in the rail itself.
 *
 * Deliberately takes the existing aside content as `children` (a Server
 * Component can pass already-rendered JSX into a Client Component this
 * way) rather than re-implementing the nav here, so every permission-gated
 * <Link> in the two layouts stays exactly where it was written.
 */
export default function ResponsiveSidebar({
  brandLabel,
  children,
}: {
  brandLabel: string;
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

  return (
    <>
      <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-white md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="shrink-0 rounded-lg p-2 hover:bg-zinc-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        </button>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-xs font-bold">
          {logoLetter}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{brandLabel}</span>
        <ThemeToggle compact />
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-950 px-4 py-6 text-zinc-100 shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:static md:z-auto md:w-60 md:translate-x-0 md:shadow-none md:transition-none`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="mb-2 self-end rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-6 hidden items-center gap-2.5 md:flex">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-violet-900/40">
            {logoLetter}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{brandLabel}</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Prompt Innovations</div>
          </div>
        </div>

        {children}

        <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-4">
          <span className="text-[11px] text-zinc-600">Appearance</span>
          <ThemeToggle compact />
        </div>
      </aside>
    </>
  );
}
