"use client";

/** §491 Print Center follow-up ("Consolidated Mark Sheet ... cumulative")
 *  — same plain GET-form convention as ClassFilterForm on the exam-wise
 *  Consolidated Marks page, just with an academic year picker added since
 *  a cumulative sheet spans every examination in one year rather than
 *  being fixed to a single exam's own URL. */
export default function CumulativeFilterForm({
  academicYears,
  classes,
  academicYearId,
  classId,
}: {
  academicYears: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string }>;
  academicYearId: string;
  classId: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Academic Year</label>
        <select
          name="academicYearId"
          defaultValue={academicYearId}
          className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        >
          {academicYears.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Class</label>
        <select
          name="classId"
          defaultValue={classId}
          className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        >
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
        Filter
      </button>
    </form>
  );
}
