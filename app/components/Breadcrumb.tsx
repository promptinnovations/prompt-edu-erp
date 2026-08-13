"use client";

import { usePathname } from "next/navigation";

/**
 * Header title + breadcrumb, shared by (institution)/layout.tsx,
 * (super-admin)/layout.tsx, and (portals)/portal/layout.tsx. Client
 * Component (needs usePathname()) with a small static route->label table —
 * the app's route list is small and fixed enough that this is simpler and
 * more reliable than trying to thread a page title down from every
 * individual page.tsx. Dynamic segments (always UUIDs in this app) are
 * detected generically rather than listed one by one.
 */
const LOOKS_LIKE_ID = /^[0-9a-f-]{8,}$/i;

const LABELS: Record<string, string[]> = {
  "/dashboard": ["Dashboard"],
  "/academic": ["Academic"],
  "/students": ["Students"],
  "/students/*": ["Students", "Student profile"],
  "/students/*/portfolio": ["Students", "Student profile", "Portfolio"],
  "/examinations": ["Examinations"],
  "/examinations/*": ["Examinations", "Exam details"],
  "/examinations/*/marks/*": ["Examinations", "Exam details", "Marks"],
  "/attendance": ["Attendance"],
  "/analytics": ["Analytics"],
  "/skills": ["Skills"],
  "/achievements": ["Achievements"],
  "/scoring": ["Scoring"],
  "/library": ["Library"],
  "/staff": ["Staff"],
  "/discipline": ["Discipline"],
  "/mentoring": ["Mentoring"],
  "/reports": ["Reports"],
  "/import": ["Import & Export"],
  "/announcements": ["Announcements"],
  "/storage": ["Storage"],
  "/users": ["Users"],
  "/settings": ["Settings"],
  "/super-admin": ["Super Admin", "Institutions"],
  "/super-admin/audit": ["Super Admin", "Platform Audit"],
  "/super-admin/institutions/*": ["Super Admin", "Institutions", "Manage modules"],
  "/portal/student": ["Student Portal"],
  "/portal/parent": ["Parent Portal"],
  "/suspended": ["Account suspended"],
  "/module-unavailable": ["Module unavailable"],
};

function normalize(pathname: string): string {
  const parts = pathname.split("/").map((seg) => (LOOKS_LIKE_ID.test(seg) ? "*" : seg));
  return parts.join("/") || "/";
}

export default function Breadcrumb() {
  const pathname = usePathname();
  const crumbs = LABELS[normalize(pathname)] ?? [pathname.split("/").filter(Boolean).pop() ?? "Home"];

  return (
    <div className="min-w-0">
      {crumbs.length > 1 ? (
        <nav aria-label="Breadcrumb" className="truncate text-xs text-zinc-400 dark:text-zinc-500">
          {crumbs.slice(0, -1).map((c) => (
            <span key={c}>
              {c}
              <span className="mx-1.5">/</span>
            </span>
          ))}
        </nav>
      ) : null}
      <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {crumbs[crumbs.length - 1]}
      </div>
    </div>
  );
}
