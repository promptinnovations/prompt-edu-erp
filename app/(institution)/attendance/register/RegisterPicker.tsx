import Link from "next/link";

/** §Attendance-register follow-up ("in monthly register... should be
 *  buttons") — was a Class <select>, a Division <select>, a native
 *  "YYYY-MM" month <input>, and a "Load" submit button. Replaced with the
 *  same pill-<Link> pattern already used on the Analytics page's pickers
 *  (ExaminationPicker.tsx, AttendanceTrendPicker.tsx) — Class and Division
 *  are their own button rows, and Month is a row of the last 12 months, all
 *  single-select since the register itself only ever shows one class/
 *  section/month at a time. Plain Links, not a client component. */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export default function RegisterPicker({
  classes, sections, classId, sectionId, month, availableMonths,
}: {
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; class_id: string; name: string }>;
  classId: string;
  sectionId: string;
  month: string;
  availableMonths: string[];
}) {
  function hrefFor(next: { classId?: string; sectionId?: string; month?: string }): string {
    const params = new URLSearchParams({
      classId: next.classId ?? classId, sectionId: next.sectionId ?? sectionId, month: next.month ?? month,
    });
    return `?${params.toString()}`;
  }
  const filteredSections = sections.filter((s) => !classId || s.class_id === classId);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs text-zinc-500">Class</label>
        <div className="flex flex-wrap gap-1.5">
          {classes.length === 0 ? <p className="text-sm text-zinc-500">No classes yet.</p> : null}
          {classes.map((c) => (
            <Link
              key={c.id}
              href={hrefFor({ classId: c.id, sectionId: c.id === classId ? sectionId : "" })}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                classId === c.id ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
      {classId ? (
        <div>
          <label className="mb-1.5 block text-xs text-zinc-500">Division</label>
          <div className="flex flex-wrap gap-1.5">
            {filteredSections.length === 0 ? <p className="text-sm text-zinc-500">No divisions in this class.</p> : null}
            {filteredSections.map((s) => (
              <Link
                key={s.id}
                href={hrefFor({ sectionId: s.id })}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  sectionId === s.id ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {s.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <label className="mb-1.5 block text-xs text-zinc-500">Month</label>
        <div className="flex flex-wrap gap-1.5">
          {availableMonths.map((m) => (
            <Link
              key={m}
              href={hrefFor({ month: m })}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                month === m ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {monthLabel(m)}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
