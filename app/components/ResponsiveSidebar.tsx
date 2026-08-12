"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Off-canvas sidebar shell shared by (institution)/layout.tsx and
 * (super-admin)/layout.tsx — both had a fixed w-56 <aside> that was never
 * usable on a phone (the whole nav ate the screen, per the mobile
 * screenshot that prompted this). Below the `md` breakpoint this renders a
 * slim top bar with a hamburger button; tapping it slides the SAME <aside>
 * content in as a full-height drawer with a backdrop. At `md` and above it
 * reverts to exactly the original always-visible column — no behaviour
 * change for desktop users.
 *
 * Deliberately takes the existing aside content as `children` (a Server
 * Component can pass already-rendered JSX into a Client Component this
 * way) rather than re-implementing the nav here, so every permission-gated
 * <Link> in the two layouts stays exactly where it was written.
 */
export default function ResponsiveSidebar({
  brandLabel,
  dark = false,
  children,
}: {
  brandLabel: string;
  dark?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer automatically after navigating — otherwise the next
  // page loads with the menu still covering the screen.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <div
        className={`flex items-center gap-3 border-b px-4 py-3 md:hidden ${
          dark ? "border-zinc-800 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className={`shrink-0 rounded-md p-2 ${dark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{brandLabel}</span>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto px-4 py-6 shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:static md:z-auto md:w-56 md:translate-x-0 md:shadow-none md:transition-none ${
          dark ? "bg-zinc-900 text-zinc-100" : "border-r border-zinc-200 bg-white"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className={`mb-2 self-end rounded-md p-1.5 md:hidden ${dark ? "text-zinc-300 hover:bg-zinc-800" : "text-zinc-500 hover:bg-zinc-100"}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
        {children}
      </aside>
    </>
  );
}
