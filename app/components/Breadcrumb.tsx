"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logicalPathname, withInstitutionPrefix } from "./nav-paths";

/**
 * Header title + breadcrumb, shared by (institution)/layout.tsx and
 * (super-admin)/layout.tsx. Client Component (needs usePathname()) with a
 * static route table — dynamic segments (always UUIDs in this app) match
 * "*".
 *
 * §Navigation ("give a proper navigation to the app"):
 *  - every route has a proper title (before, unlisted pages showed their
 *    raw URL segment, e.g. "report-cards", and every page reached through
 *    an institution URL such as /ics/staff showed "staff");
 *  - the parent crumbs are links, and pages below a top-level page get a
 *    back arrow to their parent — the way back on a phone, where the
 *    sidebar is hidden behind the menu button.
 * A crumb's href may contain "*", filled with the current URL's ids in
 * order.
 */
const LOOKS_LIKE_ID = /^[0-9a-f-]{8,}$/i;

type Crumb = [label: string, href?: string];

const STUDENTS: Crumb = ["Students", "/students/directory"];
const EXAMS: Crumb = ["Examinations", "/examinations"];
const RESULTS: Crumb = ["Results", "/results"];
const REPORT_CARDS: Crumb = ["Report cards", "/results/*/report-cards"];
const STAFF: Crumb = ["Staff", "/staff"];
const SUPER: Crumb = ["Super Admin", "/super-admin"];

const ROUTES: Record<string, Crumb[]> = {
  "/dashboard": [["Dashboard"]],
  "/academic": [["Academic structure"]],
  "/academic/promotion": [["Academic structure", "/academic"], ["Promote a class"]],
  "/classes": [["Classes"]],
  "/classes/*": [["Classes", "/classes"], ["Class"]],
  "/students": [STUDENTS, ["Enrollment"]],
  "/students/directory": [STUDENTS, ["Student profiles"]],
  "/students/details": [STUDENTS, ["Complete student details"]],
  "/students/*": [STUDENTS, ["Student profile"]],
  "/students/*/portfolio": [STUDENTS, ["Student profile", "/students/*"], ["Portfolio"]],
  "/attendance": [["Attendance"]],
  "/attendance/register": [["Attendance", "/attendance"], ["Monthly register"]],
  "/examinations": [EXAMS],
  "/examinations/*": [EXAMS, ["Exam details"]],
  "/examinations/*/marks/*": [EXAMS, ["Exam details", "/examinations/*"], ["Mark entry"]],
  "/examinations/*/daily/*": [EXAMS, ["Exam details", "/examinations/*"], ["Daily assessment"]],
  "/examinations/status": [EXAMS, ["Mark entry status"]],
  "/examinations/seating": [EXAMS, ["Seating arrangement"]],
  "/examinations/seating/stickers": [EXAMS, ["Seating arrangement", "/examinations/seating"], ["Desk stickers"]],
  "/results": [RESULTS],
  "/results/cumulative": [RESULTS, ["Cumulative results"]],
  "/results/*/consolidated": [RESULTS, ["Consolidated marks"]],
  "/results/*/report-cards": [RESULTS, ["Report cards"]],
  "/results/*/report-cards/*": [RESULTS, REPORT_CARDS, ["Report card"]],
  "/results/*/report-cards/print-all": [RESULTS, REPORT_CARDS, ["Print all"]],
  "/results/*/report-cards/remarks": [RESULTS, REPORT_CARDS, ["Remarks"]],
  "/analytics": [["Result analysis"]],
  "/analytics/daily-assessments": [["Result analysis", "/analytics"], ["Daily assessments"]],
  "/analysis": [["Analysis"]],
  "/scoring": [["Scoring"]],
  "/skills": [["Skills"]],
  "/achievements": [["Achievements"]],
  "/library": [["Library"]],
  "/staff": [STAFF],
  "/staff/directory": [STAFF, ["Staff profiles"]],
  "/staff/register": [STAFF, ["Monthly register"]],
  "/staff/*": [STAFF, ["Staff profiles", "/staff/directory"], ["Staff profile"]],
  "/discipline": [["Discipline"]],
  "/mentoring": [["Mentoring"]],
  "/substitution": [["Substitution"]],
  "/substitution/report": [["Substitution", "/substitution"], ["Report"]],
  "/substitution/timetable": [["Substitution", "/substitution"], ["Timetable"]],
  "/calendar": [["Academic calendar"]],
  "/fees": [["Fees"]],
  "/accounts": [["Accounts"]],
  "/messages": [["Messages"]],
  "/print": [["Print Center"]],
  "/reports": [["Reports"]],
  "/import": [["Import & Export"]],
  "/announcements": [["Announcements"]],
  "/storage": [["Storage"]],
  "/users": [["Users & roles"]],
  "/settings": [["Settings"]],
  "/settings/grading": [["Settings", "/settings"], ["Grading & scoring"]],
  "/module-unavailable": [["Module unavailable"]],
  "/suspended": [["Account suspended"]],
  "/super-admin": [SUPER],
  "/super-admin/audit": [SUPER, ["Platform audit"]],
  "/super-admin/appearance": [SUPER, ["Appearance"]],
  "/super-admin/sample-portals": [SUPER, ["Sample portals"]],
  "/super-admin/institutions/*": [SUPER, ["Institution"]],
  "/portal/student": [["Student Portal"]],
  "/portal/parent": [["Parent Portal"]],
};

function humanize(segment: string): string {
  const s = segment.replace(/[-_]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Home";
}

export default function Breadcrumb({ institutionCode }: { institutionCode?: string | null }) {
  const rawPathname = usePathname();
  const pathname = logicalPathname(rawPathname, institutionCode);
  const segments = pathname.split("/").filter(Boolean);
  const ids = segments.filter((s) => LOOKS_LIKE_ID.test(s));
  const key = "/" + segments.map((s) => (LOOKS_LIKE_ID.test(s) ? "*" : s)).join("/");

  const fillIds = (href: string) => {
    let n = 0;
    return href.replace(/\*/g, () => ids[n++] ?? "");
  };
  const link = (href: string) => withInstitutionPrefix(fillIds(href), rawPathname, institutionCode);

  const crumbs: Crumb[] = ROUTES[key] ?? [[humanize(segments.filter((s) => !LOOKS_LIKE_ID.test(s)).pop() ?? "")]];
  const parents = crumbs.slice(0, -1);
  const back = [...parents].reverse().find((c) => c[1]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {back?.[1] ? (
        <Link
          href={link(back[1])}
          aria-label={`Back to ${back[0]}`}
          title={`Back to ${back[0]}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-zinc-600 hover:bg-zinc-100"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path fillRule="evenodd" d="M12.8 5.2a.75.75 0 0 1 0 1.06L9.06 10l3.74 3.74a.75.75 0 1 1-1.06 1.06l-4.27-4.27a.75.75 0 0 1 0-1.06L11.74 5.2a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </Link>
      ) : null}
      <div className="min-w-0">
        {parents.length > 0 ? (
          <nav aria-label="Breadcrumb" className="truncate text-xs text-zinc-500">
            {parents.map(([label, href], i) => (
              <span key={`${label}-${i}`}>
                {href ? <Link href={link(href)} className="hover:text-zinc-800 hover:underline">{label}</Link> : label}
                <span className="mx-1.5" aria-hidden="true">/</span>
              </span>
            ))}
          </nav>
        ) : null}
        <div className="truncate text-sm font-semibold text-zinc-900">{crumbs[crumbs.length - 1][0]}</div>
      </div>
    </div>
  );
}
