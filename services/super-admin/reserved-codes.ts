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
]);
