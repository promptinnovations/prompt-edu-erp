"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logicalPathname, withInstitutionPrefix } from "./nav-paths";

/** `match`: extra path prefixes whose sub-pages also belong to this item
 *  (e.g. "Student profiles" for /students/<id>). */
export type NavLeaf = { href: string; label: string; match?: string[] };
// `icon` is a pre-rendered ReactNode (e.g. `<DashboardIcon className="..." />`),
// NOT a component reference — this is a "use client" component, and a Server
// Component (the institution/super-admin layouts) cannot pass a bare function
// across the server/client boundary (React: "Functions cannot be passed
// directly to Client Components"). Passing an already-rendered element is
// fine because by serialization time it's resolved down to plain SVG/DOM
// elements, which ARE serializable.
//
// §Navigation: `heading` is a small section title ("Academics", "People",
// ...) that groups the entries after it; a heading with nothing under it
// (every entry permission-gated away) is not shown.
export type NavEntry =
  | { kind: "link"; href: string; label: string; icon: ReactNode }
  | { kind: "group"; label: string; icon: ReactNode; items: NavLeaf[] }
  | { kind: "heading"; label: string };

/** Splits "/attendance?tab=x#leave" into its parts. */
function parseHref(href: string) {
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const noHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const queryAt = noHash.indexOf("?");
  return { path: queryAt >= 0 ? noHash.slice(0, queryAt) : noHash, query: queryAt >= 0 ? noHash.slice(queryAt) : "", hash };
}

/**
 * Sidebar nav shared by (institution)/layout.tsx and (super-admin)/
 * layout.tsx. Replaces the old flat NavLinks.tsx.
 *
 * Main items (icon + label, no arrow marks — "just add main titles with
 * symbols") are either plain links or groups; clicking a group toggles its
 * own sub-item list (per-group state, several can be open at once).
 *
 * §Navigation ("check the navigation of the app — give a proper
 * navigation"):
 *  - exactly ONE item is highlighted — the best match for the current page
 *    (longest matching path, then the matching #section / ?tab). Before,
 *    pages reached through an institution URL (/ics/staff) highlighted
 *    nothing, and pages shared by two items (/results, /analysis)
 *    highlighted both;
 *  - the group holding the current page opens itself whenever you arrive
 *    on a page in it, not only on the first load;
 *  - links keep the institution's URL prefix (/ics/...), so a click no
 *    longer goes through an extra redirect;
 *  - "Find a page" filters every item and sub-item by name;
 *  - optional section headings group the long list.
 */
export default function GroupedNavLinks({ items, institutionCode }: { items: NavEntry[]; institutionCode?: string | null }) {
  const rawPathname = usePathname();
  const pathname = logicalPathname(rawPathname, institutionCode);
  const href = (h: string) => withInstitutionPrefix(h, rawPathname, institutionCode);

  // The URL's #section and ?query aren't part of usePathname(); read them
  // from the browser after every navigation / hash jump.
  const [loc, setLoc] = useState({ hash: "", search: "" });
  useEffect(() => {
    const read = () => setLoc({ hash: window.location.hash, search: window.location.search });
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [rawPathname]);

  // One best match across every link and sub-item.
  const activeKey = useMemo(() => {
    let best: { key: string; score: number } | null = null;
    const consider = (key: string, h: string, match: string[] = [], bonus = 0) => {
      const { path, query, hash } = parseHref(h);
      const alias = match.filter((m) => pathname.startsWith(`${m}/`)).sort((a, b) => b.length - a.length)[0];
      if (!(pathname === path || pathname.startsWith(`${path}/`))) {
        // Sub-page of an alias prefix: ranks like a match on that prefix.
        if (alias && (!best || alias.length * 10 + bonus > best.score)) best = { key, score: alias.length * 10 + bonus };
        return;
      }
      let score = path.length * 10 + (pathname === path ? 5 : 0) + bonus;
      if (hash) score += hash === loc.hash ? 4 : -1;
      if (query) {
        // "?view=report-cards" also matches a page under it
        // (/results/<exam>/report-cards/...), not only the picker itself.
        const values = [...new URLSearchParams(query).values()];
        const matches = loc.search.includes(query.slice(1)) || values.some((v) => pathname.split("/").includes(v));
        score += matches ? 4 : -2;
      }
      if (!best || score > best.score) best = { key, score };
    };
    for (const entry of items) {
      // A top-level link wins a tie with a sub-item to the same page
      // (/analysis is both "Analysis" and Mentoring › "Pattern analysis").
      if (entry.kind === "link") consider(`link:${entry.href}`, entry.href, [], 1);
      else if (entry.kind === "group") entry.items.forEach((i, n) => consider(`${entry.label}:${n}`, i.href, i.match));
    }
    return (best as { key: string } | null)?.key ?? null;
  }, [items, pathname, loc]);
  const activeGroup = activeKey && !activeKey.startsWith("link:") ? activeKey.slice(0, activeKey.lastIndexOf(":")) : null;

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : []));
  useEffect(() => {
    if (activeGroup) setOpenGroups((prev) => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
  }, [activeGroup]);

  const toggle = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // One shared row style for every main item — link or group.
  const rowClass = (active: boolean) =>
    [
      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-medium transition-colors",
      active
        ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)] [&_svg]:text-[var(--sidebar-active-text)]"
        : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-active)]/60",
    ].join(" ");

  const leafClass = (active: boolean) =>
    [
      "block rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
      active
        ? "bg-[var(--sidebar-active)] font-medium text-[var(--sidebar-active-text)]"
        : "text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-active)]/50 hover:text-[var(--sidebar-text)]",
    ].join(" ");

  // Headings are shown only when at least one entry follows before the next heading.
  const visible = items.filter((entry, i) => {
    if (entry.kind !== "heading") return true;
    const next = items[i + 1];
    return Boolean(next) && next.kind !== "heading";
  });

  const searchBox = (
    <div className="mb-2">
      <label htmlFor="nav-find" className="sr-only">Find a page</label>
      <input
        id="nav-find"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a page…"
        autoComplete="off"
        className="w-full rounded-lg border border-[var(--sidebar-border)] bg-transparent px-3 py-1.5 text-sm text-[var(--sidebar-text)] placeholder:text-[var(--sidebar-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)]"
      />
    </div>
  );

  if (q) {
    const hits: Array<{ key: string; href: string; label: string; context: string | null }> = [];
    for (const entry of items) {
      if (entry.kind === "link" && entry.label.toLowerCase().includes(q)) {
        hits.push({ key: `link:${entry.href}`, href: entry.href, label: entry.label, context: null });
      } else if (entry.kind === "group") {
        const groupHit = entry.label.toLowerCase().includes(q);
        entry.items.forEach((leaf, n) => {
          if (groupHit || leaf.label.toLowerCase().includes(q)) {
            hits.push({ key: `${entry.label}:${n}`, href: leaf.href, label: leaf.label, context: entry.label });
          }
        });
      }
    }
    return (
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 text-sm">
        {searchBox}
        {hits.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--sidebar-text-muted)]">No page matches “{query}”.</p>
        ) : (
          hits.map((h) => (
            <Link key={h.key} href={href(h.href)} onClick={() => setQuery("")} aria-current={h.key === activeKey ? "page" : undefined} className={leafClass(h.key === activeKey)}>
              {h.context ? <span className="block text-[11px] text-[var(--sidebar-text-muted)]">{h.context}</span> : null}
              {h.label}
            </Link>
          ))
        )}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 text-sm">
      {searchBox}
      {visible.map((entry, i) => {
        if (entry.kind === "heading") {
          return (
            <div key={`h:${entry.label}`} className={`${i === 0 ? "" : "mt-3"} px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--sidebar-text-muted)]`}>
              {entry.label}
            </div>
          );
        }

        if (entry.kind === "link") {
          const active = activeKey === `link:${entry.href}`;
          return (
            <Link key={`link:${entry.href}`} href={href(entry.href)} aria-current={active ? "page" : undefined} className={rowClass(active)}>
              {entry.icon}
              <span className="min-w-0 truncate">{entry.label}</span>
            </Link>
          );
        }

        const open = openGroups.has(entry.label);
        const groupHasActive = activeGroup === entry.label;

        return (
          <div key={`g:${entry.label}`}>
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
                {entry.items.map((item, n) => {
                  const active = activeKey === `${entry.label}:${n}`;
                  return (
                    <Link key={`${entry.label}:${n}`} href={href(item.href)} aria-current={active ? "page" : undefined} className={leafClass(active)}>
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
