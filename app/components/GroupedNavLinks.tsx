"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavLeaf = { href: string; label: string };
// `icon` is a pre-rendered ReactNode (e.g. `<DashboardIcon className="..." />`),
// NOT a component reference — this is a "use client" component, and a Server
// Component (the institution/super-admin layouts) cannot pass a bare function
// across the server/client boundary (React: "Functions cannot be passed
// directly to Client Components"). Passing an already-rendered element is
// fine because by serialization time it's resolved down to plain SVG/DOM
// elements, which ARE serializable.
export type NavEntry =
  | { kind: "link"; href: string; label: string; icon: ReactNode }
  | { kind: "group"; label: string; icon: ReactNode; items: NavLeaf[] };

/**
 * Sidebar nav shared by (institution)/layout.tsx and (super-admin)/
 * layout.tsx. Replaces the old flat NavLinks.tsx.
 *
 * "Only main items should be seen in bold, sub items will be inside that,
 * if clicked on the main item, the sub items will be shown" follow-up,
 * refined further per "no arrow marks, just add main titles with symbols
 * the same way you gave Analysis, print center etc." — a `kind: "group"`
 * entry renders with the EXACT same row style as a `kind: "link"` entry
 * (icon + label, no chevron/expand indicator); clicking it toggles that ONE
 * group's sub-item list open/closed (every other group stays exactly as it
 * was — this is per-group state, not an accordion that forces others shut,
 * since an admin often has 2-3 groups open at once while working). A
 * `kind: "link"` entry (Dashboard, Analysis, Print Center — items with no
 * natural sub-grouping) renders the same icon+label style but navigates
 * directly.
 *
 * The group containing the current route starts expanded on first render
 * (derived once from `items`+pathname at mount, not re-derived on every
 * pathname change — otherwise navigating between two sub-items of the SAME
 * group would flicker other manually-opened groups shut).
 */
export default function GroupedNavLinks({ items }: { items: NavEntry[] }) {
  const pathname = usePathname();
  const isLeafActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const entry of items) {
      if (entry.kind === "group" && entry.items.some((i) => isLeafActive(i.href))) {
        initial.add(entry.label);
      }
    }
    return initial;
  });

  const toggle = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // One shared row style for every main item — link or group, active or
  // not — so a group header (e.g. "Attendance") looks exactly like a plain
  // link (e.g. "Print Center"): icon + label, same weight/size/padding, no
  // chevron or other expand affordance to tell them apart at rest.
  const rowClass = (active: boolean) =>
    [
      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-medium transition-colors",
      active
        ? "bg-[var(--sidebar-active)] text-white"
        : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-active)]/60",
    ].join(" ");

  return (
    <nav className="flex flex-1 flex-col gap-0.5 text-sm">
      {items.map((entry) => {
        if (entry.kind === "link") {
          const active = isLeafActive(entry.href);
          return (
            <Link key={entry.href} href={entry.href} aria-current={active ? "page" : undefined} className={rowClass(active)}>
              {entry.icon}
              <span className="min-w-0 truncate">{entry.label}</span>
            </Link>
          );
        }

        const open = openGroups.has(entry.label);
        const groupHasActive = entry.items.some((i) => isLeafActive(i.href));

        return (
          <div key={entry.label}>
            <button
              type="button"
              onClick={() => toggle(entry.label)}
              aria-expanded={open}
              className={rowClass(groupHasActive && !open)}
            >
              {entry.icon}
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            </button>
            {open ? (
              <div className="ml-[26px] flex flex-col gap-0.5 border-l border-[var(--sidebar-border)] py-1 pl-3">
                {entry.items.map((item) => {
                  const active = isLeafActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                        active
                          ? "bg-[var(--sidebar-active)] font-medium text-white"
                          : "text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-active)]/50 hover:text-[var(--sidebar-text)]",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
