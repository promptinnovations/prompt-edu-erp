"use client";

import { useState, type ReactNode } from "react";

/**
 * §Student Profile feature — the left-side tab rail from the reference
 * screenshots (Personal / Summary / Student Fees / Student Portfolio /
 * Academics). Every tab's content is already rendered server-side and
 * passed in as `children` (same order as `tabs`) — this component only
 * toggles which one is visible, so switching tabs is instant and needs no
 * extra data fetch.
 */
export default function ProfileTabs({
  tabs, initialTab, children,
}: {
  tabs: { id: string; label: string }[];
  initialTab?: string;
  children: ReactNode[];
}) {
  const [active, setActive] = useState(
    initialTab && tabs.some((t) => t.id === initialTab) ? initialTab : tabs[0]?.id
  );

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 pb-2 dark:border-zinc-800 md:w-48 md:shrink-0 md:flex-col md:gap-0.5 md:border-b-0 md:border-r md:pb-0 md:pr-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              active === t.id
                ? "bg-[var(--brand)] text-white"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {tabs.map((t, i) => (
          <div key={t.id} hidden={active !== t.id}>
            {children[i]}
          </div>
        ))}
      </div>
    </div>
  );
}
