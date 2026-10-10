import Link from "next/link";
import { monthsAgoIST } from "../../../services/datetime/ist";

/** §Attendance-trend-redesign follow-up ("all classes, months should be
 *  buttons here in two sides, selected, details comes") — was a Class
 *  <select>, a Division <select>, and two native "YYYY-MM" date inputs
 *  ("From month"/"To month") behind a single-selection form. Replaced with
 *  the same pill-<Link> pattern ExaminationPicker.tsx already uses on this
 *  page: classes and months are each their own toggle-able button group
 *  (two columns — "two sides"), both multi-select, so comparing several
 *  classes across a handful of (not necessarily contiguous) months is a
 *  few clicks instead of repeated single-range submits. Division stays a
 *  single-choice row (comparing divisions isn't what was asked for) with
 *  an explicit "All divisions" option that aggregates every division of
 *  each selected class (see getClassAttendanceTrend's nullable sectionId).
 *  Plain Links, not a client component — selection lives entirely in the
 *  URL, consistent with the rest of this page. */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function AttendanceTrendPicker({
  classes,
  sections,
  classIds,
  sectionId,
  months,
  examinationId,
}: {
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; class_id: string; name: string }>;
  classIds: string[];
  sectionId: string;
  months: string[];
  examinationId: string;
}) {
  // Last 12 months, most recent first, as the button pool — a plain,
  // predictable window rather than trying to discover "every month that
  // has any attendance data" with an extra query just for button labels.
  const availableMonths = Array.from({ length: 12 }, (_, i) => monthsAgoIST(i));
  const filteredSections = sections.filter((s) => classIds.length === 0 || classIds.some((cid) => cid === s.class_id));

  function hrefFor(next: { classIds?: string[]; sectionId?: string; months?: string[] }): string {
    const params = new URLSearchParams({
      examinationId,
      trendClassIds: (next.classIds ?? classIds).join(","),
      trendSectionId: next.sectionId ?? sectionId,
      trendMonths: (next.months ?? months).join(","),
    });
    return `?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs text-zinc-500">Classes</label>
          <div className="flex flex-wrap gap-1.5">
            {classes.length === 0 ? <p className="text-sm text-zinc-500">No classes yet.</p> : null}
            {classes.map((c) => {
              const active = classIds.includes(c.id);
              return (
                <Link
                  key={c.id}
                  href={hrefFor({ classIds: toggle(classIds, c.id) })}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {c.name}
                </Link>
              );
            })}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-zinc-500">Months</label>
          <div className="flex flex-wrap gap-1.5">
            {availableMonths.map((m) => {
              const active = months.includes(m);
              return (
                <Link
                  key={m}
                  href={hrefFor({ months: toggle(months, m) })}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {monthLabel(m)}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs text-zinc-500">Division</label>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={hrefFor({ sectionId: "" })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              sectionId === "" ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            All divisions
          </Link>
          {filteredSections.map((s) => {
            const active = sectionId === s.id;
            return (
              <Link
                key={s.id}
                href={hrefFor({ sectionId: s.id })}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {s.name}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
