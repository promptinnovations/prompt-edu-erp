/**
 * PROMPT EDU ERP — every top-level path segment the app itself already
 * owns, so an institution's short code (used both in its shareable
 * /<code> URL and as its own real /<code>/... route prefix — see
 * middleware.ts) can never collide with a real route. Standalone module
 * (no db/auth imports) so middleware.ts (Edge runtime) can import it
 * directly alongside services/super-admin/super-admin-service.ts (Node
 * runtime, DB-backed), which re-exports it for institutionCodeSchema.
 */
export const RESERVED_INSTITUTION_CODES = new Set([
  "academic", "achievements", "analytics", "announcements", "attendance",
  "classes", "dashboard", "discipline", "examinations", "import", "library", "login",
  "mentoring", "module-unavailable", "reports", "scoring", "settings",
  "skills", "staff", "storage", "students", "super-admin", "suspended",
  "users", "portal", "api", "icons", "icon-badge", "favicon.ico",
  "manifest.webmanifest", "robots.txt", "sitemap.xml", "sw.js", "_next",
  "calendar", "substitution", "print", "analysis", "results",
  // §Fee/Accounts bug fix ("Accounts & Fee are not working") — app/(institution)/
  // fees/ and accounts/ are real top-level route folders (Phase D, tasks
  // #428-431) that were never added here. Without this, middleware.ts's
  // resolveInstitutionRouting() treated a bare /fees or /accounts visit as
  // an institution-code-prefixed URL (since neither matched a reserved
  // name), redirecting to /fees/login and setting the active-institution
  // cookie to the nonsense code "fees" — which then cascaded onto every
  // other in-app link for the rest of the session (/fees/dashboard,
  // /fees/students, etc., all 404/redirect-looping since no institution
  // has that code). Reserving them here is what makes /fees and /accounts
  // resolve as real app pages instead.
  "fees", "accounts",
]);
