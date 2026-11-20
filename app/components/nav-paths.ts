/**
 * §Navigation — institution URL prefix helpers for client navigation.
 *
 * An institution's pages can be reached through its own URL prefix
 * (/ics/staff — see middleware.ts, point 0), which middleware rewrites to
 * the logical route (/staff). usePathname() returns the visible URL, so the
 * sidebar and breadcrumb strip the prefix before matching routes, and put
 * it back on the links they render (a bare /staff link would still work,
 * but only through an extra redirect on every click).
 */

/** "/ics/staff/123" → "/staff/123" when `code` is "ics"; otherwise unchanged. */
export function logicalPathname(pathname: string, code?: string | null): string {
  if (!code) return pathname;
  const prefix = `/${code}`;
  if (pathname === prefix) return "/";
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return pathname;
}

/** Top-level pages middleware.ts serves under an institution prefix
 *  (its INSTITUTION_APP_PAGES); anything else (/super-admin, /api, ...)
 *  always stays unprefixed. */
const PREFIXABLE = new Set([
  "dashboard", "academic", "classes", "students", "examinations", "attendance",
  "analytics", "skills", "achievements", "scoring", "library", "staff",
  "discipline", "mentoring", "reports", "import", "announcements",
  "storage", "users", "settings", "portal", "calendar", "substitution",
  "print", "analysis", "results", "fees", "accounts", "messages",
]);

/** Adds the institution prefix to an app link when the current URL uses it. */
export function withInstitutionPrefix(href: string, currentPathname: string, code?: string | null): string {
  if (!code || !href.startsWith("/")) return href;
  const prefix = `/${code}`;
  const usesPrefix = currentPathname === prefix || currentPathname.startsWith(`${prefix}/`);
  if (!usesPrefix) return href;
  const first = href.slice(1).split(/[/?#]/)[0];
  if (!PREFIXABLE.has(first)) return href;
  return `${prefix}${href}`;
}
