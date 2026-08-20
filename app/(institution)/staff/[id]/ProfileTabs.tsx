"use client";

import { useState, type ReactNode } from "react";

/**
 * §Teacher-Profile feature — same tab-rail shape as students'
 * ProfileTabs.tsx (app/(institution)/students/[id]/ProfileTabs.tsx),
 * duplicated rather than shared across the two unrelated feature folders
 * (same per-feature colocation convention this codebase already uses for
 * its small form building blocks). Every tab's content is already
 * server-rendered and passed in as `children` — this only toggles which is
 * visible.
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
