"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; separated?: boolean; muted?: boolean };

/**
 * Sidebar nav list shared by (institution)/layout.tsx and
 * (super-admin)/layout.tsx. Split out as its own Client Component purely so
 * it can call usePathname() for active-page highlighting — the parent
 * layouts stay Server Components and just build a plain {href,label}[]
 * array (permission/module gating happens there, unchanged).
 */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 text-sm">
      {items.map((item) => {
        // Longest matching href wins, so a parent entry ("/portal/student",
        // the dashboard) isn't also highlighted on every child page.
        const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
        const active = matches(item.href)
          && !items.some((o) => o.href.length > item.href.length && o.href.startsWith(`${item.href}/`) && matches(o.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "relative rounded-lg px-3 py-2 pl-4 transition-colors",
              item.separated ? "mt-2 border border-zinc-800" : "",
              active
                ? "bg-white/10 font-medium text-white before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-accent-500"
                : item.muted
                  ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
